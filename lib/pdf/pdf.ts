// "Make a PDF" on WhatsApp (2026-11-22): a linked user sends pages (photos, zips of photos, PDFs), types *done*, and gets one PDF
// back in the same chat. No Gemini anywhere. Pure logic + the build; Firestore and Graph are injected (see index.ts), so the
// test (scripts/tests/test_pdf.mts) runs with in-memory fakes.
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import sharp from 'sharp';
import type { InboundMessage } from '@/lib/wa/types';

// ---------- tunables
export const SESSION_TTL_MS = 60 * 60_000; // from the last page
const TOUCH_EVERY_MS = 60_000; // refresh the expiry at most once a minute (100 concurrent webhooks must not fight over one doc)
const ACK_BUCKET_MS = 20_000; // at most one "Got N pages" text per bucket
const BUILD_STALE_MS = 6 * 60_000; // a "building" lock older than this is a crashed build: retry is allowed
const PAGE_WIDTH_PT = 595; // A4 width
const FETCH_CHUNK = 8;
export const MAX_PDF_BYTES = 90 * 1024 * 1024; // WhatsApp documents are capped at 100 MB
const BUILD_BUDGET_MS = 200_000; // downloads + decoding; route maxDuration is 300 s and the re-encode, assemble and upload still follow
const MAX_ZIP_ENTRY_BYTES = 60 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 400 * 1024 * 1024; // unzipped bytes held in memory at once (the function has 2 GB)

// ---------- trigger words
/** Bare "pdf", "/pdf", "make pdf", "make a pdf" (any case, trailing punctuation). Anything longer ("send the pdf to Ali") is not a start. */
export function isPdfStart(text: string | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/^\/+/, '').replace(/[\s.!?]+$/g, '').replace(/\s+/g, ' ');
  return /^(pdf|make (a )?pdf)$/.test(t);
}

/** `done` / `/done` / `cancel` / `/cancel` alone. "done 2" is the to-do bot's and never matches. Only meaningful while a session is open. */
export function pdfCommand(text: string | undefined): 'done' | 'cancel' | null {
  if (!text) return null;
  const t = text.trim().toLowerCase().replace(/^\/+/, '').replace(/[\s.!]+$/g, '');
  return t === 'done' ? 'done' : t === 'cancel' ? 'cancel' : null;
}

// ---------- what counts as a page
export type PageKind = 'image' | 'pdf' | 'zip';
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|tiff?|bmp|avif)$/i;

export function classify(msg: Pick<InboundMessage, 'type' | 'media'>): PageKind | null {
  const m = msg.media;
  if (!m) return null;
  const mime = (m.mimeType || '').toLowerCase();
  const name = m.filename || '';
  if (msg.type === 'image') return mime.startsWith('image/') || !mime ? 'image' : null;
  if (msg.type !== 'document') return null;
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (/zip/.test(mime) || /\.zip$/i.test(name)) return 'zip';
  if (mime.startsWith('image/') || IMAGE_EXT.test(name)) return 'image';
  return null;
}

// ---------- ordering
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** Natural order: IMG_2 before IMG_10. */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

export interface PdfPage {
  id: string; // wamid
  mediaId: string;
  mime: string;
  filename?: string;
  ts: number; // WhatsApp message timestamp, ms
  seq: number; // arrival order on our side
  kind: PageKind;
}

/** WhatsApp timestamp first, then the order the messages reached us. */
export function orderPages<T extends { ts: number; seq: number }>(pages: T[]): T[] {
  return [...pages].sort((a, b) => a.ts - b.ts || a.seq - b.seq);
}

/** Image entries of a zip in natural filename order, without macOS junk, dotfiles, folders and non-images. */
export function zipImageNames(names: string[]): string[] {
  return names
    .filter((n) => {
      if (!n || n.endsWith('/')) return false;
      if (/(^|\/)__MACOSX(\/|$)/.test(n)) return false;
      const base = n.split('/').pop() ?? '';
      if (!base || base.startsWith('.')) return false;
      return IMAGE_EXT.test(base);
    })
    .sort(naturalCompare);
}

let seqCounter = 0;
/** Monotonic within one server instance and roughly ordered across instances (ms clock * 1000 + counter). */
export function nextSeq(now: number): number {
  seqCounter = (seqCounter + 1) % 1000;
  return now * 1000 + seqCounter;
}

