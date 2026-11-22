// "Make a PDF" on WhatsApp: trigger words, ordering, zip natural sort, the build (images, zip, PDF) and the conversation.
// No Firestore, no network, no Gemini. Run: npx tsx scripts/tests/test_pdf.mts
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import {
  MSG, assemble, buildPdfs, classify, collectItems, fitItems, handlePdf, isPdfStart, memoryStore, naturalCompare, orderPages, pdfCommand,
  zipImageNames, type PdfDeps, type PdfPage,
} from '../../lib/pdf/pdf';
import type { InboundMessage } from '../../lib/wa/types';

// ---- trigger words
for (const t of ['pdf', 'PDF', '/pdf', 'make pdf', 'Make a PDF', 'make a pdf.', '  /Pdf!  ', 'make   a   pdf?', '/make pdf']) assert.equal(isPdfStart(t), true, t);
for (const t of ['send the pdf to Ali', 'pdf please', 'my pdf', 'pdf of passport', 'make a pdf of this', 'pdfs', 'a pdf', '', undefined]) assert.equal(isPdfStart(t), false, String(t));
assert.equal(pdfCommand('done'), 'done');
assert.equal(pdfCommand('/Done.'), 'done');
assert.equal(pdfCommand(' cancel! '), 'cancel');
assert.equal(pdfCommand('done 2'), null);
assert.equal(pdfCommand('/done 1,3'), null);
assert.equal(pdfCommand('done with gym'), null);

// ---- classify
const im = (type: InboundMessage['type'], mimeType: string, filename?: string): Pick<InboundMessage, 'type' | 'media'> => ({ type, media: { id: 'm', mimeType, filename } });
assert.equal(classify(im('image', 'image/jpeg')), 'image');
assert.equal(classify(im('document', 'application/pdf', 'a.pdf')), 'pdf');
assert.equal(classify(im('document', 'application/octet-stream', 'Scan.PDF')), 'pdf');
assert.equal(classify(im('document', 'application/zip', 'x.zip')), 'zip');
assert.equal(classify(im('document', 'application/x-zip-compressed')), 'zip');
assert.equal(classify(im('document', 'image/heic', 'IMG_1.HEIC')), 'image');
assert.equal(classify(im('document', 'application/octet-stream', 'photo.jpg')), 'image');
assert.equal(classify(im('document', 'application/msword', 'cv.docx')), null);
assert.equal(classify(im('video', 'video/mp4')), null);
assert.equal(classify({ type: 'image' }), null);

// ---- ordering
assert.deepEqual(['IMG_10.jpg', 'IMG_2.jpg', 'img_1.JPG'].sort(naturalCompare), ['img_1.JPG', 'IMG_2.jpg', 'IMG_10.jpg']);
assert.deepEqual(
  zipImageNames(['b/IMG_10.jpg', 'b/IMG_2.jpg', '__MACOSX/b/._IMG_2.jpg', 'b/.DS_Store', 'b/', 'b/notes.txt', 'b/.hidden.jpg', 'a.PNG', 'b/doc.pdf', 'b/IMG_1.heic']),
  ['a.PNG', 'b/IMG_1.heic', 'b/IMG_2.jpg', 'b/IMG_10.jpg'],
);
const mk = (id: string, ts: number, seq: number): PdfPage => ({ id, mediaId: id, mime: 'image/jpeg', ts, seq, kind: 'image' });
assert.deepEqual(orderPages([mk('c', 3, 1), mk('b', 2, 9), mk('a2', 1, 2), mk('a1', 1, 1)]).map((p) => p.id), ['a1', 'a2', 'b', 'c']);

// ---- media fixtures
const jpg = (w: number, h: number, orientation?: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } }).jpeg().withMetadata(orientation ? { orientation } : {}).toBuffer();
const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.5 } } }).png().toBuffer();
async function pdfOf(n: number): Promise<Buffer> {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage([300, 400]);
  return Buffer.from(await d.save());
}
const media = new Map<string, { data: Buffer; mimeType: string }>();
const put = (id: string, data: Buffer, mimeType = 'image/jpeg') => media.set(id, { data, mimeType });
let fetched = 0;
const fetchMedia = async (id: string) => { fetched++; const m = media.get(id); if (!m) throw new Error('expired ' + id); return m; };
const clock = { t: Date.UTC(2026, 10, 22, 10, 0, 0) };
const now = () => clock.t;

