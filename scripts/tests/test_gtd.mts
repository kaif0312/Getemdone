// GTD-style features, bot side (fake deps, no emulator): "Done already", top 3, stale-task first step, review toggle.
// Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_gtd.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { handleWith } from '../../lib/bot/core';
import { parseFast } from '../../lib/bot/fastpath';
import type { InboundMessage } from '../../lib/wa/types';
import type { GeminiResult } from '../../lib/bot/types';
import { makeFake, mkTask } from './fakes';

let n = 0;
const text = (t: string): InboundMessage => ({ id: 'g' + ++n, from: '9100', timestamp: 1000 + n, type: 'text', text: t });
const tap = (id: string, title = 'x'): InboundMessage => ({ id: 'g' + ++n, from: '9100', timestamp: 1000 + n, type: 'interactive', reply: { id, title } });
const gem = (calls: GeminiResult['calls'], t = ''): GeminiResult => ({ calls, text: t });
const three = () => [mkTask('t1', 'gym', { deferredTo: '2026-11-01T18:00' }), mkTask('t2', 'call mom'), mkTask('t3', 'finish deck')];

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}

await test('done already: a plain new task offers the tap, and the tap ticks it', async () => {
  const f = makeFake({ gemini: async () => gem([{ name: 'add_tasks', args: { items: [{ text: 'call bank' }] } }]) });
  await handleWith(f.deps, text('call bank'));
  const b = f.sent.at(-1)!;
  assert.equal(b.kind, 'buttons');
  assert.deepEqual(b.buttons!.map((x) => x.title), ['Done already ✅', 'Undo ↩️']);
  assert.match(b.buttons![0].id, /^done:n\d+$/);
  await handleWith(f.deps, tap(b.buttons![0].id));
  assert.ok(f.calls.some((c) => c.startsWith('complete n')));
  assert.match(f.sent.at(-1)!.body, /✅ call bank/);
});

await test('done already: no tap for a timed task or for several tasks', async () => {
  const timed = makeFake({ gemini: async () => gem([{ name: 'add_tasks', args: { items: [{ text: 'gym', when: '2026-11-01T18:00' }] } }]) });
  await handleWith(timed.deps, text('gym 6pm'));
  assert.deepEqual(timed.sent.at(-1)!.buttons!.map((x) => x.title), ['Undo ↩️']);
  const two = makeFake({ gemini: async () => gem([{ name: 'add_tasks', args: { items: [{ text: 'a' }, { text: 'b' }] } }]) });
  await handleWith(two.deps, text('a, b'));
  assert.deepEqual(two.sent.at(-1)!.buttons!.map((x) => x.title), ['Undo ↩️']);
});

await test('done already: "I already did it" is logged and ticked in one go; undo reverses both', async () => {
  const f = makeFake({ gemini: async () => gem([{ name: 'add_tasks', args: { items: [{ text: 'paid rent', already_done: true }, { text: 'call mom' }] } }]) });
  await handleWith(f.deps, text('paid rent already, call mom'));
  assert.equal(f.calls.filter((c) => c.startsWith('complete')).length, 1);
  const body = f.sent.at(-1)!.body;
  assert.match(body, /Added:/);
  assert.match(body, /✅ paid rent/);
  await handleWith(f.deps, text('undo'));
  assert.ok(f.calls.some((c) => c.startsWith('uncomplete')) && f.calls.some((c) => c.startsWith('delete')));
  const only = makeFake({ gemini: async () => gem([{ name: 'add_tasks', args: { items: [{ text: 'sent invoice', already_done: true }] } }]) });
  await handleWith(only.deps, text('just sent the invoice'));
  assert.ok(!only.sent.at(-1)!.body.includes('Added'), 'nothing is "added" when it was already done');
  assert.match(only.sent.at(-1)!.body, /✅ sent invoice/);
});

await test('top 3: a pick re-offers the rest, "That\'s enough" ends with a numbered summary', async () => {
  const f = makeFake({ tasks: [...three(), mkTask('t4', 'pay rent')] });
  await handleWith(f.deps, tap('checkin:start'));
  assert.match(f.sent.at(-1)!.body, /Pick up to 3/);
  assert.equal(f.sent.at(-1)!.rows!.length, 4);
  await handleWith(f.deps, tap('focus:t2'));
  const l = f.sent.at(-1)!;
  assert.equal(l.kind, 'list');
  assert.match(l.body, /1\/3 picked/);
  assert.ok(!l.rows!.some((r) => r.id === 'focus:t2'), 'a picked task is not offered again');
  assert.equal(l.rows!.at(-1)!.id, 'checkin:focusdone');
  await handleWith(f.deps, tap('checkin:focusdone'));
  assert.match(f.sent.at(-1)!.body, /Your focus[\s\S]*1\. ⭐ call mom/);
  assert.deepEqual(f.getSession().lastList, ['t2']);
});

