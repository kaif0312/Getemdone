// Meme tests with fake providers: no network, no emulator. Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_memes.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { handleWith } from '../../lib/bot/core';
import { BOOKS, allowMeme, chooseRecipe, fillText, type MemeDeps, type Recipe } from '../../lib/bot/memes';
import { parseFast } from '../../lib/bot/fastpath';
import type { InboundMessage } from '../../lib/wa/types';
import type { GeminiResult } from '../../lib/bot/types';
import { makeFake, mkTask } from './fakes';

let n = 0;
const text = (t: string): InboundMessage => ({ id: 'm' + ++n, from: '9100', timestamp: 1000 + n, type: 'text', text: t });
const gem = (calls: GeminiResult['calls'], t = ''): GeminiResult => ({ calls, text: t });
const both = { imgflip: true, giphy: true };
const zero = () => 0;
let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}

/** Fake meme deps: records what went out. `fail` makes every provider return null. */
function fakeMemes(opts: { fail?: boolean; dice?: number; has?: { imgflip: boolean; giphy: boolean } } = {}) {
  const out: { kind: string; arg: string }[] = [];
  const m: MemeDeps = {
    random: () => opts.dice ?? 0,
    providers: {
      has: opts.has ?? both,
      caption: async (id, texts) => { out.push({ kind: 'caption', arg: `${id}:${texts.join('|')}` }); return opts.fail ? null : 'https://i.imgflip.com/x.jpg'; },
      gif: async (q) => { out.push({ kind: 'gif', arg: q }); return opts.fail ? null : { mp4: 'https://media.giphy.com/x.mp4', title: q }; },
      sticker: async (q) => { out.push({ kind: 'sticker', arg: q }); return opts.fail ? null : Buffer.from('webp'); },
    },
    sendImage: async (_to, link) => { out.push({ kind: 'image', arg: link }); return 'w'; },
    sendVideo: async (_to, link, cap) => { out.push({ kind: 'video', arg: `${link} ${cap}` }); return 'w'; },
    uploadMedia: async () => 'media1',
    sendStickerId: async (_to, id) => { out.push({ kind: 'stickerId', arg: id }); return 'w'; },
  };
  return { m, out };
}

await test('every coach covers the core moments; captions fit their templates', () => {
  for (const coach of ['drill', 'hype', 'buddy', 'zen', 'stoic', 'analyst'] as const) {
    for (const mo of ['deferred', 'excuse', 'tired', 'workout', 'done', 'all_done', 'brag', 'quit'] as const) {
      assert.ok((BOOKS[coach][mo] ?? []).length, `${coach}.${mo}`);
    }
  }
  const boxes: Record<string, number> = { '181913649': 2, '87743020': 3, '217743513': 2, '124822590': 3, '342785297': 3, '135256802': 3 };
  for (const r of Object.values(BOOKS).flatMap((b) => Object.values(b).flat()) as Recipe[]) {
    if ('c' in r && boxes[r.c]) assert.equal(r.x.length, boxes[r.c], `${r.c} ${r.x.join('|')}`);
  }
});

await test('chooseRecipe: respects providers, format, and asked topics', () => {
  const capOnly = chooseRecipe('drill', { moment: 'deferred' }, { imgflip: true, giphy: false }, zero);
  assert.ok(capOnly && 'c' in capOnly);
  const gifOnly = chooseRecipe('drill', { moment: 'deferred' }, { imgflip: false, giphy: true }, zero);
  assert.ok(gifOnly && !('c' in gifOnly));
  assert.equal(chooseRecipe('drill', { moment: 'deferred' }, { imgflip: false, giphy: false }, zero), null);
  assert.deepEqual(chooseRecipe('drill', { moment: 'random', asked: true, topic: 'david goggins', format: 'gif' }, both, zero), { g: 'david goggins' });
  assert.deepEqual(chooseRecipe('hype', { moment: 'random', asked: true, topic: 'cat', format: 'sticker' }, both, zero), { s: 'cat' });
  const st = chooseRecipe('drill', { moment: 'deferred', format: 'sticker' }, both, zero);
  assert.ok(st && 's' in st);
  const unknownCoach = chooseRecipe('nope', { moment: 'workout' }, both, zero);
  assert.ok(unknownCoach); // falls back to buddy
});

await test('fillText clips the task', () => {
  assert.equal(fillText('Do {task} now', { task: 'finish the quarterly board presentation deck' }), 'Do finish the quarterly board… now');
  assert.equal(fillText('Do {task}', {}), 'Do it');
});