put('p1', await jpg(400, 200));            // landscape 2:1 -> 595 x ~298
put('p2', await jpg(400, 200, 6));         // EXIF 6 = rotated: becomes portrait 1:2 -> 595 x ~1190
put('p3', await png(300, 300));            // PNG with alpha -> square
put('bad', Buffer.from('this is not an image'));
put('gone', Buffer.alloc(0)); media.delete('gone');
put('pdf3', await pdfOf(3), 'application/pdf');
put('zip', Buffer.from(zipSync({
  'trip/IMG_10.jpg': new Uint8Array(await jpg(100, 400)), // tall, should be 2nd in the zip
  'trip/IMG_2.jpg': new Uint8Array(await jpg(100, 100)),  // square, 1st
  '__MACOSX/trip/._IMG_2.jpg': new Uint8Array([1, 2, 3]),
  'trip/.DS_Store': new Uint8Array([1]),
  'trip/readme.txt': new Uint8Array([104, 105]),
})), 'application/zip');

const sizes = async (data: Buffer) => { const d = await PDFDocument.load(data); return d.getPages().map((p) => p.getSize()); };
const page = (id: string, kind: PdfPage['kind'], ts: number, seq = ts): PdfPage => ({ id, mediaId: id, mime: 'x', ts, seq, kind });

// ---- build: images + zip + pdf in order, bad files skipped and counted
{
  const r = await buildPdfs({ fetchMedia, now }, [
    page('zip', 'zip', 4), page('p2', 'image', 2), page('bad', 'image', 3), page('p1', 'image', 1), page('pdf3', 'pdf', 5), page('gone', 'image', 6), page('p3', 'image', 7),
  ]);
  assert.equal(r.parts.length, 1);
  assert.equal(r.skipped, 2); // bad bytes + expired media
  assert.equal(r.pages, 1 + 1 + 2 + 3 + 1); // p1, p2, zip(2), pdf(3), p3
  const s = await sizes(r.parts[0].data);
  assert.equal(s.length, r.pages);
  assert.ok(s.every((x) => x.width === 595 || x.width === 300), 'image pages are A4 wide, PDF pages keep their size');
  assert.deepEqual(s.map((x) => Math.round(x.height)), [298, 1190, 595, 2380, 400, 400, 400, 595]); // p1, p2 (rotated), zip IMG_2, IMG_10, pdf x3, p3
  assert.ok(r.parts[0].data.subarray(0, 5).toString() === '%PDF-');
}
// nothing usable
{
  const r = await buildPdfs({ fetchMedia, now }, [page('bad', 'image', 1)]);
  assert.equal(r.parts.length, 0);
  assert.equal(r.skipped, 1);
}
// a corrupt zip is one skipped file, and large images are shrunk to <= 2000 px
{
  put('badzip', Buffer.from('PK nope'), 'application/zip');
  put('big', await jpg(4000, 3000));
  const { items, skipped } = await collectItems({ fetchMedia, now }, [page('badzip', 'zip', 1), page('big', 'image', 2)]);
  assert.equal(skipped, 1);
  assert.equal(items.length, 1);
  assert.ok(items[0].k === 'img' && items[0].w === 2000 && items[0].h === 1500);
}
// size limit: lower quality first, then split into parts that each fit
{
  const { items } = await collectItems({ fetchMedia, now }, [page('p1', 'image', 1), page('p2', 'image', 2), page('p3', 'image', 3)]);
  assert.equal((await fitItems(items)).length, 1);
  const split = await fitItems(items, 1); // nothing fits in 1 byte -> one item per part
  assert.equal(split.length, 3);
  const a = await assemble(split[1]);
  assert.equal(a.pages, 1);
}