await test('top 3: the third pick closes, today lists them first with a star, finishing them says so', async () => {
  const g = makeFake({ tasks: [...three(), mkTask('t4', 'pay rent')] });
  for (const id of ['t1', 't2', 't3']) await handleWith(g.deps, tap('focus:' + id));
  assert.ok(g.calls.includes('focus t1,t2,t3'));
  assert.match(g.sent.at(-1)!.body, /Your 3 for today[\s\S]*1\. ⭐ gym[\s\S]*3\. ⭐ finish deck[\s\S]*done 1/);
  await handleWith(g.deps, text('today'));
  assert.match(g.sent.at(-1)!.body, /1\. ⭐ gym[\s\S]*2\. ⭐ call mom[\s\S]*3\. ⭐ finish deck[\s\S]*4\. pay rent/);
  await handleWith(g.deps, text('done 1'));
  await handleWith(g.deps, text('done 2'));
  assert.ok(!g.sent.at(-1)!.body.includes('focus tasks done'));
  await handleWith(g.deps, text('done 3'));
  assert.match(g.sent.at(-1)!.body, /⭐ All 3 focus tasks done/);
});

await test('top 3: friends see how many of a friend\'s three are done', async () => {
  const f = makeFake();
  f.deps.friendsActivity = async () => [{ uid: 'f1', displayName: 'Ali', doneToday: [], workoutsToday: [], streak: 0, focus: { done: 2, total: 3 } }];
  await handleWith(f.deps, text('friends'));
  assert.match(f.sent.at(-1)!.body, /Ali: ⭐ 2\/3 focus/);
});

await test('stale nudge: "Next step" takes one short reply, rewrites the task, undo restores it', async () => {
  const f = makeFake({ tasks: [mkTask('t1', 'taxes')] });
  await handleWith(f.deps, tap('step:t1'));
  assert.match(f.sent.at(-1)!.body, /taxes[\s\S]*very first small step/);
  assert.equal(f.getSession().lastAction?.kind, 'pending_step');
  await handleWith(f.deps, text("Email the accountant for last year's form"));
  assert.ok(f.calls.includes("rename t1 Email the accountant for last year's form"));
  assert.match(f.sent.at(-1)!.body, /Now: \*Email the accountant[\s\S]*Was: taxes/);
  assert.equal(f.sent.at(-1)!.buttons![0].title, 'Undo ↩️');
  await handleWith(f.deps, text('undo'));
  assert.equal(f.tasks.get('t1')!.text, 'taxes');
});

await test('stale nudge: skip, a list, a button or a done task never rewrites anything', async () => {
  const s = makeFake({ tasks: [mkTask('t1', 'taxes')], gemini: async () => gem([{ name: 'add_tasks', args: { items: [{ text: 'milk' }, { text: 'eggs' }] } }]) });
  await handleWith(s.deps, tap('step:t1'));
  await handleWith(s.deps, text('skip'));
  assert.match(s.sent.at(-1)!.body, /left it as it is/);
  await handleWith(s.deps, tap('step:t1'));
  await handleWith(s.deps, text('milk, eggs, bread'));
  assert.ok(s.calls.some((c) => c.startsWith('addTasks')), 'a list is new tasks, not a step');
  await handleWith(s.deps, tap('step:t1'));
  await handleWith(s.deps, tap('tmrw:t1'));
  await handleWith(s.deps, text('buy milk'));
  assert.ok(!s.calls.some((c) => c.startsWith('rename')));
  const d = makeFake({ tasks: [mkTask('t1', 'taxes', { completed: true })] });
  await handleWith(d.deps, tap('step:t1'));
  assert.match(d.sent.at(-1)!.body, /already gone or done/);
  // the wait expires after 20 minutes
  const e = makeFake({ tasks: [mkTask('t1', 'taxes')], gemini: async () => gem([{ name: 'add_tasks', args: { items: [{ text: 'buy milk' }] } }]) });
  await handleWith(e.deps, tap('step:t1'));
  e.getSession().lastAction!.at -= 21 * 60_000;
  await handleWith(e.deps, text('buy milk'));
  assert.ok(!e.calls.some((c) => c.startsWith('rename')));
});

await test('review off / on', async () => {
  assert.deepEqual(parseFast(text('review off')), { t: 'reviewsOff' });
  assert.deepEqual(parseFast(text('/review on')), { t: 'reviewsOn' });
  assert.equal(parseFast(text('nudge Ali')), null);
  assert.deepEqual(parseFast(tap('step:abc')), { t: 'step', id: 'abc' });
  assert.deepEqual(parseFast(tap('checkin:focusdone')), { t: 'focusDone' });
  const f = makeFake();
  await handleWith(f.deps, text('review off'));
  assert.ok(f.calls.includes('updateLink {"reviews":false}'));
  await handleWith(f.deps, text('/review on'));
  assert.ok(f.calls.includes('updateLink {"reviews":true}'));
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