// ---------- the build
export type Item =
  | { k: 'img'; jpeg: Buffer; w: number; h: number }
  | { k: 'pdf'; doc: PDFDocument; bytes: number; pages: number };

export interface BuildResult {
  parts: { data: Buffer; pages: number }[];
  pages: number;
  skipped: number;
}

export interface BuildDeps {
  fetchMedia: (mediaId: string) => Promise<{ data: Buffer; mimeType: string }>;
  now: () => number;
}

async function shrink(input: Buffer, edge: number, quality: number): Promise<{ jpeg: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(input, { failOn: 'none' })
    .rotate() // apply EXIF orientation (and drop the tag)
    .flatten({ background: '#ffffff' })
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: false })
    .toBuffer({ resolveWithObject: true });
  return { jpeg: data, w: info.width, h: info.height };
}

const itemBytes = (i: Item) => (i.k === 'img' ? i.jpeg.length : i.bytes);
const itemPages = (i: Item) => (i.k === 'img' ? 1 : i.pages);

/** Run jobs in order, FETCH_CHUNK at a time. A job that returns null or throws is a skipped file. */
async function runJobs(jobs: (() => Promise<Item | null>)[], out: Item[], onSkip: () => void, deadline: () => void): Promise<void> {
  for (let i = 0; i < jobs.length; i += FETCH_CHUNK) {
    deadline();
    const res = await Promise.all(jobs.slice(i, i + FETCH_CHUNK).map((j) => j().catch(() => null)));
    for (const r of res) { if (r) out.push(r); else onSkip(); }
  }
}

/** Download + normalise every page, in order, into embeddable items. */
export async function collectItems(d: BuildDeps, pages: PdfPage[], startedAt = d.now()): Promise<{ items: Item[]; skipped: number }> {
  const items: Item[] = [];
  let skipped = 0;
  const onSkip = () => { skipped++; };
  const deadline = () => { if (d.now() - startedAt > BUILD_BUDGET_MS) throw new Error('build budget exceeded'); };
  let batch: (() => Promise<Item | null>)[] = [];
  const flush = async () => { const b = batch; batch = []; await runJobs(b, items, onSkip, deadline); };

  const imageJob = (get: () => Promise<Buffer>) => async (): Promise<Item | null> => {
    const s = await shrink(await get(), 2000, 78);
    return { k: 'img', ...s };
  };

  for (const p of orderPages(pages)) {
    if (p.kind === 'image') {
      batch.push(imageJob(async () => (await d.fetchMedia(p.mediaId)).data));
      continue;
    }
    await flush(); // keep the order: everything before this PDF/zip first
    deadline();
    try {
      const { data } = await d.fetchMedia(p.mediaId);
      if (p.kind === 'pdf') {
        const doc = await PDFDocument.load(data);
        items.push({ k: 'pdf', doc, bytes: data.length, pages: doc.getPageCount() });
      } else {
        let total = 0;
        const files = unzipSync(new Uint8Array(data), {
          filter: (f) => {
            if (zipImageNames([f.name]).length === 0) return false;
            if (f.originalSize > MAX_ZIP_ENTRY_BYTES || total + f.originalSize > MAX_ZIP_TOTAL_BYTES) return false;
            total += f.originalSize;
            return true;
          },
        });
        const names = zipImageNames(Object.keys(files));
        const jobs = names.map((n) => imageJob(async () => Buffer.from(files[n])));
        await runJobs(jobs, items, onSkip, deadline);
      }
    } catch (e) {
      if (/budget/.test(String((e as Error)?.message))) throw e;
      skipped++;
    }
  }
  await flush();
  return { items, skipped };
}

/** Lower the image quality until the total fits, else split into parts that each fit. */
export async function fitItems(items: Item[], limit = MAX_PDF_BYTES): Promise<Item[][]> {
  const total = (xs: Item[]) => xs.reduce((n, i) => n + itemBytes(i), 0);
  let cur = items;
  if (total(cur) > limit) {
    // Second pass from the already-shrunk JPEGs: smaller edge, lower quality.
    cur = await Promise.all(cur.map(async (i) => {
      if (i.k !== 'img') return i;
      const s = await shrink(i.jpeg, 1500, 60);
      return { k: 'img' as const, ...s };
    }));
  }
  if (total(cur) <= limit) return [cur];
  const parts: Item[][] = [];
  let part: Item[] = [];
  let size = 0;
  for (const i of cur) {
    if (part.length && size + itemBytes(i) > limit) { parts.push(part); part = []; size = 0; }
    part.push(i);
    size += itemBytes(i);
  }
  if (part.length) parts.push(part);
  return parts;
}

