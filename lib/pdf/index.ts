// Production wiring for "make a PDF" (real Graph, real Firestore). The route calls tryPdf(msg) after tryAppLogin.
import { getLink, updateLink } from '@/lib/wa/links';
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
  let handled: boolean;
  try {
    handled = await handlePdf(defaultPdfDeps, msg);
  } catch (e) {
    // A Firestore/Graph hiccup here must not swallow an ordinary message: let the vault / to-do bot have it.
    console.error('[pdf] tryPdf failed, falling through', msg.id, e);
    return false;
  }
  // handleMessage records the 24 h window; a message the PDF flow took never reaches it. Pages skip this (100 at once
  // would all write the one waLinks doc); pdf / done / cancel are enough to keep the window right.
  if (handled && msg.type === 'text') updateLink(msg.from, { lastInboundAt: msg.timestamp }).catch(() => undefined);
  return handled;
}
