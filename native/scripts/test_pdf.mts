// Make a PDF: page-order helpers + the pdf-lib builder (3 generated JPEGs + 1 PDF + 1 bad file). Run: npm run test:pdf
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { buildPdf, PAGE_WIDTH_PT } from '../src/features/pdf/build';
import { defaultName, fitWithin, moveBy, moveToEdge, removeAt, safeFileName, sortByName, isPdfFile, type PdfPage } from '../src/features/pdf/pages';

const P = (id: string, name = '', kind: 'image' | 'pdf' = 'image'): PdfPage => ({ id, kind, uri: `mem://${id}`, name });
const ids = (l: PdfPage[]) => l.map((p) => p.id).join('');

// order helpers
const l = [P('a'), P('b'), P('c'), P('d')];
assert.equal(ids(moveBy(l, 1, -1)), 'bacd');
assert.equal(ids(moveBy(l, 1, 1)), 'acbd');
assert.equal(ids(moveBy(l, 0, -1)), 'abcd', 'already first');
assert.equal(ids(moveBy(l, 3, 1)), 'abcd', 'already last');
assert.equal(ids(moveToEdge(l, 2, 'start')), 'cabd');
assert.equal(ids(moveToEdge(l, 1, 'end')), 'acdb');
assert.equal(ids(removeAt(l, 2)), 'abd');
assert.equal(l.length, 4, 'helpers never mutate');
assert.equal(ids(sortByName([P('1', 'IMG_10.jpg'), P('2', 'img_2.jpg'), P('3'), P('4', 'IMG_1.jpg')])), '4213', 'natural, case-insensitive, unnamed last');
assert.deepEqual(fitWithin(4000, 3000), { width: 2000, height: 1500 });
assert.deepEqual(fitWithin(3000, 4000), { width: 1500, height: 2000 });
assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 }, 'never enlarges');
assert.equal(defaultName(new Date(2026, 10, 2)), 'Pages 2026-11-02');
assert.equal(safeFileName('  My: file/2?.PDF '), 'My file 2');
assert.equal(safeFileName('///'), 'Pages');
assert.ok(isPdfFile(undefined, 'a.PDF') && isPdfFile('application/pdf', 'x') && !isPdfFile('image/jpeg', 'a.jpg'));

// builder: make real JPEGs by embedding a PNG-free path: a 1x1 JPEG written by hand is fiddly, so use a known tiny JPEG.
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
const wide = Uint8Array.from(TINY_JPEG);
const other = await PDFDocument.create();
other.addPage([300, 400]);
other.addPage([300, 400]);
const otherBytes = await other.save();

const store: Record<string, Uint8Array> = { 'mem://j1': wide, 'mem://j2': wide, 'mem://j3': wide, 'mem://pdf': otherBytes, 'mem://bad': new Uint8Array([1, 2, 3]) };
const reads: string[] = [];
const seen: string[] = [];
const pages = [P('j1'), P('j2'), P('pdf', 'two.pdf', 'pdf'), P('bad', 'broken.jpg'), P('j3')];
const res = await buildPdf(
  pages.map((p) => ({ ...p, uri: `mem://${p.id}` })),
  async (uri) => {
    reads.push(uri);
    const b = store[uri];
    if (!b) throw new Error('missing');
    return b;
  },
  (d, t) => seen.push(`${d}/${t}`),
);
assert.equal(res.pageCount, 5, '3 images + 2 pdf pages (bad skipped)');
assert.equal(res.skipped.length, 1);
assert.equal(res.skipped[0].name, 'broken.jpg');
assert.deepEqual(seen, ['1/5', '2/5', '3/5', '4/5', '5/5']);
assert.deepEqual(reads, ['mem://j1', 'mem://j2', 'mem://pdf', 'mem://bad', 'mem://j3'], 'files read one at a time, in order');
const out = await PDFDocument.load(res.bytes);
assert.equal(out.getPageCount(), 5);
assert.equal(out.getPage(0).getWidth(), PAGE_WIDTH_PT);
assert.equal(out.getPage(2).getHeight(), 400, 'merged PDF pages keep their size');

await assert.rejects(() => buildPdf([P('bad')], async () => new Uint8Array([9])), /None of the pages/);
console.log('test_pdf: all checks passed');
