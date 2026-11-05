import * as admin from 'firebase-admin';

// Send half of lib/server/expoPush.ts (a Cloud Function cannot import from the Next app). Keep the two in step.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoData {
  type: 'task' | 'friend' | 'inbox';
  taskId?: string;
  friendUid?: string;
}

const isExpoToken = (t: unknown): t is string => typeof t === 'string' && /^(Exponent|Expo)PushToken\[.+\]$/.test(t);

export function expoTokensOf(userData: admin.firestore.DocumentData | undefined): string[] {
  const m = userData?.expoPushTokens;
  if (!m || typeof m !== 'object') return [];
  const out: string[] = [];
  for (const v of Object.values(m as Record<string, { token?: unknown } | null>)) {
    if (isExpoToken(v?.token) && !out.includes(v!.token as string)) out.push(v!.token as string);
  }
  return out;
}

/** Send to the user's native-app devices; removes DeviceNotRegistered tokens. Never throws. Returns accepted count. */
export async function sendExpoToUser(uid: string, userData: admin.firestore.DocumentData | undefined, title: string, body: string, data: ExpoData): Promise<number> {
  const tokens = expoTokensOf(userData);
  if (!tokens.length) return 0;
  let sent = 0;
  const dead: string[] = [];
  try {
    for (let i = 0; i < tokens.length; i += 100) {
      const chunk = tokens.slice(i, i + 100);
      const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk.map((to) => ({ to, title, body, data, sound: 'default', channelId: 'default', priority: 'high' }))),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: { status?: string; details?: { error?: string } }[] };
      if (!res.ok || !Array.isArray(json.data)) {
        console.error('[expoPush] request failed', res.status);
        continue;
      }
      chunk.forEach((tok, j) => {
        const t = json.data![j];
        if (t?.status === 'ok') sent++;
        else if (t?.details?.error === 'DeviceNotRegistered') dead.push(tok);
      });
    }
    if (dead.length) {
      const m = (userData?.expoPushTokens ?? {}) as Record<string, { token?: string }>;
      const ref = admin.firestore().collection('users').doc(uid);
      const args: unknown[] = [];
      for (const [k, v] of Object.entries(m)) {
        if (v?.token && dead.includes(v.token)) args.push(new admin.firestore.FieldPath('expoPushTokens', k), admin.firestore.FieldValue.delete());
      }
      if (args.length) await (ref.update as (...a: unknown[]) => Promise<unknown>).apply(ref, args);
    }
  } catch (e) {
    console.error('[expoPush] failed', e);
  }
  return sent;
}
