// Production wiring for the file vault (real Graph media download, real Drive, Firestore audit trail).
import { adminDb } from '@/lib/server/firebaseAdmin';
import * as send from '@/lib/wa/send';
import type { InboundMessage } from '@/lib/wa/types';
import { uploadLink } from './link';
import { claimMessage } from '@/lib/wa/sessions';
import { driveConfigured, ensurePath, uploadFile } from './drive';
import { getLink } from '@/lib/wa/links';
import {
  FORWARD_NOTE, LINK_LABEL, handleVault, isPlainForward, registeredFolder, registeredVaultMsg, vaultUsers, type VaultDeps,
} from './vault';

export const defaultVaultDeps: VaultDeps = {
  fetchMedia: send.fetchMedia,
  async save(path, name, mimeType, data) {
    if (!driveConfigured()) throw new Error('Google Drive is not configured (GDRIVE_* env)');
    return uploadFile(await ensurePath(path), name, mimeType, data);
  },
  async record(entry) {
    await adminDb().doc(`vaultUploads/${String(entry.wamid)}`).set(entry);
  },
  sendText: send.sendText,
  sendReaction: send.sendReaction,
  markRead: send.markRead,
  now: () => Date.now(),
  link: uploadLink,
  sendLink: (to, body, url) => send.sendUrlButton(to, body, LINK_LABEL, url),
};

/**
 * Route hook: true when the vault handled the message (the caller must then not run the to-do bot).
 * 1. Allowlisted number (NUDGE_VAULT_USERS): the whole chat goes to the vault, no Nudge account needed.
 * 2. Registered (linked) user: only their files (see registeredVaultMsg). NUDGE_VAULT_REGISTERED=0 switches this off.
 */
export async function tryVault(msg: InboundMessage): Promise<boolean> {
  if (vaultUsers()[msg.from]) return handleVault(defaultVaultDeps, msg);
  if (process.env.NUDGE_VAULT_REGISTERED === '0') return false;
  const m = registeredVaultMsg(msg); // no IO: texts and voice notes cost nothing here
  if (!m) return false;
  const folder = await vaultFolderFor(msg.from);
  if (!folder) return false;
  // A forwarded screenshot may have been meant for the to-do bot: say where it went and how to get it read, once a day.
  const note = isPlainForward(msg)
    ? async () => ((await claimMessage(`fwdnote:${msg.from}:${new Date().toISOString().slice(0, 10)}`)) ? FORWARD_NOTE : null)
    : undefined;
  return handleVault(defaultVaultDeps, m, { [msg.from]: folder }, note);
}

/** Drive folder name for a sender of a finished link upload (allowlist name, else linked user's folder), or null. */
export async function vaultFolderFor(wa: string): Promise<string | null> {
  const listed = vaultUsers()[wa];
  if (listed) return listed;
  if (process.env.NUDGE_VAULT_REGISTERED === '0') return null;
  const link = await getLink(wa);
  if (!link) return null;
  const snap = await adminDb().doc(`users/${link.uid}`).get();
  return registeredFolder((snap.data() as { displayName?: string } | undefined)?.displayName, wa);
}

/** Meta refused a file over 100 MB from this sender (status error 131052): answer with the upload link, once per event. */
export async function tryVaultTooBig(wa: string, key: string): Promise<boolean> {
  const folder = await vaultFolderFor(wa); // allowlist, else a linked user (one read; this status is rare)
  if (!folder) return false;
  if (!(await claimMessage(`big:${key}`))) return true;
  return handleVault(defaultVaultDeps, { id: `big:${key}`, from: wa, timestamp: Date.now(), type: 'other', errorCode: 131052 }, { [wa]: folder });
}
