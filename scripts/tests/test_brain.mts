// Brain tests with fake deps: no emulator, no network. Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_brain.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { handleWith, APOLOGY } from '../../lib/bot/core';
import { callGemini } from '../../lib/bot/gemini';
import { parseFast, parseNumbers } from '../../lib/bot/fastpath';
import { zonedToMs } from '../../lib/bot/format';
import type { InboundMessage } from '../../lib/wa/types';
import type { GeminiResult } from '../../lib/bot/types';
import { makeFake, mkTask } from './fakes';

let n = 0;
const text = (t: string): InboundMessage => ({ id: 'm' + ++n, from: '9100', timestamp: 1000 + n, type: 'text', text: t });
const tap = (id: string, title = 'x'): InboundMessage => ({ id: 'm' + ++n, from: '9100', timestamp: 1000 + n, type: 'interactive', reply: { id, title } });
const gem = (calls: GeminiResult['calls'], t = ''): GeminiResult => ({ calls, text: t });

const three = () => [mkTask('t1', 'gym', { deferredTo: '2026-11-01T18:00' }), mkTask('t2', 'call mom'), mkTask('t3', 'finish deck')];
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}

await test('unlinked: how to connect', async () => {
  const f = makeFake({ linked: false });
  await handleWith(f.deps, text('hi'));
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].body, /Connect WhatsApp/);
});

await test('unlinked: LINK code -> welcome + 3 time buttons', async () => {
  const f = makeFake({ linked: false });
  await handleWith(f.deps, text('link abc234'));
  assert.deepEqual(f.calls, ['redeem ABC234']);
  assert.match(f.sent[0].body, /connected/);
  assert.equal(f.sent[1].kind, 'buttons');
  assert.deepEqual(f.sent[1].buttons!.map((b) => b.id), ['settime:07:00', 'settime:08:00', 'settime:09:00']);
});

await test('unlinked: bad LINK code', async () => {
  const f = makeFake({ linked: false });
  await handleWith(f.deps, text('LINK ZZZZZZ'));
  assert.match(f.sent[0].body, /doesn't look right/);
});

await test('settime button saves checkinTime', async () => {
  const f = makeFake();
  await handleWith(f.deps, tap('settime:08:00'));
  assert.ok(f.calls.includes('updateLink {"checkinTime":"08:00"}'));
  assert.match(f.sent[0].body, /8:00 AM/);
});

await test('today: list message, sets lastList; one task -> buttons', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, text('today'));
  assert.equal(f.sent[0].kind, 'list');
  assert.deepEqual(f.sent[0].rows!.map((r) => r.id), ['task:t1', 'task:t2', 'task:t3']);
  assert.match(f.sent[0].body, /1\. gym \(6:00 PM\)/);
  assert.deepEqual(f.getSession().lastList, ['t1', 't2', 't3']);
  const g = makeFake({ tasks: [mkTask('a', 'only')] });
  await handleWith(g.deps, text('list'));
  assert.equal(g.sent[0].kind, 'buttons');
  assert.deepEqual(g.sent[0].buttons!.map((b) => b.id), ['done:a', 'tmrw:a', 'del:a']);
});

await test('empty today', async () => {
  const f = makeFake();
  await handleWith(f.deps, text('today'));
  assert.match(f.sent[0].body, /Nothing/);
});

await test('number resolution: done 2, done 1,3, out of range, undo', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, text('today'));
  await handleWith(f.deps, text('done 2'));
  assert.ok(f.calls.includes('complete t2'));
  const last = f.sent.at(-1)!;
  assert.equal(last.kind, 'buttons');
  assert.match(last.body, /✅ call mom/);
  assert.match(last.body, /2 left today/);
  assert.match(last.buttons![0].id, /^undo:/);
  await handleWith(f.deps, text('done 1,3'));
  assert.ok(f.calls.includes('complete t1') && f.calls.includes('complete t3'));
  assert.match(f.sent.at(-1)!.body, /All done for today/);
  assert.match(f.sent.at(-1)!.body, /4-day streak/);
  await handleWith(f.deps, text('done 9'));
  assert.match(f.sent.at(-1)!.body, /#9/);
  // undo restores 1,3 (the last action), by text
  await handleWith(f.deps, text('undo'));
  assert.ok(f.calls.includes('uncomplete t1') && f.calls.includes('uncomplete t3'));
  assert.match(f.sent.at(-1)!.body, /Undone/);
  await handleWith(f.deps, text('undo'));
  assert.match(f.sent.at(-1)!.body, /Nothing to undo/);
});

