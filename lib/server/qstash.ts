// QStash (Upstash) glue: ask QStash to call POST /api/reminders/fire at the exact reminder time, and verify that a call
// really came from QStash. No SDK: one fetch, and an HS256 JWT check with node:crypto.
// Env (set by the Vercel Upstash integration): QSTASH_URL, QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY.
// Without QSTASH_TOKEN (local dev, tests) scheduling is a no-op and the 15-min cron is the only trigger.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** QStash's free plan delays messages by at most 7 days; later reminders are caught by the cron when they come due. */
const MAX_DELAY_MS = 6.5 * 24 * 3_600_000;

const origin = () => (process.env.NUDGE_PUBLIC_URL || 'https://getemdone.vercel.app').replace(/\/$/, '');
export const FIRE_PATH = '/api/reminders/fire';

export const qstashEnabled = () => !!process.env.QSTASH_TOKEN && process.env.NUDGE_WA_DRY_RUN !== '1';

/** Schedule the call for `fireAt` (unix ms). Never throws: the cron is the safety net. Returns true if queued. */
export async function scheduleFire(taskId: string, fireAt: number, now: number = Date.now()): Promise<boolean> {
  if (!qstashEnabled() || fireAt - now > MAX_DELAY_MS) return false;
  const base = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/v2/publish/${origin()}${FIRE_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.QSTASH_TOKEN}`,
        'Content-Type': 'application/json',
        'Upstash-Not-Before': String(Math.max(Math.ceil(fireAt / 1000), Math.ceil(now / 1000))),
        'Upstash-Deduplication-Id': `${taskId}-${fireAt}`, // re-saving the same reminder does not queue it twice
        'Upstash-Retries': '3',
      },
      body: JSON.stringify({ taskId, fireAt }),
    });
    if (!res.ok) console.error('[qstash] publish failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.error('[qstash] publish threw', (e as Error).message);
    return false;
  }
}

const b64url = (buf: Buffer) => buf.toString('base64url');

function verifyWith(key: string, jwt: string, body: string, url: string, now: number): boolean {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  const [h, p, sig] = parts;
  const expect = createHmac('sha256', key).update(`${h}.${p}`).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return false;
  let claims: { iss?: string; sub?: string; exp?: number; nbf?: number; body?: string };
  try {
    claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return false;
  }
  const sec = Math.floor(now / 1000);
  if (claims.iss !== 'Upstash' || claims.sub !== url) return false;
  if (typeof claims.exp !== 'number' || claims.exp < sec - 5) return false;
  if (typeof claims.nbf === 'number' && claims.nbf > sec + 5) return false;
  // body claim = base64url(sha256(raw body)); QStash may pad it, so compare without "=".
  const bodyHash = b64url(createHash('sha256').update(body).digest());
  return (claims.body ?? '').replace(/=+$/, '') === bodyHash;
}

/** True if `signature` (the Upstash-Signature header) is valid for this exact raw body and URL. */
export function verifySignature(signature: string | null, body: string, url: string, now: number = Date.now()): boolean {
  if (!signature) return false;
  const keys = [process.env.QSTASH_CURRENT_SIGNING_KEY, process.env.QSTASH_NEXT_SIGNING_KEY].filter((k): k is string => !!k);
  return keys.some((k) => verifyWith(k, signature, body, url, now));
}

export function fireUrl(): string {
  return `${origin()}${FIRE_PATH}`;
}
