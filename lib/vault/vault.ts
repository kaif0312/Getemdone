// File vault: people on an allowlist send photos, documents and videos to the Nudge WhatsApp number and the bot files
// them into the owner's Google Drive (lib/vault/drive.ts). They need no Nudge account.
//
// Env: NUDGE_VAULT_USERS = "<wa id>:<Name>,<wa id>:<Name>" (wa id = digits with country code, e.g. 971501234567:Fairooz)
//      NUDGE_VAULT_ROOT = root folder name in Drive (default "Nudge Vault")
//      NUDGE_VAULT_TZ   = IANA zone used in file names (default Asia/Dubai)
// Layout in Drive: <root>/<Name>/<yyyy-mm>/<yyyy-mm-dd>_<HHmm>_<caption or original name>.<ext>
import type { InboundMessage } from '@/lib/wa/types';

export interface VaultDeps {
  fetchMedia(id: string): Promise<{ data: Buffer; mimeType: string }>;
  /** Save into Drive under the folder path; returns the Drive file id. */
  save(path: string[], name: string, mimeType: string, data: Buffer): Promise<{ id: string; link: string | null }>;
  /** Audit trail (Firestore `vaultUploads/{wamid}`). */
  record(entry: Record<string, unknown>): Promise<void>;
  sendText(to: string, body: string): Promise<unknown>;
  sendReaction(to: string, messageId: string, emoji: string): Promise<unknown>;
  markRead(messageId: string, typing?: boolean): Promise<unknown>;
  now(): number;
  /** A fresh signed link to the console's upload page for files over WhatsApp's 100 MB limit. */
  link(wa: string, name: string): string;
}

export const VAULT_HELP = [
  'Send me photos, documents or videos and I file them into Drive. ✅ means saved.',
  '',
  '• Add a caption (e.g. "Ahmed passport") and it goes into the file name.',
  '• For ID or visa scans, send them as *Document* (paperclip → Document) so WhatsApp does not shrink them.',
  '• WhatsApp only carries files up to 100 MB. For bigger ones (long videos) use the upload link below.',
].join('\n');

export const TOO_BIG =
  'That file is too big for WhatsApp (the limit is 100 MB). Upload it with this link instead, it goes straight to Drive and shows progress:';

/** True for text that just asks for the upload link. */
export const wantsLink = (text: string | undefined) => /^\s*(link|upload|big|large|video)\b/i.test(text ?? '');

/** Parse NUDGE_VAULT_USERS into { waId: name }. */
export function vaultUsers(env: string | undefined = process.env.NUDGE_VAULT_USERS): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (env ?? '').split(',')) {
    const [id, ...rest] = part.split(':');
    const wa = (id ?? '').replace(/\D/g, '');
    const name = rest.join(':').trim();
    if (wa && name) out[wa] = name;
  }
  return out;
}

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'application/msword': 'doc', 'text/plain': 'txt', 'text/csv': 'csv', 'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/zip': 'zip',
};

/** Drive-safe file-name part: no path or control characters, collapsed spaces, bounded length. */
export function cleanName(s: string, max = 80): string {
  return s
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, max)
    .trim();
}

function splitExt(filename: string): { base: string; ext: string } {
  const m = /^(.*?)(?:\.([A-Za-z0-9]{1,6}))?$/.exec(filename);
  return { base: m?.[1] ?? filename, ext: (m?.[2] ?? '').toLowerCase() };
}

/** yyyy-mm-dd and HHmm of `ms` in zone `tz`. */
export function stamp(ms: number, tz: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}${g('minute')}` };
}

/** The Drive file name for one received message. */
export function fileNameFor(msg: InboundMessage, mimeType: string, tz: string): string {
  const { date, time } = stamp(msg.timestamp, tz);
  const orig = msg.media?.filename ? splitExt(msg.media.filename) : null;
  const ext = orig?.ext || MIME_EXT[mimeType.split(';')[0].trim().toLowerCase()] || 'bin';
  const caption = msg.text ? cleanName(msg.text, 60) : '';
  const label = caption || (orig ? cleanName(orig.base, 60) : '') || (msg.type === 'image' ? 'photo' : msg.type === 'video' ? 'video' : 'file');
  return `${date}_${time}_${label}.${ext}`;
}

const FILE_TYPES = new Set<InboundMessage['type']>(['image', 'document', 'video']);

/** True when the message was handled by the vault (the caller must then not run the normal bot). */
export async function handleVault(d: VaultDeps, msg: InboundMessage, users: Record<string, string> = vaultUsers()): Promise<boolean> {
  const who = users[msg.from];
  if (!who) return false;
  if (msg.type === 'reaction') return true;

  if (msg.errorCode === 131052) {
    await d.sendText(msg.from, `${TOO_BIG}\n${d.link(msg.from, who)}`);
    return true;
  }
  if (!FILE_TYPES.has(msg.type) || !msg.media) {
    const link = d.link(msg.from, who);
    await d.sendText(msg.from, wantsLink(msg.text) ? `Upload link (valid 6 hours, any size):\n${link}` : `${VAULT_HELP}\n\n${link}`);
    return true;
  }
  d.markRead(msg.id).catch(() => undefined);

  const tz = process.env.NUDGE_VAULT_TZ || 'Asia/Dubai';
  const root = cleanName(process.env.NUDGE_VAULT_ROOT || 'Nudge Vault') || 'Nudge Vault';
  let name = '';
  try {
    const m = await d.fetchMedia(msg.media.id);
    const mime = (m.mimeType || msg.media.mimeType).split(';')[0].trim();
    name = fileNameFor(msg, mime, tz);
    const { date } = stamp(msg.timestamp, tz);
    const saved = await d.save([root, cleanName(who), date.slice(0, 7)], name, mime, m.data);
    await d.record({ wamid: msg.id, from: msg.from, who, name, driveId: saved.id, mime, bytes: m.data.length, caption: msg.text ?? null, at: d.now() })
      .catch((e) => console.error('[vault] audit write failed', e));
    await d.sendReaction(msg.from, msg.id, '✅').catch(() => undefined);
  } catch (e) {
    console.error('[vault] save failed', msg.id, e);
    await d.sendText(msg.from, `❌ Could not save ${name || 'that file'}. Please send it again. If it keeps failing, tell Ibrahim.`).catch(() => undefined);
  }
  return true;
}
