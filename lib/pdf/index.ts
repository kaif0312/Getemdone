// Production wiring for "make a PDF" (real Graph, real Firestore). The route calls tryPdf(msg) after tryAppLogin.
import { getLink } from '@/lib/wa/links';
import { claimMessage } from '@/lib/wa/sessions';
import { sendDocumentId, uploadMedia } from '@/lib/wa/media';
import * as send from '@/lib/wa/send';
import type { InboundMessage } from '@/lib/wa/types';
import { handlePdf, type PdfDeps } from './pdf';
import { firestorePdfStore } from './store';

export const defaultPdfDeps: PdfDeps = {
  store: firestorePdfStore,
  fetchMedia: send.fetchMedia,
  getLink: async (wa) => {
    const l = await getLink(wa);
    return l ? { care: l.care, timezone: l.timezone } : null;
  },
  sendText: send.sendText,
  sendReaction: send.sendReaction,
  async sendDocument(to, data, filename, caption) {
    const id = await uploadMedia(data, 'application/pdf', filename);
    return id ? (await sendDocumentId(to, id, filename, caption)) !== null : false;
  },
  claim: claimMessage,
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** True when the PDF flow handled the message (a page for an open session, pdf / done / cancel, a caption "pdf"). */
export async function tryPdf(msg: InboundMessage): Promise<boolean> {
  return handlePdf(defaultPdfDeps, msg);
}
