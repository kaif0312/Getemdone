// Push to the native (Expo) app. Server only. No SDK: one POST to Expo's push API, batches of <= 100.
// The app stores users/{uid}.expoPushTokens.<sanitizedKey> = { token, platform, updatedAt }. A token the API reports as
// DeviceNotRegistered is removed from that map. Never put decrypted ("e1:") task text in a payload: callers say "a task".
// functions/src/expoPush.ts is a small copy of the send half for the Cloud Function (it cannot import from lib/).
import { FieldPath, FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

export interface ExpoPayload {
  title: string;
  body: string;
  /** Tap routing in the app. */
  data?: { type: 'task' | 'friend' | 'inbox'; taskId?: string; friendUid?: string };
}

export interface ExpoResult {
  /** Tokens Expo accepted. */
  sent: number;
  /** Tokens Expo reported as DeviceNotRegistered (removed from the user doc when a uid is known). */
  dead: string[];
  /** Tokens that failed for another reason, or the whole request failed. */
  errors: number;
}

const isExpoToken = (t: unknown): t is string => typeof t === 'string' && /^(Exponent|Expo)PushToken\[.+\]$/.test(t);

/** Token strings in a user doc's expoPushTokens map (any shape of key). */
export function expoTokensOf(userData: Record<string, unknown> | undefined | null): string[] {
  const m = userData?.expoPushTokens;
  if (!m || typeof m !== 'object') return [];
  const out: string[] = [];
  for (const v of Object.values(m as Record<string, unknown>)) {
    const t = (v as { token?: unknown } | null)?.token;
    if (isExpoToken(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

async function postBatch(messages: Record<string, unknown>[]): Promise<{ ok: boolean; tickets: { status?: string; details?: { error?: string } }[] }> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
    const json = (await res.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } }[] };
    if (!res.ok || !Array.isArray(json.data)) {
      console.error('[expoPush] request failed', res.status);
      return { ok: false, tickets: [] };
    }
    return { ok: true, tickets: json.data };
  } catch (e) {
    console.error('[expoPush] request threw', e);
    return { ok: false, tickets: [] };
  }
}

/** Drop dead tokens from users/{uid}.expoPushTokens. */
async function removeTokens(uid: string, dead: string[]): Promise<void> {
  const ref = adminDb().doc(`users/${uid}`);
  const snap = await ref.get();
  const m = (snap.data()?.expoPushTokens ?? {}) as Record<string, { token?: string }>;
  const args: (FieldPath | FieldValue)[] = [];
  for (const [k, v] of Object.entries(m)) {
    if (v?.token && dead.includes(v.token)) args.push(new FieldPath('expoPushTokens', k), FieldValue.delete());
  }
  if (args.length) await ref.update(args[0] as FieldPath, args[1], ...args.slice(2));
}

/**
 * Send to a user's Expo tokens (`target` = uid string) or to explicit tokens (`target` = string[], pass `opts.uid` so dead
 * ones can be removed). Never throws: a push failing must not break the caller.
 */
export async function sendExpoPush(target: string | string[], payload: ExpoPayload, opts: { uid?: string } = {}): Promise<ExpoResult> {
  const result: ExpoResult = { sent: 0, dead: [], errors: 0 };
  let uid = opts.uid;
  let tokens: string[];
  try {
    if (typeof target === 'string') {
      uid = target;
      const snap = await adminDb().doc(`users/${target}`).get();
      tokens = expoTokensOf(snap.data());
    } else {
      tokens = target.filter(isExpoToken);
    }
    for (let i = 0; i < tokens.length; i += BATCH) {
      const chunk = tokens.slice(i, i + BATCH);
      const r = await postBatch(
        chunk.map((to) => ({
          to,
          title: payload.title,
          body: payload.body,
          sound: 'default',
          channelId: 'default',
          priority: 'high',
          ...(payload.data ? { data: payload.data } : {}),
        })),
      );
      if (!r.ok) { result.errors += chunk.length; continue; }
      chunk.forEach((tok, j) => {
        const t = r.tickets[j];
        if (t?.status === 'ok') result.sent++;
        else if (t?.details?.error === 'DeviceNotRegistered') result.dead.push(tok);
        else result.errors++;
      });
    }
    if (uid && result.dead.length) await removeTokens(uid, result.dead);
  } catch (e) {
    console.error('[expoPush] failed', e);
    result.errors++;
  }
  return result;
}
