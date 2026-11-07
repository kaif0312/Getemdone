// Firestore store for meeting notes (Admin SDK only; firestore.rules denies every client).
//   meetingNotes/state          {initAt, lastScanAt, seen[]}
//   meetingDrafts/{docId}       the draft (see DraftDoc in ./service.ts)
// Only single-field queries: no composite index.
import { adminDb } from '@/lib/server/firebaseAdmin';
import type { DraftDoc, NotesStore, ScanState } from './service';

const STALE_APPLYING_MS = 5 * 60_000;

/** Firestore rejects undefined fields. */
const clean = <T extends object>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

export const firestoreStore: NotesStore = {
  async getState() {
    const s = await adminDb().doc('meetingNotes/state').get();
    return s.exists ? (s.data() as ScanState) : null;
  },
  async saveState(st: ScanState) {
    await adminDb().doc('meetingNotes/state').set(st);
  },
  async createDraft(d: DraftDoc) {
    try {
      await adminDb().doc(`meetingDrafts/${d.id}`).create(clean(d));
      return true;
    } catch (e) {
      if ((e as { code?: number }).code === 6) return false; // ALREADY_EXISTS
      throw e;
    }
  },
  async getDraft(id: string) {
    const s = await adminDb().doc(`meetingDrafts/${id}`).get();
    return s.exists ? ({ ...(s.data() as DraftDoc), id }) : null;
  },
  async saveDraft(id: string, patch: Partial<DraftDoc>) {
    await adminDb().doc(`meetingDrafts/${id}`).set(clean(patch), { merge: true });
  },
  async claim(id, from, to, now) {
    const ref = adminDb().doc(`meetingDrafts/${id}`);
    return adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const cur = { ...(snap.data() as DraftDoc), id };
      const stale = to === 'applying' && cur.status === 'applying' && now - (cur.applyingAt ?? 0) > STALE_APPLYING_MS;
      if (!from.includes(cur.status) && !stale) return null;
      tx.update(ref, { status: to, ...(to === 'applying' ? { applyingAt: now } : {}) });
      return { ...cur, status: to };
    });
  },
  async listOpen() {
    const q = await adminDb().collection('meetingDrafts').where('status', 'in', ['pending', 'sent']).get();
    return q.docs.map((d) => ({ ...(d.data() as DraftDoc), id: d.id }));
  },
};