// ---- conversation
const U = '971500000001';
let seq = 0;
const msg = (over: Partial<InboundMessage>): InboundMessage => ({ id: `wamid.${++seq}`, from: U, timestamp: clock.t + seq * 1000, type: 'text', ...over });
const text = (t: string) => msg({ text: t });
const photo = (mediaId: string, caption?: string) => msg({ type: 'image', media: { id: mediaId, mimeType: 'image/jpeg' }, ...(caption ? { text: caption } : {}) });
const doc = (mediaId: string, mimeType: string, filename: string, caption?: string) => msg({ type: 'document', media: { id: mediaId, mimeType, filename }, ...(caption ? { text: caption } : {}) });

function rig(link: { care?: boolean; timezone?: string } | null = { timezone: 'Asia/Dubai' }) {
  const log = { texts: [] as string[], reactions: [] as string[], docs: [] as { name: string; caption: string; bytes: Buffer }[] };
  const seen = new Set<string>();
  const state = { sendOk: true };
  const store = memoryStore();
  const d: PdfDeps = {
    store, fetchMedia, now,
    getLink: async () => link,
    sendText: async (_t, b) => { log.texts.push(b); },
    sendReaction: async (_t, _id, e) => { log.reactions.push(e); },
    sendDocument: async (_t, bytes, name, caption) => { if (!state.sendOk) return false; log.docs.push({ name, caption, bytes }); return true; },
    claim: async (k) => (seen.has(k) ? false : (seen.add(k), true)),
    sleep: async () => undefined,
  };
  return { d, log, store, state };
}

// start, non-triggers, pages, throttled acks, done
{
  const { d, log, store } = rig();
  assert.equal(await handlePdf(d, text('send the pdf to Ali')), false);
  assert.equal(await handlePdf(d, text('done')), false, 'no session: the to-do bot keeps done');
  assert.equal(await handlePdf(d, text('cancel')), false);
  assert.equal(await handlePdf(d, photo('p1')), false, 'no session, no caption: normal handling');
  assert.equal(await handlePdf(d, text('make a pdf')), true);
  assert.deepEqual(log.texts, [MSG.start]);
  assert.equal((await store.get(U))?.status, 'collecting');
  assert.equal(await handlePdf(d, text('pdf')), true);
  assert.match(log.texts[1], /already collecting/);

  log.texts.length = 0;
  assert.equal(await handlePdf(d, photo('p2')), true); // sent first but...
  assert.equal(await handlePdf(d, photo('p1')), true);
  assert.equal(await handlePdf(d, doc('zip', 'application/zip', 'trip.zip')), true);
  assert.equal(await handlePdf(d, doc('pdf3', 'application/pdf', 'a.pdf')), true);
  assert.equal(await handlePdf(d, text('done 2')), false, 'done with a number is never the PDF flow');
  assert.equal(log.reactions.length, 4);
  assert.equal(log.texts.length, 1, 'one "Got N" text inside the 20 s bucket');
  assert.equal(log.texts[0], MSG.got(1));
  clock.t += 25_000;
  await handlePdf(d, photo('p3'));
  assert.equal(log.texts[1], MSG.got(5));
  assert.equal(await handlePdf(d, doc('x', 'application/msword', 'cv.docx')), false, 'other documents are not pages');

  assert.equal(await handlePdf(d, text('/done')), true);
  assert.equal(log.texts[2], MSG.making(5, true));
  assert.equal(log.docs.length, 1);
  assert.equal(log.docs[0].name, 'Pages-2026-11-22-8p.pdf'); // p1 p2 zip(2) pdf(3) p3 = 8
  assert.equal(log.docs[0].caption, 'Your PDF: 8 pages');
  assert.equal((await PDFDocument.load(log.docs[0].bytes)).getPageCount(), 8);
  assert.equal(await store.get(U), null, 'session dropped after sending');
  assert.equal(await handlePdf(d, text('done')), false);
}

