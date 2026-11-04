// Signed upload links for files too big for WhatsApp (over 100 MB the Cloud API refuses them).
// The Iskaria console serves the upload page and verifies this token with the SAME secret (NUDGE_FORWARD_SECRET), so
// the token is just `base64url(JSON) + "." + hex(HMAC-SHA256(secret, base64urlPart))`. Contract: the console's docs/agents/vault.md.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const LINK_TTL_MS = 6 * 60 * 60_000;

function secret(): string {
  const s = process.env.NUDGE_FORWARD_SECRET;
  if (!s) throw new Error('NUDGE_FORWARD_SECRET is not set');
  return s;
}

const mac = (part: string) => createHmac('sha256', secret()).update(part, 'utf8').digest('hex');

export function signUploadToken(wa: string, name: string, now: number = Date.now(), ttlMs: number = LINK_TTL_MS): string {
  const part = Buffer.from(JSON.stringify({ wa, name, exp: now + ttlMs }), 'utf8').toString('base64url');
  return `${part}.${mac(part)}`;
}

export function verifyUploadToken(token: string, now: number = Date.now()): { wa: string; name: string; exp: number } | null {
  const [part, sig] = token.split('.');
  if (!part || !sig) return null;
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(mac(part), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { wa?: unknown; name?: unknown; exp?: unknown };
    if (typeof j.wa !== 'string' || typeof j.name !== 'string' || typeof j.exp !== 'number' || j.exp < now) return null;
    return { wa: j.wa, name: j.name, exp: j.exp };
  } catch {
    return null;
  }
}

/** Where people open the upload page (the console). */
export function uploadLink(wa: string, name: string): string {
  const base = (process.env.VAULT_UPLOAD_BASE || 'https://app.iskaria.com').replace(/\/$/, '');
  return `${base}/vault/${signUploadToken(wa, name)}`;
}
