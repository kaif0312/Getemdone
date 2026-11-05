// Privacy: notice, `privacy`, `delete my data`, learning log + scrub. Fake deps, no emulator.
// Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_privacy.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { handleWith, PRIVACY, PRIVACY_NOTICE, FORGET_ASK, FORGOTTEN, LEARNING_OFF } from '../../lib/bot/core';
import { parseFast } from '../../lib/bot/fastpath';
import { scrub } from '../../lib/bot/scrub';
import type { InboundMessage } from '../../lib/wa/types';
import type { LearningTurn } from '../../lib/server/learning';
import { makeFake, mkTask } from './fakes';

let n = 0;
const text = (t: string): InboundMessage => ({ id: 'p' + ++n, from: '9100', timestamp: 1000 + n, type: 'text', text: t });
const tap = (id: string, title = 'x'): InboundMessage => ({ id: 'p' + ++n, from: '9100', timestamp: 1000 + n, type: 'interactive', reply: { id, title } });
let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}

function withLearning(f: ReturnType<typeof makeFake>) {
  const rows: LearningTurn[] = [];
  const forgot: string[] = [];
  f.deps.logLearning = async (t) => { rows.push(t); };
  f.deps.forgetMe = async (w) => { forgot.push(w); };
  return { rows, forgot };
}

await test('scrub: numbers, emails, own name; dates and small numbers stay', () => {
  assert.equal(scrub('call +965 6009 1617 or 918714467784'), 'call [number] or [number]');
  assert.equal(scrub('mail kaif@iskaria.com now'), 'mail [email] now');
  assert.equal(scrub('ran 5k in 28 min on 2026-11-04 at 18:00'), 'ran 5k in 28 min on 2026-11-04 at 18:00');
  assert.equal(scrub('Kaif did it, kaif!', ['Kaif']), '[name] did it, [name]!');
  assert.equal(scrub('Al also went', ['Al']), '[name] also went');
  assert.equal(scrub('hi Friend', ['Friend']), 'hi Friend');
});

await test('parse: privacy and delete commands; "delete 2" is still a task delete', () => {
  assert.deepEqual(parseFast(text('Privacy')), { t: 'privacy' });
  assert.deepEqual(parseFast(text('delete my data')), { t: 'forgetAsk' });
  assert.deepEqual(parseFast(text('Erase everything!')), { t: 'forgetAsk' });
  assert.deepEqual(parseFast(text('forget me')), { t: 'forgetAsk' });
  assert.deepEqual(parseFast(text('delete 2')), { t: 'delete', nums: [2] });
  assert.deepEqual(parseFast(tap('forget:yes')), { t: 'forgetYes' });
  assert.deepEqual(parseFast(tap('forget:no')), { t: 'forgetNo' });
});

await test('one-time notice: sent after the reply when the link has none, then never again', async () => {
  const f = makeFake({ link: { privacyNoticeAt: undefined }, tasks: [mkTask('t1', 'gym')] });
  await handleWith(f.deps, text('today'));
  assert.equal(f.sent.at(-1)!.body, PRIVACY_NOTICE);
  assert.ok(f.getLink()!.privacyNoticeAt);
  const before = f.sent.length;
  await handleWith(f.deps, text('today'));
  assert.equal(f.sent.length, before + 1);
  assert.notEqual(f.sent.at(-1)!.body, PRIVACY_NOTICE);
});

await test('new link: welcome, time buttons, then the notice', async () => {
  const f = makeFake({ linked: false });
  await handleWith(f.deps, text('link ABC234'));
  assert.equal(f.sent[1].kind, 'buttons');
  assert.equal(f.sent[2].body, PRIVACY_NOTICE);
  assert.ok(f.getLink()!.privacyNoticeAt);
});

await test('privacy command tells the truth', async () => {
  const f = makeFake();
  await handleWith(f.deps, text('privacy'));
  assert.equal(f.sent.at(-1)!.body, PRIVACY);
  assert.match(PRIVACY, /Ibrahim can read them/);
  assert.match(PRIVACY, /delete my data/);
});

await test('learning log: scrubbed copy under a random id kept on the link', async () => {
  const f = makeFake({ tasks: [mkTask('t1', 'call Kaif at 918714467784')] });
  const { rows } = withLearning(f);
  await handleWith(f.deps, text('today'));
  await handleWith(f.deps, text('privacy'));
  assert.equal(rows.length, 2);
  const lid = f.getLink()!.learnId;
  assert.ok(lid && lid.length > 20);
  assert.ok(rows.every((r) => r.lid === lid));
  assert.equal(rows[0].path, 'fast:today');
  assert.ok(!/918714467784|Kaif/.test(rows[0].bot), rows[0].bot);
  assert.ok(!JSON.stringify(rows).includes('9100'));
});

await test('learning off: opt-out stops the copy (that turn too), learning on resumes from the next turn', async () => {
  assert.deepEqual(parseFast(text('Learning off')), { t: 'learningOff' });
  assert.deepEqual(parseFast(text("don't save my messages")), { t: 'learningOff' });
  assert.deepEqual(parseFast(text('learning on')), { t: 'learningOn' });
  const f = makeFake({ tasks: [mkTask('t1', 'gym')] });
  const { rows } = withLearning(f);
  await handleWith(f.deps, text('learning off'));
  assert.equal(f.getLink()!.learning, false);
  assert.equal(f.sent.at(-1)!.body, LEARNING_OFF);
  await handleWith(f.deps, text('today'));
  assert.equal(rows.length, 0);
  await handleWith(f.deps, text('learning on'));
  assert.equal(f.getLink()!.learning, true);
  assert.equal(rows.length, 0);
  await handleWith(f.deps, text('today'));
  assert.equal(rows.length, 1);
  assert.match(PRIVACY, /learning off/);
  assert.match(PRIVACY_NOTICE, /learning off/);
});

await test('learning log failure never breaks the reply', async () => {
  const f = makeFake({ tasks: [mkTask('t1', 'gym')] });
  f.deps.logLearning = async () => { throw new Error('firestore down'); };
  await handleWith(f.deps, text('today'));
  assert.ok(!f.sent.some((s) => /Sorry, something went wrong/.test(s.body)));
});

await test('delete my data: asks first; Keep deletes nothing', async () => {
  const f = makeFake();
  const { forgot } = withLearning(f);
  await handleWith(f.deps, text('delete my data'));
  const ask = f.sent.at(-1)!;
  assert.equal(ask.kind, 'buttons');
  assert.equal(ask.body, FORGET_ASK);
  assert.deepEqual(ask.buttons!.map((b) => b.id), ['forget:yes', 'forget:no']);
  await handleWith(f.deps, tap('forget:no'));
  assert.deepEqual(forgot, []);
  assert.match(f.sent.at(-1)!.body, /nothing deleted/);
});

await test('delete my data: confirm erases, replies, and saves/logs nothing afterwards', async () => {
  const f = makeFake();
  const { rows, forgot } = withLearning(f);
  await handleWith(f.deps, text('delete my data'));
  const rowsBefore = rows.length;
  const turnsBefore = f.getSession().turns.length;
  await handleWith(f.deps, tap('forget:yes', 'Delete my data'));
  assert.deepEqual(forgot, ['9100']);
  assert.equal(f.sent.at(-1)!.body, FORGOTTEN);
  assert.equal(rows.length, rowsBefore);
  assert.equal(f.getSession().turns.length, turnsBefore);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
