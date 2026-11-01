// Daily cap on proactive WhatsApp templates (cost control). Counter doc: waCounters/{date}.
// Shared by social.ts (nudge_friend) and scheduler.ts (nudge_checkin). Env: NUDGE_MAX_TEMPLATES_PER_DAY (default 30).
import { adminDb } from './firebaseAdmin';

export function maxTemplatesPerDay(): number {
  const n = Number(process.env.NUDGE_MAX_TEMPLATES_PER_DAY);
  return Number.isFinite(n) && n >= 0 && process.env.NUDGE_MAX_TEMPLATES_PER_DAY ? n : 30;
}

/** Atomically take one template slot for `date` ("YYYY-MM-DD", server-wide day key). False when the cap is reached. */
export async function reserveTemplateSlot(date: string): Promise<boolean> {
  const db = adminDb();
  const ref = db.doc(`waCounters/${date}`);
  const max = maxTemplatesPerDay();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.data()?.templates as number | undefined) ?? 0;
    if (used >= max) return false;
    tx.set(ref, { templates: used + 1, updatedAt: Date.now() }, { merge: true });
    return true;
  });
}

/** Give a slot back when the send itself failed. */
export async function releaseTemplateSlot(date: string): Promise<void> {
  const db = adminDb();
  const ref = db.doc(`waCounters/${date}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.data()?.templates as number | undefined) ?? 0;
    if (used > 0) tx.set(ref, { templates: used - 1 }, { merge: true });
  });
}

/** UTC day key used for the global counter. */
export function capDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}