/** One PDF from items: images get a page as wide as A4 and as tall as the picture needs; PDFs are merged page by page. */
export async function assemble(items: Item[]): Promise<{ data: Buffer; pages: number }> {
  const out = await PDFDocument.create();
  for (const it of items) {
    if (it.k === 'img') {
      const img = await out.embedJpg(it.jpeg);
      const h = Math.max(1, Math.round((PAGE_WIDTH_PT * it.h) / it.w));
      const page = out.addPage([PAGE_WIDTH_PT, h]);
      page.drawImage(img, { x: 0, y: 0, width: PAGE_WIDTH_PT, height: h });
    } else {
      const copied = await out.copyPages(it.doc, it.doc.getPageIndices());
      for (const c of copied) out.addPage(c);
    }
  }
  return { data: Buffer.from(await out.save()), pages: out.getPageCount() };
}

export async function buildPdfs(d: BuildDeps, pages: PdfPage[]): Promise<BuildResult> {
  const startedAt = d.now();
  const { items, skipped } = await collectItems(d, pages, startedAt);
  if (items.length === 0) return { parts: [], pages: 0, skipped };
  const groups = await fitItems(items);
  const parts: BuildResult['parts'] = [];
  for (const g of groups) parts.push(await assemble(g));
  return { parts, pages: items.reduce((n, i) => n + itemPages(i), 0), skipped };
}

// ---------- the conversation
export interface PdfSession {
  status: 'collecting' | 'building';
  startedAt: number;
  expiresAt: number;
  buildStartedAt?: number;
}

export interface PdfStore {
  get(wa: string): Promise<PdfSession | null>;
  /** Replace any old session (and its pages) with a fresh collecting one. */
  start(wa: string, s: PdfSession): Promise<void>;
  touch(wa: string, expiresAt: number): Promise<void>;
  addPage(wa: string, p: PdfPage): Promise<void>;
  count(wa: string): Promise<number>;
  pages(wa: string): Promise<PdfPage[]>;
  /** collecting (or a stale building) -> building, atomically. False when another build holds it. */
  lockBuild(wa: string, now: number, staleMs: number): Promise<boolean>;
  unlock(wa: string): Promise<void>;
  clear(wa: string): Promise<void>;
}

export interface PdfDeps extends BuildDeps {
  store: PdfStore;
  /** The sender's Nudge link (null = not linked). care contacts are left alone. */
  getLink: (wa: string) => Promise<{ care?: boolean; timezone?: string } | null>;
  sendText: (to: string, body: string) => Promise<unknown>;
  sendReaction: (to: string, messageId: string, emoji: string) => Promise<unknown>;
  /** Uploads and sends one PDF as a document. Returns false when WhatsApp refused it. */
  sendDocument: (to: string, data: Buffer, filename: string, caption: string) => Promise<boolean>;
  /** True the first time a key is seen (waSeen create-only doc). Used to throttle the "Got N" texts. */
  claim: (key: string) => Promise<boolean>;
  sleep: (ms: number) => Promise<void>;
}

export const MSG = {
  start: "Send me the pages: photos, a zip of photos, or PDFs. Type *done* when you've sent them all (or *cancel*).",
  already: (n: number) => `I'm already collecting pages (${n} so far). Type *done* when you've sent them all (or *cancel*).`,
  got: (n: number) => `Got ${n} page${n === 1 ? '' : 's'} so far. Type *done* when finished.`,
  empty: "I haven't got any pages yet. Send photos, a zip or PDFs, then type *done* (or *cancel*).",
  making: (n: number, files: boolean) => `Making your PDF from ${n} ${files ? 'file' : 'page'}${n === 1 ? '' : 's'}…`,
  makingNow: 'Making your PDF…',
  building: "I'm still making your PDF. Send those pages again once it arrives.",
  cancelled: "Cancelled. I've dropped those pages.",
  nothing: "I couldn't open any of those files, so there is no PDF. Your pages are still here: send more and type *done*, or *cancel*.",
  failed: "Sorry, I couldn't make or send the PDF just now. Your pages are still saved: type *done* to try again (or *cancel*).",
  timeout: 'That was too many pages for one go and I ran out of time. Your pages are still saved: type *done* to try again, or *cancel* and send them in two batches.',
};

