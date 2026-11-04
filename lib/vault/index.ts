// Production wiring for the file vault (real Graph media download, real Drive, Firestore audit trail).
import { adminDb } from '@/lib/server/firebaseAdmin';
import * as send from '@/lib/wa/send';
import type { InboundMessage } from '@/lib/wa/types';
import { uploadLink } from './link';
import { driveConfigured, ensurePath, uploadFile } from './drive';
import { handleVault, vaultUsers, type VaultDeps } from './vault';

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
};

/** Route hook: true when the sender is on the vault allowlist and the message was handled. */
export async function tryVault(msg: InboundMessage): Promise<boolean> {
  if (!vaultUsers()[msg.from]) return false;
  return handleVault(defaultVaultDeps, msg);
}
