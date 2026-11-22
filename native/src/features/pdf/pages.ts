// Make a PDF: pure page-list helpers (no React Native imports, so scripts/test_pdf.mts runs them in Node).
export type PageKind = 'image' | 'pdf';

export interface PdfPage {
  id: string;
  kind: PageKind;
  /** file:// URI of the shrunk JPEG (image) or the picked PDF in the cache. Never base64. */
  uri: string;
  /** Original file name when picked from Files (used by "Sort by name"); empty for camera / library photos. */
  name: string;
  /** Pixel size of the shrunk image (images only), for thumbnails. */
  width?: number;
  height?: number;
}

export const MAX_EDGE = 2000;
export const JPEG_QUALITY = 0.78;

let seq = 0;
export function newPageId(): string {
  seq += 1;
  return `p${Date.now().toString(36)}${seq}`;
}

export function moveBy<T>(list: readonly T[], from: number, delta: number): T[] {
  const to = Math.max(0, Math.min(list.length - 1, from + delta));
  if (from < 0 || from >= list.length || to === from) return list.slice();
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function moveToEdge<T>(list: readonly T[], from: number, edge: 'start' | 'end'): T[] {
  return moveBy(list, from, edge === 'start' ? -from : list.length);
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** Natural, case-insensitive sort by file name (IMG_2 before IMG_10). Pages without a name keep their relative order, after the named ones. */
export function sortByName(list: readonly PdfPage[]): PdfPage[] {
  const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return list
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      if (!a.p.name && !b.p.name) return a.i - b.i;
      if (!a.p.name) return 1;
      if (!b.p.name) return -1;
      return cmp.compare(a.p.name, b.p.name) || a.i - b.i;
    })
    .map((x) => x.p);
}

/** Scale so the long edge is at most `max`; never enlarges. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (!(long > max)) return { width, height };
  const k = max / long;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export function defaultName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `Pages ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A name safe as a file name on iOS/Android caches; falls back to "Pages". */
export function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned || 'Pages';
}

export function isPdfFile(mime: string | undefined, name: string): boolean {
  return mime === 'application/pdf' || /\.pdf$/i.test(name);
}