const dateIn = (tz: string | undefined, ts: number): string => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC' }).format(ts); } catch { return new Date(ts).toISOString().slice(0, 10); }
};

async function activeSession(d: PdfDeps, wa: string): Promise<PdfSession | null> {
  const s = await d.store.get(wa);
  if (!s || s.expiresAt <= d.now()) return null; // an expired session is ignored
  return s;
}

async function eligible(d: PdfDeps, wa: string): Promise<{ care?: boolean; timezone?: string } | null> {
  const link = await d.getLink(wa);
  return link && !link.care ? link : null;
}

async function startSession(d: PdfDeps, wa: string): Promise<void> {
  const now = d.now();
  await d.store.start(wa, { status: 'collecting', startedAt: now, expiresAt: now + SESSION_TTL_MS });
}

function toPage(msg: InboundMessage, kind: PageKind, now: number): PdfPage {
  const p: PdfPage = { id: msg.id, mediaId: msg.media!.id, mime: msg.media!.mimeType, ts: msg.timestamp, seq: nextSeq(now), kind };
  if (msg.media!.filename) p.filename = msg.media!.filename;
  return p;
}

async function addPage(d: PdfDeps, s: PdfSession, msg: InboundMessage, kind: PageKind): Promise<void> {
  const now = d.now();
  await d.store.addPage(msg.from, toPage(msg, kind, now));
  if (s.expiresAt - now < SESSION_TTL_MS - TOUCH_EVERY_MS) await d.store.touch(msg.from, now + SESSION_TTL_MS);
  await d.sendReaction(msg.from, msg.id, '👍');
  if (await d.claim(`pdfack:${msg.from}:${Math.floor(now / ACK_BUCKET_MS)}`)) {
    await d.sendText(msg.from, MSG.got(await d.store.count(msg.from)));
  }
}

/** Build the PDF(s) from `pages` and send them. Returns true when everything went out. */
async function buildAndSend(d: PdfDeps, wa: string, pages: PdfPage[], tz: string | undefined): Promise<'ok' | 'nothing' | 'timeout' | 'failed'> {
  let res: BuildResult;
  try {
    res = await buildPdfs(d, pages);
  } catch (e) {
    console.error('[pdf] build failed', e);
    return /budget/.test(String((e as Error)?.message)) ? 'timeout' : 'failed';
  }
  if (res.parts.length === 0) return 'nothing';
  const day = dateIn(tz, d.now());
  const n = res.parts.length;
  for (let i = 0; i < n; i++) {
    const part = res.parts[i];
    const name = `Pages-${day}-${part.pages}p${n > 1 ? `-part${i + 1}of${n}` : ''}.pdf`;
    let caption = n > 1 ? `Your PDF, part ${i + 1}/${n}: ${part.pages} pages` : `Your PDF: ${part.pages} page${part.pages === 1 ? '' : 's'}`;
    if (i === n - 1 && res.skipped > 0) caption += ` (skipped ${res.skipped} file${res.skipped === 1 ? '' : 's'} I couldn't open)`;
    if (!(await d.sendDocument(wa, part.data, name, caption))) return 'failed';
  }
  return 'ok';
}

/**
 * The route hook. True = the PDF flow took the message (the caller must not run the vault or the to-do bot).
 * Cheap for everyone else: a text that is not pdf/done/cancel returns before any IO; a photo costs one session read.
 */