await test('allowMeme: kill switch, opt-out, daily caps, odds', () => {
  const day = '2026-11-01';
  assert.equal(allowMeme({}, { moment: 'workout' }, day, { NUDGE_MEMES: 'off' }, zero), null);
  assert.equal(allowMeme({ memes: false }, { moment: 'workout' }, day, {}, zero), null);
  assert.ok(allowMeme({ memes: false }, { moment: 'random', asked: true }, day, {}, zero));
  assert.deepEqual(allowMeme({}, { moment: 'workout' }, day, {}, zero), { memeDay: day, memeCount: 1, memeAskedCount: 0 });
  assert.equal(allowMeme({ memeDay: day, memeCount: 3 }, { moment: 'workout' }, day, {}, zero), null);
  assert.ok(allowMeme({ memeDay: '2026-10-31', memeCount: 3 }, { moment: 'workout' }, day, {}, zero)); // new day resets
  assert.equal(allowMeme({ memeDay: day, memeAskedCount: 15 }, { moment: 'random', asked: true }, day, {}, zero), null);
  assert.equal(allowMeme({}, { moment: 'done' }, day, {}, () => 0.5), null); // done odds 0.25
  assert.ok(allowMeme({}, { moment: 'done', byModel: true }, day, {}, () => 0.5));
});

await test('flow: drill coach pushes a task -> a meme goes out instead of the mascot sticker, budget saved', async () => {
  const f = makeFake({ tasks: [mkTask('t1', 'gym'), mkTask('t2', 'deck')] });
  const { m, out } = fakeMemes();
  f.deps.memes = m;
  await f.deps.updateLink('9100', { coach: 'drill' });
  await handleWith(f.deps, text('today'));
  await handleWith(f.deps, text('tmrw 2'));
  assert.equal(out[0].kind, 'caption');
  assert.match(out[0].arg, /deck/);
  assert.equal(out[1].kind, 'image');
  assert.equal(f.getLink()!.memeCount, 1);
  assert.match(f.getSession().turns.at(-1)!.text, /\[meme:/);
});

await test('flow: all done -> meme replaces the cheer sticker; provider failure falls back to the sticker', async () => {
  const f = makeFake({ tasks: [mkTask('t1', 'gym')] });
  f.deps.memes = fakeMemes().m;
  await handleWith(f.deps, text('today'));
  await handleWith(f.deps, text('done 1'));
  assert.deepEqual(f.stickers, []);
  const g = makeFake({ tasks: [mkTask('t1', 'gym')] });
  g.deps.memes = fakeMemes({ fail: true }).m;
  await handleWith(g.deps, text('today'));
  await handleWith(g.deps, text('done 1'));
  assert.deepEqual(g.stickers, ['cheer']);
  assert.equal(g.getLink()!.memeCount, undefined);
});

await test('commands: meme / gif / sticker / memes off / memes on', async () => {
  assert.deepEqual(parseFast(text('send me a meme')), { t: 'meme', format: 'meme' });
  assert.deepEqual(parseFast(text('GIF')), { t: 'meme', format: 'gif' });
  assert.deepEqual(parseFast(text('memes off')), { t: 'memesOff' });
  const f = makeFake();
  const { m, out } = fakeMemes();
  f.deps.memes = m;
  await handleWith(f.deps, text('gif'));
  assert.equal(out.at(-1)!.kind, 'video');
  assert.match(out.at(-1)!.arg, /via GIPHY/);
  await handleWith(f.deps, text('sticker'));
  assert.equal(out.at(-1)!.kind, 'stickerId');
  await handleWith(f.deps, text('memes off'));
  assert.equal(f.getLink()!.memes, false);
  const before = out.length;
  await handleWith(f.deps, text('stop'));
  assert.equal(out.length, before); // no auto meme when opted out
  assert.deepEqual(f.stickers, ['disappointed']);
  await handleWith(f.deps, text('meme'));
  assert.ok(out.length > before); // asked still works
});

await test('Gemini: "send me a goggins gif" searches that; asked over the cap gets a friendly no', async () => {
  const f = makeFake({ gemini: async () => gem([
    { name: 'reply', args: { text: 'Here.' } },
    { name: 'send_meme', args: { moment: 'random', topic: 'david goggins', format: 'gif', asked: true } },
  ]) });
  const { m, out } = fakeMemes();
  f.deps.memes = m;
  await handleWith(f.deps, text('send me a goggins gif'));
  assert.deepEqual(out.map((o) => o.kind), ['gif', 'video']);
  assert.equal(out[0].arg, 'david goggins');
  await f.deps.updateLink('9100', { memeDay: '2026-11-01', memeAskedCount: 15 });
  await handleWith(f.deps, text('another one'));
  assert.match(f.sent.at(-1)!.body, /enough memes for today/);
});

await test('Gemini: an excuse raises a model moment (high odds) in the drill book', async () => {
  const f = makeFake({ gemini: async () => gem([
    { name: 'reply', args: { text: 'Tired is a feeling.' } },
    { name: 'send_meme', args: { moment: 'excuse', topic: 'gym' } },
  ]) });
  const { m, out } = fakeMemes({ dice: 0.8, has: { imgflip: false, giphy: true } });
  f.deps.memes = m;
  await f.deps.updateLink('9100', { coach: 'drill' });
  await handleWith(f.deps, text('skipping gym, too tired'));
  assert.ok(['gif', 'sticker'].includes(out[0].kind));
  assert.equal(f.getLink()!.memeCount, 1);
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
