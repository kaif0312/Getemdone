// "Continue with WhatsApp" for the native app. Server only.
//   POST /api/app/login/start  -> startAppLogin   (appLogins/{pollToken}, appLoginCodes/{code})
//   WhatsApp text "LOGIN <code>" -> tryAppLogin   (finds or creates the account, links the number, marks the login done)
//   GET  /api/app/login/poll   -> pollAppLogin    (done -> Firebase custom token, once)
// The pollToken is the secret the app holds; the code is what the person sends on WhatsApp. Collaborators sit in `deps`
// so the emulator test can stub Firebase Auth and the WhatsApp sends.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { adminAuth, adminDb } from '@/lib/server/firebaseAdmin';
import { timezoneForWaId } from '@/lib/server/users';
import * as sendMod from './send';
import type { InboundMessage, WaLink } from './types';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const LOGIN_TTL_MS = 10 * 60_000;
export const RATE_WINDOW_MS = 10 * 60_000;
export const RATE_MAX = 10;

export const SIGNED_IN = "You're signed in on the Nudge app ✅";
export const CODE_EXPIRED = 'That code expired. Tap Continue with WhatsApp in the app again.';

/** Same defaults as hooks/useNotifications DEFAULT_NOTIFICATION_SETTINGS (that file is a client hook, not importable here). */
const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: true,
  deadlineReminders: true,
  deadlineMinutesBefore: 60,
  noonCheckIn: true,
  commitmentReminders: true,
  friendCompletions: true,
  friendComments: true,
  friendEncouragement: true,
  sound: false,
  vibrate: true,
};

export const deps = {
  now: () => Date.now(),
  createUser: async (displayName: string): Promise<string> => (await adminAuth().createUser({ displayName })).uid,
  deleteUser: async (uid: string): Promise<void> => { await adminAuth().deleteUser(uid); },
  createCustomToken: (uid: string): Promise<string> => adminAuth().createCustomToken(uid),
  sendText: (to: string, text: string) => sendMod.sendText(to, text),
  sendSticker: (to: string, name: sendMod.StickerName) => sendMod.sendSticker(to, name),
};

const loginRef = (t: string) => adminDb().doc(`appLogins/${t}`);
const codeRef = (c: string) => adminDb().doc(`appLoginCodes/${c}`);

function makeCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}

export function loginWaLink(code: string): string {
  return `https://wa.me/${process.env.NUDGE_WA_NUMBER ?? ''}?text=${encodeURIComponent(`LOGIN ${code}`)}`;
}

/** Per-client counter in 10-minute buckets: at most RATE_MAX starts. The key is a hash, raw IPs are not stored. */
async function underRateLimit(clientId: string, now: number): Promise<boolean> {
  const bucket = Math.floor(now / RATE_WINDOW_MS);
  const key = createHash('sha256').update(clientId).digest('hex').slice(0, 32);
  const ref = adminDb().doc(`appLoginRate/${key}_${bucket}`);
  return adminDb().runTransaction(async (tx) => {
    const n = ((await tx.get(ref)).data()?.count as number | undefined) ?? 0;
    if (n >= RATE_MAX) return false;
    tx.set(ref, { count: n + 1, expiresAt: (bucket + 2) * RATE_WINDOW_MS });
    return true;
  });
}

export type StartResult =
  | { ok: true; code: string; waLink: string; pollToken: string; expiresAt: number }
  | { ok: false; reason: 'rate_limited' };

export async function startAppLogin(clientId: string): Promise<StartResult> {
  const now = deps.now();
  if (!(await underRateLimit(clientId || 'unknown', now))) return { ok: false, reason: 'rate_limited' };
  const pollToken = randomBytes(24).toString('base64url'); // 32 chars
  const expiresAt = now + LOGIN_TTL_MS;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    try {
      await codeRef(code).create({ pollToken, expiresAt });
    } catch (e) {
      const c = (e as { code?: number | string }).code;
      if (c === 6 || c === 'already-exists') continue; // code collision: try another
      throw e;
    }
    await loginRef(pollToken).set({ code, status: 'pending', createdAt: now, expiresAt });
    return { ok: true, code, waLink: loginWaLink(code), pollToken, expiresAt };
  }
  throw new Error('could not allocate a login code');
}

export type PollResult = { status: 'pending' } | { status: 'expired' } | { status: 'done'; customToken: string };