await test('undo button with matching / stale action id', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, text('today'));
  await handleWith(f.deps, tap('done:t2'));
  const undoId = f.sent.at(-1)!.buttons![0].id;
  await handleWith(f.deps, tap('undo:stale'));
  assert.match(f.sent.at(-1)!.body, /Nothing to undo/);
  await handleWith(f.deps, tap(undoId));
  assert.ok(f.calls.includes('uncomplete t2'));
});

await test('done works without a prior list (rebuilds it)', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, text('done 3'));
  assert.ok(f.calls.includes('complete t3'));
});

await test('buttons: task tap, tomorrow, delete + undo delete', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, tap('task:t1'));
  assert.deepEqual(f.sent[0].buttons!.map((b) => b.id), ['done:t1', 'tmrw:t1', 'del:t1']);
  await handleWith(f.deps, tap('tmrw:t2'));
  assert.ok(f.calls.includes('defer t2 2026-11-02'));
  await handleWith(f.deps, tap('del:t3'));
  assert.ok(f.calls.includes('delete t3'));
  await handleWith(f.deps, text('undo'));
  assert.ok(f.calls.includes('restore t3'));
});

await test('stop / start / help / week / friends', async () => {
  const f = makeFake();
  await handleWith(f.deps, text('STOP'));
  assert.equal(f.getLink()!.muted, true);
  await handleWith(f.deps, text('start'));
  assert.equal(f.getLink()!.muted, false);
  await handleWith(f.deps, text('help'));
  assert.match(f.sent.at(-1)!.body, /What I can do/);
  await handleWith(f.deps, text('week'));
  assert.match(f.sent.at(-1)!.body, /0\/4 workouts/);
  await handleWith(f.deps, text('friends'));
  assert.match(f.sent.at(-1)!.body, /Ali: ✅ 1 done · 🏃 ran 5k · 🔥 12/);
});

await test('nudge + react buttons, checkin buttons, focus accumulates', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, tap('nudge:f1'));
  assert.ok(f.calls.includes('nudge f1 '));
  await handleWith(f.deps, tap('react:ft1:🔥'));
  assert.ok(f.calls.includes('react ft1 🔥'));
  await handleWith(f.deps, tap('checkin:start'));
  assert.equal(f.sent.at(-1)!.kind, 'list');
  assert.equal(f.sent.at(-1)!.rows![0].id, 'focus:t1');
  await handleWith(f.deps, tap('focus:t1'));
  await handleWith(f.deps, tap('focus:t2'));
  assert.ok(f.calls.includes('focus t1,t2'));
  await handleWith(f.deps, tap('checkin:skip'));
});

await test('parseFast / parseNumbers', async () => {
  assert.deepEqual(parseNumbers('1 and 3'), [1, 3]);
  assert.deepEqual(parseNumbers('1-3'), [1, 2, 3]);
  assert.equal(parseNumbers('the gym one'), null);
  assert.equal(parseFast(text('done the gym thing')), null);
  assert.deepEqual(parseFast(text('Done 2.')), { t: 'done', nums: [2] });
  assert.equal(parseFast(tap('weird:thing')), null);
});

await test('gemini: add_tasks round trip with when/due, numbering continues', async () => {
  const f = makeFake({
    tasks: [mkTask('t1', 'gym')],
    gemini: async () => gem([{ name: 'add_tasks', args: { items: [
      { text: 'call mom', when: '2026-11-01T18:00' },
      { text: 'finish deck', when: '2026-11-07', due: '2026-11-07' },
      { text: '  ' },
    ] } }]),
  });
  await handleWith(f.deps, text('call mom 6pm and finish deck by Fri'));
  const adds = f.calls.filter((c) => c.startsWith('addTasks')).map((c) => JSON.parse(c.slice(9)));
  assert.equal(adds.length, 2);
  assert.equal(adds[0].when, '2026-11-01T18:00');
  assert.equal(adds[1].dueDate, zonedToMs('2026-11-07', 'Asia/Kolkata'));
  const last = f.sent.at(-1)!;
  assert.equal(last.kind, 'buttons');
  assert.match(last.body, /Added 2/);
  assert.match(last.body, /2\. call mom \(6:00 PM\)/); // continues after gym
  assert.match(last.body, /• finish deck/); // future day: not in today's numbering
  // prompt: clock is the LAST part, tasks numbered, system static
  const req = f.geminiReqs[0];
  const lastText = req.user.at(-1)!.text!;
  assert.match(lastText, /1\. gym/);
  assert.match(lastText.split('\n\n').at(-1)!, /^Now: Sunday 2026-11-01 14:00, timezone Asia\/Kolkata/);
  // undo removes both
  await handleWith(f.deps, tap(last.buttons![0].id));
  assert.equal(f.calls.filter((c) => c.startsWith('delete ')).length, 2);
});