// skipped files are mentioned; failure keeps the session and done retries
{
  const { d, log, store, state } = rig();
  await handlePdf(d, text('/pdf'));
  await handlePdf(d, photo('p1')); await handlePdf(d, photo('bad')); await handlePdf(d, photo('p3'));
  state.sendOk = false;
  log.texts.length = 0;
  assert.equal(await handlePdf(d, text('done')), true);
  assert.equal(log.texts.at(-1), MSG.failed);
  assert.equal((await store.get(U))?.status, 'collecting');
  assert.equal(await store.count(U), 3);
  state.sendOk = true;
  await handlePdf(d, text('done'));
  assert.equal(log.docs[0].caption, "Your PDF: 2 pages (skipped 1 file I couldn't open)");
  assert.equal(await store.get(U), null);
}

// nothing usable keeps the session; empty done; cancel; building lock; expiry
{
  const { d, log, store } = rig();
  await handlePdf(d, text('pdf'));
  await handlePdf(d, text('done'));
  assert.equal(log.texts.at(-1), MSG.empty);
  await handlePdf(d, photo('bad'));
  await handlePdf(d, text('done'));
  assert.equal(log.texts.at(-1), MSG.nothing);
  assert.ok(await store.get(U));
  assert.equal(await store.lockBuild(U, now(), 60_000), true);
  await handlePdf(d, text('done'));
  assert.equal(log.texts.at(-1), MSG.building);
  assert.equal(await handlePdf(d, photo('p1')), true, 'pages during a build are swallowed with a note');
  await store.unlock(U);
  await handlePdf(d, text('cancel'));
  assert.equal(log.texts.at(-1), MSG.cancelled);
  assert.equal(await store.get(U), null);

  await handlePdf(d, text('pdf'));
  clock.t += 61 * 60_000; // 61 minutes with no page: expired
  assert.equal(await handlePdf(d, photo('p1')), false, 'after expiry pages go back to normal handling');
  assert.equal(await handlePdf(d, text('done')), false);
  // an active session keeps being extended by new pages
  await handlePdf(d, text('pdf'));
  clock.t += 50 * 60_000;
  await handlePdf(d, photo('p1'));
  clock.t += 50 * 60_000;
  assert.equal(await handlePdf(d, photo('p2')), true, '50 + 50 minutes still alive because the first page extended it');
}

// shortcuts: captioned zip / pdf build at once; captioned photo starts a session as page 1
{
  const { d, log, store } = rig();
  assert.equal(await handlePdf(d, doc('zip', 'application/zip', 'trip.zip', 'pdf')), true);
  assert.equal(log.docs.length, 1);
  assert.equal((await PDFDocument.load(log.docs[0].bytes)).getPageCount(), 2);
  assert.equal(await store.get(U), null, 'no session for the shortcut');
  assert.equal(await handlePdf(d, doc('pdf3', 'application/pdf', 'a.pdf', 'PDF')), true);
  assert.equal(log.docs.length, 2);
  assert.equal(await handlePdf(d, doc('zip', 'application/zip', 'trip.zip', 'save trip')), false, 'other captions go to the vault');
  assert.equal(await handlePdf(d, photo('p1', 'pdf')), true);
  assert.equal((await store.get(U))?.status, 'collecting');
  assert.equal(await store.count(U), 1);
  assert.equal(log.texts.at(-2), MSG.start);
}

// unlinked users and care contacts are left alone
for (const link of [null, { care: true }]) {
  const { d, log } = rig(link);
  assert.equal(await handlePdf(d, text('pdf')), false);
  assert.equal(await handlePdf(d, photo('p1', 'pdf')), false);
  assert.equal(await handlePdf(d, doc('zip', 'application/zip', 'a.zip', 'pdf')), false);
  assert.equal(log.texts.length + log.docs.length, 0);
}

// plain texts cost no IO
{
  const { d } = rig();
  let reads = 0;
  d.getLink = async () => { reads++; return null; };
  d.store.get = async () => { reads++; return null; };
  for (const t of ['hello', 'gym 6pm', 'done 2', 'send the pdf to Ali', '/today']) assert.equal(await handlePdf(d, text(t)), false);
  assert.equal(reads, 0);
}

console.log(`test_pdf: ok (${fetched} media fetches)`);