export async function pollAppLogin(token: string): Promise<PollResult> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return { status: 'expired' };
  const now = deps.now();
  const ref = loginRef(token);
  // Claim a finished login exactly once: done -> consumed. A pending one just reports its state.
  const claimed = await adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return { s: 'expired' as const };
    const d = s.data() as { status: string; uid?: string; expiresAt: number };
    if (d.status === 'done' && d.uid) {
      tx.update(ref, { status: 'consumed', consumedAt: now });
      return { s: 'done' as const, uid: d.uid };
    }
    if (d.status === 'pending') return { s: now > d.expiresAt ? ('expired' as const) : ('pending' as const) };
    return { s: 'expired' as const };
  });
  if (claimed.s !== 'done') return { status: claimed.s };
  try {
    return { status: 'done', customToken: await deps.createCustomToken(claimed.uid) };
  } catch (e) {
    await ref.update({ status: 'done' }).catch(() => undefined); // let the app's next poll try again
    throw e;
  }
}

function friendCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}

/** The linked account for a number, or a brand-new one (Auth user + users + userKeys docs + waLink). */
export async function findOrCreateAccount(waId: string, profileName?: string): Promise<{ uid: string; created: boolean }> {
  const db = adminDb();
  const linkSnap = await db.doc(`waLinks/${waId}`).get();
  if (linkSnap.exists) {
    const uid = (linkSnap.data() as WaLink).uid;
    if (uid && (await db.doc(`users/${uid}`).get()).exists) {
      await db.doc(`waLinks/${waId}`).update({ lastInboundAt: deps.now() }).catch(() => undefined);
      return { uid, created: false };
    }
  }
  const now = deps.now();
  const tz = timezoneForWaId(waId);
  const name = (profileName ?? '').trim().slice(0, 60) || 'Nudge friend';
  const uid = await deps.createUser(name);
  try {
    await db.doc(`users/${uid}`).set({
      id: uid,
      displayName: name,
      email: '',
      friendCode: friendCode(),
      friends: [],
      createdAt: now,
      streakData: { currentStreak: 0, longestStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} },
      notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
      timezone: tz,
      whatsapp: { waId, linkedAt: now },
    });
    // Same shape the PWA writes on first use (hooks/useEncryption.ts): a 256-bit AES master key, base64 raw.
    await db.doc(`userKeys/${uid}`).set({ masterKey: randomBytes(32).toString('base64'), friendKeys: {}, lastUpdated: now });
    const link: WaLink = {
      waId, uid, linkedAt: now, lastInboundAt: now, timezone: tz,
      checkinTime: '08:00', recapTime: '21:00', friendAlerts: true, muted: false,
    };
    await db.doc(`waLinks/${waId}`).set(link);
  } catch (e) {
    await deps.deleteUser(uid).catch(() => undefined);
    throw e;
  }
  return { uid, created: true };
}

export type RedeemResult = { ok: true; uid: string; created: boolean } | { ok: false; reason: 'invalid' | 'expired' };

export async function redeemAppLogin(waId: string, rawCode: string, profileName?: string): Promise<RedeemResult> {
  const code = String(rawCode ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return { ok: false, reason: 'invalid' };
  const db = adminDb();
  const now = deps.now();
  // Single use: whoever deletes the code doc first owns the login.
  const claimed = await db.runTransaction(async (tx) => {
    const s = await tx.get(codeRef(code));
    if (!s.exists) return { r: 'invalid' as const };
    const c = s.data() as { pollToken: string; expiresAt: number };
    tx.delete(codeRef(code));
    if (now > c.expiresAt) return { r: 'expired' as const };
    return { r: 'ok' as const, pollToken: c.pollToken };
  });
  if (claimed.r !== 'ok') return { ok: false, reason: claimed.r };
  const login = await loginRef(claimed.pollToken).get();
  if (!login.exists || login.data()?.status !== 'pending') return { ok: false, reason: 'invalid' };
  const acct = await findOrCreateAccount(waId, profileName);
  await loginRef(claimed.pollToken).update({ status: 'done', uid: acct.uid, doneAt: now });
  return { ok: true, uid: acct.uid, created: acct.created };
}

const LOGIN_RE = /^login\s+([a-z0-9]{4,12})$/i;

/** Inbound hook: true when the message was a LOGIN command (handled, nothing else should run). Runs before everything else. */
export async function tryAppLogin(msg: InboundMessage): Promise<boolean> {
  if (msg.type !== 'text' || !msg.text) return false;
  const m = LOGIN_RE.exec(msg.text.trim());
  if (!m) return false;
  try {
    const r = await redeemAppLogin(msg.from, m[1], msg.profileName);
    if (!r.ok) {
      await deps.sendText(msg.from, CODE_EXPIRED);
      return true;
    }
    await deps.sendText(msg.from, SIGNED_IN);
    await deps.sendSticker(msg.from, 'blowing').catch(() => undefined); // decoration only
  } catch (e) {
    console.error('[appLogin] failed', e);
    await deps.sendText(msg.from, 'Sorry, something went wrong on my side. Tap Continue with WhatsApp in the app to try again.').catch(() => undefined);
  }
  return true;
}