await test('gemini: complete by text ref + reply lead-in', async () => {
  const f = makeFake({
    tasks: three(),
    gemini: async () => gem([{ name: 'complete_tasks', args: { refs: ['2', 'gym'] } }, { name: 'reply', args: { text: 'Shabaash!' } }]),
  });
  await handleWith(f.deps, text('mom ko call kar diya aur gym bhi'));
  assert.ok(f.calls.includes('complete t2') && f.calls.includes('complete t1'));
  assert.match(f.sent.at(-1)!.body, /^Shabaash!/);
});

await test('gemini: list stays stable after a completion (hole kept)', async () => {
  let call = 0;
  const f = makeFake({
    tasks: three(),
    gemini: async () => (++call === 1 ? gem([{ name: 'complete_tasks', args: { refs: ['1'] } }]) : gem([{ name: 'complete_tasks', args: { refs: ['3'] } }])),
  });
  await handleWith(f.deps, text('today'));
  await handleWith(f.deps, text('finished the first one'));
  await handleWith(f.deps, text('and the third'));
  assert.ok(f.calls.includes('complete t3'));
  assert.match(f.geminiReqs[1].user.at(-1)!.text!, /1\. \(done\/removed\)\n2\. call mom\n3\. finish deck/);
});

await test('gemini: log_workout + log_metric', async () => {
  const f = makeFake({
    gemini: async () => gem([
      { name: 'log_workout', args: { type: 'run', minutes: '28', distance_km: 5 } },
      { name: 'log_metric', args: { metric: 'weight_kg', value: 82.4 } },
    ]),
  });
  await handleWith(f.deps, text('ran 5k in 28 min, 82.4 kg'));
  assert.ok(f.calls.some((c) => c.startsWith('logWorkout') && c.includes('"minutes":28') && c.includes('"distanceKm":5')));
  assert.ok(f.calls.includes('logMetric weightKg 82.4 '));
  const last = f.sent.at(-1)!;
  assert.match(last.body, /💪 Logged: run · 5 km · 28 min/);
  assert.match(last.body, /1\/4 workouts this week/);
  assert.match(last.body, /weight: 82.4 kg/);
  await handleWith(f.deps, tap(last.buttons![0].id));
  assert.ok(f.calls.includes('undoLastWorkout'));
});

