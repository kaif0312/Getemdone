// OWNER: agent "transport". waSessions/{waId} (short bot memory) + inbound dedupe (waSeen/{messageId}).
import { adminDb } from '@/lib/server/firebaseAdmin';
import type { WaSession } from './types';

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

export async function getSession(waId: string): Promise<WaSession> {
  const snap = await adminDb().doc(`waSessions/${waId}`).get();
  if (!snap.exists) return { turns: [], lastList: [], updatedAt: 0 };
  const d = snap.data() as Partial<WaSession>;
  return { turns: d.turns ?? [], lastList: d.lastList ?? [], ...(d.lastAction ? { lastAction: d.lastAction } : {}), updatedAt: d.updatedAt ?? 0 };
}

export async function saveSession(waId: string, s: WaSession): Promise<void> {
  const clean: Record<string, unknown> = {
    turns: s.turns.slice(-12),
    lastList: s.lastList,
    updatedAt: s.updatedAt || Date.now(),
  };
  if (s.lastAction) clean.lastAction = s.lastAction;
  // set() without merge so a cleared lastAction really disappears.
  await adminDb().doc(`waSessions/${waId}`).set(clean);
}

/** Returns false if this message id was already processed (Meta retries). `expireAt` is for a Firestore TTL policy. */
export async function claimMessage(messageId: string): Promise<boolean> {
  try {
    await adminDb().doc(`waSeen/${messageId}`).create({ at: Date.now(), expireAt: new Date(Date.now() + TWO_DAYS) }); // Date: Firestore TTL needs a Timestamp field
    return true;
  } catch (e) {
    const code = (e as { code?: number | string }).code;
    if (code === 6 || code === 'already-exists' || /ALREADY_EXISTS/.test(String((e as Error).message))) return false;
    throw e;
  }
}
