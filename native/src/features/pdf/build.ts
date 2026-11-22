// Make a PDF: builds the document with pdf-lib (pure JS, on the phone). Bytes are read one file at a time through the injected
// `readBytes`, so this file has no React Native imports and scripts/test_pdf.mts runs it in Node.
import { PDFDocument } from 'pdf-lib';
import type { PdfPage } from './pages';

export const PAGE_WIDTH_PT = 595; // A4 width; the height follows each image's aspect

export interface SkippedPage {
  index: number; // 0-based position in the list
  name: string;
  reason: string;
}

export interface BuildResult {
  bytes: Uint8Array;
  pageCount: number;
  skipped: SkippedPage[];
}

export type BuildProgress = (done: number, total: number) => void;

function label(p: PdfPage, i: number): string {
  return p.name || (p.kind === 'pdf' ? `PDF ${i + 1}` : `Page ${i + 1}`);
}

export async function buildPdf(
  pages: readonly PdfPage[],
  readBytes: (uri: string) => Promise<Uint8Array>,
  onProgress?: BuildProgress,
  /** Lets the UI repaint between pages (setTimeout 0 on the phone). */
  yieldToUi: () => Promise<void> = async () => {},
): Promise<BuildResult> {
  const doc = await PDFDocument.create();
  const skipped: SkippedPage[] = [];
  let pageCount = 0;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    onProgress?.(i + 1, pages.length);
    await yieldToUi();
    try {
      const bytes = await readBytes(p.uri);
      if (p.kind === 'pdf') {
        const src = await PDFDocument.load(bytes);
        const copied = await doc.copyPages(src, src.getPageIndices());
        for (const c of copied) doc.addPage(c);
        pageCount += copied.length;
      } else {
        const img = await doc.embedJpg(bytes);
        const h = Math.round((PAGE_WIDTH_PT * img.height) / img.width);
        const page = doc.addPage([PAGE_WIDTH_PT, h]);
        page.drawImage(img, { x: 0, y: 0, width: PAGE_WIDTH_PT, height: h });
        pageCount += 1;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      skipped.push({ index: i, name: label(p, i), reason: /encrypt/i.test(msg) ? 'it is password protected' : 'it could not be read' });
    }
  }
  if (pageCount === 0) throw new Error('None of the pages could be read.');
  const bytes = await doc.save();
  return { bytes, pageCount, skipped };
}