await test('gemini: chit-chat reply only, nudge, friends, schedule, goal, unknown friend', async () => {
  const f = makeFake({
    gemini: async (req) => {
      const m = req.user.at(-1)!.text!.split('\n\n')[0];
      if (m.includes('hello')) return gem([{ name: 'reply', args: { text: 'Hey! 👋' } }]);
      if (m.includes('nudge')) return gem([{ name: 'nudge_friend', args: { name: 'Ali', message: 'go!' } }, { name: 'nudge_friend', args: { name: 'Zed' } }]);
      if (m.includes('sched')) return gem([{ name: 'set_schedule', args: { checkin_time: '7:30', recap_time: 'off' } }, { name: 'set_goal', args: { workouts_per_week: 4 } }]);
      return gem([{ name: 'react_to_friend', args: { name: 'ali', emoji: '🔥' } }]);
    },
  });
  await handleWith(f.deps, text('hello there'));
  assert.equal(f.sent.at(-1)!.body, 'Hey! 👋');
  await handleWith(f.deps, text('nudge ali pls'));
  assert.ok(f.calls.includes('nudge f1 go!'));
  assert.match(f.sent.at(-1)!.body, /Nudged Ali[\s\S]*couldn't find a friend called "Zed"/);
  await handleWith(f.deps, text('sched please'));
  assert.ok(f.calls.includes('updateLink {"checkinTime":"07:30","recapTime":null}'));
  assert.ok(f.calls.includes('setGoals {"workoutsPerWeek":4}'));
  await handleWith(f.deps, text('give ali fire'));
  assert.ok(f.calls.includes('react ft1 🔥'));
});

await test('gemini: voice note passes inline_data; image -> propose_workout -> confirm', async () => {
  const f = makeFake({
    gemini: async (req) => (req.user[0].inline_data?.mime_type === 'audio/ogg'
      ? gem([{ name: 'add_tasks', args: { items: [{ text: 'buy milk' }] } }])
      : gem([{ name: 'propose_workout', args: { type: 'run', minutes: 31, distance_km: 5.2 } }])),
  });
  await handleWith(f.deps, { id: 'a1', from: '9100', timestamp: 5, type: 'audio', media: { id: 'media1', mimeType: 'audio/ogg; codecs=opus' } });
  assert.ok(f.calls.includes('fetchMedia media1'));
  const part = f.geminiReqs[0].user[0].inline_data!;
  assert.equal(part.mime_type, 'audio/ogg');
  assert.equal(part.data, Buffer.from('abc').toString('base64'));
  assert.match(f.geminiReqs[0].user.at(-1)!.text!, /voice note/);
  assert.match(f.sent.at(-1)!.body, /buy milk/);
  assert.equal(f.getSession().turns[0].text, '[voice note]');

  f.deps.fetchMedia = async () => ({ data: Buffer.from('img'), mimeType: 'image/jpeg' });
  await handleWith(f.deps, { id: 'i1', from: '9100', timestamp: 6, type: 'image', media: { id: 'media2', mimeType: 'image/jpeg' }, text: 'today' });
  const b = f.sent.at(-1)!;
  assert.match(b.body, /run · 5.2 km · 31 min/);
  assert.match(b.buttons![0].id, /^confirm:/);
  assert.ok(!f.calls.some((c) => c.startsWith('logWorkout')));
  await handleWith(f.deps, tap(b.buttons![0].id));
  assert.ok(f.calls.some((c) => c.startsWith('logWorkout') && c.includes('"distanceKm":5.2')));
  await handleWith(f.deps, tap(b.buttons![0].id));
  assert.match(f.sent.at(-1)!.body, /expired/);
});

await test('error paths: gemini throws -> apology; tool throws -> notice; never throws', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, text('something fancy'));
  assert.equal(f.sent.at(-1)!.body, APOLOGY);
  const g = makeFake({ tasks: three(), gemini: async () => gem([{ name: 'complete_tasks', args: { refs: ['1'] } }]) });
  g.deps.completeTask = async () => { throw new Error('boom'); };
  await handleWith(g.deps, text('finished gym'));
  assert.match(g.sent.at(-1)!.body, /Could not complete/);
  const h = makeFake({ linked: false });
  h.deps.getLink = async () => { throw new Error('db down'); };
  await handleWith(h.deps, text('hi'));
  assert.equal(h.sent.at(-1)!.body, APOLOGY);
  const e = makeFake({ tasks: three(), gemini: async () => gem([]) });
  await handleWith(e.deps, text('???x'));
  assert.match(e.sent.at(-1)!.body, /didn't catch/);
});

await test('session: turns capped at 12, updatedAt set; reactions ignored', async () => {
  const f = makeFake({ tasks: three() });
  for (let i = 0; i < 10; i++) await handleWith(f.deps, text('today'));
  assert.equal(f.getSession().turns.length, 12);
  const before = f.sent.length;
  await handleWith(f.deps, { id: 'r', from: '9100', timestamp: 9, type: 'reaction', reaction: { emoji: '👍', messageId: 'x' } });
  assert.equal(f.sent.length, before);
});

await test('callGemini: REST shape, fallback model on failure, key never in errors', async () => {
  const urls: string[] = [];
  let bodySeen: Record<string, unknown> = {};
  const fetchImpl = (async (url: string, init: { body: string }) => {
    urls.push(url);
    bodySeen = JSON.parse(init.body);
    if (urls.length === 1) return new Response('nope', { status: 500 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: 'reply', args: { text: 'ok' } } }, { functionCall: { name: 'bogus', args: {} } }] } }] }));
  }) as unknown as typeof fetch;
  const r = await callGemini(
    { system: 'S', user: [{ text: 'hi' }], tools: [{ name: 'reply', description: 'd' }] },
    { fetchImpl, env: { GEMINI_API_KEY: 'KEY123' } },
  );
  assert.match(urls[0], /models\/gemini-3\.1-flash-lite:generateContent\?key=KEY123/);
  assert.match(urls[1], /models\/gemini-3\.8-flash:generateContent/);
  assert.deepEqual(r.calls, [{ name: 'reply', args: { text: 'ok' } }]);
  assert.ok((bodySeen as { tools: unknown[] }).tools);
  const bad = (async () => new Response('x', { status: 500 })) as unknown as typeof fetch;
  await assert.rejects(callGemini({ system: 'S', user: [], tools: [] }, { fetchImpl: bad, env: { GEMINI_API_KEY: 'KEY123' } }), (e: Error) => !e.message.includes('KEY123'));
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
