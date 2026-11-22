// Firestore store for PDF sessions: pdfJobs/{waId} (status, startedAt, expiresAt) and one doc per page in
// pdfJobs/{waId}/pages/{wamid}, so 100+ concurrent webhooks never contend on one document. Admin SDK only (no rules needed).
import { adminDb } from '@/lib/server/firebaseAdmin';
import type { PdfPage, PdfSession, PdfStore } from './pdf';

const jobRef = (wa: string) => adminDb().doc(`pdfJobs/${wa}`);
const pagesRef = (wa: string) => adminDb().collection(`pdfJobs/${wa}/pages`);
// A wamid is base64-ish; a '/' in it would turn the doc id into a path.
const pageId = (id: string) => id.replace(/\//g, '_');

export const firestorePdfStore: PdfStore = {
  async get(wa) {
    const snap = await jobRef(wa).get();
    return snap.exists ? (snap.data() as PdfSession) : null;
  },
  async start(wa, s) {
    await adminDb().recursiveDelete(jobRef(wa)); // an old session's pages must not leak into the new one
    await jobRef(wa).set(s);
  },
  async touch(wa, expiresAt) {
    await jobRef(wa).update({ expiresAt }).catch(() => undefined);
  },
  async addPage(wa, p: PdfPage) {
    await pagesRef(wa).doc(pageId(p.id)).set(p);
  },
  async count(wa) {
    const agg = await pagesRef(wa).count().get();
    return agg.data().count;
  },
  async pages(wa) {
    const snap = await pagesRef(wa).get();
    return snap.docs.map((d) => d.data() as PdfPage);
  },
  async lockBuild(wa, now, staleMs) {
    return adminDb().runTransaction(async (tx) => {
      const snap = await tx.get(jobRef(wa));
      if (!snap.exists) return false;
      const s = snap.data() as PdfSession;
      if (s.status === 'building' && s.buildStartedAt && now - s.buildStartedAt < staleMs) return false;
      tx.update(jobRef(wa), { status: 'building', buildStartedAt: now });
      return true;
    });
  },
  async unlock(wa) {
    const { FieldValue } = await import('firebase-admin/firestore');
    await jobRef(wa).update({ status: 'collecting', buildStartedAt: FieldValue.delete() }).catch(() => undefined);
  },
  async clear(wa) {
    await adminDb().recursiveDelete(jobRef(wa));
  },
};
