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

await test('someday: buttons park a task, undo brings it back to its day, today no longer lists it', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, tap('task:t2'));
  assert.deepEqual(f.sent.at(-1)!.buttons!.map((b) => b.title), ['Done ✅', 'Tomorrow', 'Someday 💤']);
  await handleWith(f.deps, tap('park:t2'));
  assert.ok(f.calls.includes('park t2'));
  assert.match(f.sent.at(-1)!.body, /💤 Parked: call mom[\s\S]*someday/);
  await handleWith(f.deps, text('today'));
  assert.ok(!f.sent.at(-1)!.body.includes('call mom'));
  await handleWith(f.deps, text('undo'));
  assert.ok(f.calls.includes('unpark t2 restore null'));
  await handleWith(f.deps, text('today'));
  assert.match(f.sent.at(-1)!.body, /call mom/);
});

await test('someday: "park 2", "/park 1,3", repeating tasks refuse', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, text('today'));
  await handleWith(f.deps, text('park 2'));
  assert.ok(f.calls.includes('park t2'));
  await handleWith(f.deps, text('/park 1,3'));
  assert.ok(f.calls.includes('park t1') && f.calls.includes('park t3'));
  const r = makeFake({ tasks: [mkTask('t1', 'water plants', { recurrence: { frequency: 'daily', startDate: '2026-10-01' } as never })] });
  await handleWith(r.deps, tap('park:t1'));
  assert.match(r.sent.at(-1)!.body, /repeating task cannot be parked/);
});

await test('someday: "someday <idea>" and /someday <idea> add a parked task; nothing lands on today', async () => {
  for (const msg of ['someday learn guitar', '/someday learn guitar', 'Someday maybe: learn guitar.']) {
    const f = makeFake();
    await handleWith(f.deps, text(msg));
    const add = JSON.parse(f.calls.find((c) => c.startsWith('addTasks'))!.slice(9));
    assert.equal(add.text, 'learn guitar');
    assert.equal(add.parked, true);
    assert.match(f.sent.at(-1)!.body, /💤 Parked: learn guitar/);
    assert.equal(f.sent.at(-1)!.buttons!.length, 1, 'only Undo: a parked task is not "done already"');
  }
});

await test('someday: list, row tap offers Do it today / Done / Delete, "Do it today" picks it up', async () => {
  const f = makeFake({ tasks: [mkTask('p1', 'learn guitar', { parkedAt: 10 }), mkTask('p2', 'repaint shed', { parkedAt: 20 }), mkTask('t1', 'gym')] });
  await handleWith(f.deps, text('someday'));
  const l = f.sent.at(-1)!;
  assert.equal(l.kind, 'list');
  assert.match(l.body, /2 parked[\s\S]*1\. repaint shed[\s\S]*2\. learn guitar/);
  assert.deepEqual(l.rows!.map((r) => r.id), ['task:p2', 'task:p1']);
  await handleWith(f.deps, tap('task:p1'));
  assert.deepEqual(f.sent.at(-1)!.buttons!.map((b) => b.title), ['Do it today', 'Done ✅', 'Delete']);
  await handleWith(f.deps, tap('unpark:p1'));
  assert.match(f.sent.at(-1)!.body, /On today's list: learn guitar/);
  await handleWith(f.deps, text('undo'));
  assert.ok(f.calls.includes('park p1'));
  const e = makeFake();
  await handleWith(e.deps, text('/someday'));
  assert.match(e.sent.at(-1)!.body, /Nothing parked yet/);
});

await test('someday: "bored" suggests three, smallest first, a different three another day', async () => {
  const many = ['a long and involved project to plan out properly', 'fix tap', 'call uncle', 'sort the garage out', 'read a book', 'learn guitar', 'x'].map((t, i) => mkTask('p' + i, t, { parkedAt: 10 + i }));
  const f = makeFake({ tasks: many });
  for (const m of ['bored', "i'm free", '/someday pick']) await handleWith(f.deps, text(m));
  const l = f.sent.filter((s) => s.kind === 'list');
  assert.equal(l.length, 3);
  assert.equal(l[0].rows!.length, 3);
  assert.ok(!l[0].body.includes('a long and involved'), 'the biggest is never suggested');
  assert.equal(parseFast(text('i am free to talk tomorrow about taxes')), null);
  const { pickSomeday } = await import('../../lib/bot/actions');
  const days = new Set(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'].map((d) => pickSomeday(many, d).map((t) => t.id).join()));
  assert.ok(days.size > 1, 'rotates by day');
});

await test('someday: Gemini park_tasks / someday flag / show_someday', async () => {
  const f = makeFake({ tasks: three(), gemini: async () => gem([{ name: 'park_tasks', args: { refs: ['call mom'] } }]) });
  await handleWith(f.deps, text("I don't want to see call mom every day"));
  assert.ok(f.calls.includes('park t2'));
  const g = makeFake({ gemini: async () => gem([{ name: 'add_tasks', args: { items: [{ text: 'learn piano', someday: true }] } }]) });
  await handleWith(g.deps, text('one day I want to learn piano'));
  assert.equal(JSON.parse(g.calls.find((c) => c.startsWith('addTasks'))!.slice(9)).parked, true);
  const h = makeFake({ tasks: [mkTask('p1', 'learn guitar', { parkedAt: 10 })], gemini: async () => gem([{ name: 'show_someday', args: { pick: true } }]) });
  await handleWith(h.deps, text('what could I do right now with some free time'));
  assert.equal(h.sent.at(-1)!.kind, 'list');
  assert.ok(!h.sent.some((s) => /didn't catch/i.test(s.body)));
});

await test('someday: review rows and the yearly question open the right buttons', async () => {
  const f = makeFake({ tasks: [mkTask('t1', 'taxes')] });
  await handleWith(f.deps, tap('rv:t1'));
  assert.deepEqual(f.sent.at(-1)!.buttons!.map((b) => b.title), ['Done ✅', 'Someday 💤', 'Drop it 🗑']);
  await handleWith(f.deps, tap('keep:t1'));
  assert.ok(f.calls.some((c) => c.startsWith('parkedAsked t1')));
  assert.match(f.sent.at(-1)!.body, /stays parked/);
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