export async function handlePdf(d: PdfDeps, msg: InboundMessage): Promise<boolean> {
  const wa = msg.from;
  const now = d.now();

  if (msg.type === 'text') {
    if (isPdfStart(msg.text)) {
      const link = await eligible(d, wa);
      if (!link) return false;
      const s = await activeSession(d, wa);
      if (s && s.status === 'building' && s.buildStartedAt && now - s.buildStartedAt < BUILD_STALE_MS) await d.sendText(wa, MSG.building);
      else if (s) await d.sendText(wa, MSG.already(await d.store.count(wa)));
      else { await startSession(d, wa); await d.sendText(wa, MSG.start); }
      return true;
    }
    const cmd = pdfCommand(msg.text);
    if (!cmd) return false;
    const s = await activeSession(d, wa);
    if (!s) return false; // no session: the to-do bot's own done / cancel
    if (cmd === 'cancel') { await d.store.clear(wa); await d.sendText(wa, MSG.cancelled); return true; }
    const link = await eligible(d, wa);
    if (!link) return false;
    // Pages sent just before *done* can reach us after it: keep collecting for a moment, then lock, then give the
    // webhooks that already saw "collecting" time to finish writing their page.
    await d.sleep(1500);
    if (!(await d.store.lockBuild(wa, d.now(), BUILD_STALE_MS))) { await d.sendText(wa, MSG.building); return true; }
    try {
      await d.sleep(1000);
      const pages = await d.store.pages(wa);
      if (pages.length === 0) { await d.store.unlock(wa); await d.sendText(wa, MSG.empty); return true; }
      await d.sendText(wa, MSG.making(pages.length, pages.some((p) => p.kind !== 'image')));
      const r = await buildAndSend(d, wa, pages, link.timezone);
      if (r === 'ok') { await d.store.clear(wa); return true; }
      await d.store.unlock(wa);
      await d.sendText(wa, r === 'nothing' ? MSG.nothing : r === 'timeout' ? MSG.timeout : MSG.failed);
    } catch (e) {
      console.error('[pdf] done failed', e);
      await d.store.unlock(wa).catch(() => undefined);
      await d.sendText(wa, MSG.failed).catch(() => undefined);
    }
    return true;
  }

  if (msg.type !== 'image' && msg.type !== 'document') return false;
  const kind = classify(msg);
  if (!kind) return false;

  const s = await activeSession(d, wa);
  if (s) {
    if (s.status === 'building' && s.buildStartedAt && now - s.buildStartedAt < BUILD_STALE_MS) {
      if (await d.claim(`pdfbusy:${wa}:${Math.floor(now / ACK_BUCKET_MS)}`)) await d.sendText(wa, MSG.building);
      return true;
    }
    await addPage(d, s, msg, kind);
    return true;
  }

  // No session: only a caption "pdf" does anything.
  if (!isPdfStart(msg.text)) return false;
  const link = await eligible(d, wa);
  if (!link) return false;
  if (kind === 'image') {
    await startSession(d, wa);
    await d.sendText(wa, MSG.start);
    await addPage(d, { status: 'collecting', startedAt: now, expiresAt: 0 }, msg, kind);
    return true;
  }
  // A zip or PDF captioned "pdf": build at once, no session.
  await d.sendReaction(wa, msg.id, '👍');
  await d.sendText(wa, MSG.makingNow);
  const r = await buildAndSend(d, wa, [toPage(msg, kind, now)], link.timezone);
  if (r !== 'ok') await d.sendText(wa, r === 'nothing' ? MSG.nothing : r === 'timeout' ? MSG.timeout : MSG.failed);
  return true;
}

/** In-memory store for tests. */
export function memoryStore(): PdfStore & { sessions: Map<string, PdfSession>; pageMap: Map<string, Map<string, PdfPage>> } {
  const sessions = new Map<string, PdfSession>();
  const pageMap = new Map<string, Map<string, PdfPage>>();
  return {
    sessions, pageMap,
    async get(wa) { return sessions.get(wa) ?? null; },
    async start(wa, s) { sessions.set(wa, s); pageMap.set(wa, new Map()); },
    async touch(wa, expiresAt) { const s = sessions.get(wa); if (s) s.expiresAt = expiresAt; },
    async addPage(wa, p) { pageMap.get(wa)?.set(p.id, p); },
    async count(wa) { return pageMap.get(wa)?.size ?? 0; },
    async pages(wa) { return [...(pageMap.get(wa)?.values() ?? [])]; },
    async lockBuild(wa, now, staleMs) {
      const s = sessions.get(wa);
      if (!s) return false;
      if (s.status === 'building' && s.buildStartedAt && now - s.buildStartedAt < staleMs) return false;
      s.status = 'building'; s.buildStartedAt = now;
      return true;
    },
    async unlock(wa) { const s = sessions.get(wa); if (s) { s.status = 'collecting'; delete s.buildStartedAt; } },
    async clear(wa) { sessions.delete(wa); pageMap.delete(wa); },
  };
}
