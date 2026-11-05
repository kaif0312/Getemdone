// Calendar tests: event mapping, month/week grids, command parsing, and the bot flow with a fake image sender.
// Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_calendar_images.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { agendaText, buildMonth, buildWeek, eventsInRange } from '../../lib/calendar/events';
import { parseFast } from '../../lib/bot/fastpath';
import { handleWith } from '../../lib/bot/core';
import type { InboundMessage } from '../../lib/wa/types';
import { makeFake, mkTask } from './fakes';

let n = 0;
const text = (t: string): InboundMessage => ({ id: 'm' + ++n, from: '9100', timestamp: 1000 + n, type: 'text', text: t });
const tap = (id: string): InboundMessage => ({ id: 'm' + ++n, from: '9100', timestamp: 1000 + n, type: 'interactive', reply: { id, title: 'x' } });
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}

const tz = 'Asia/Kuwait';
const today = '2026-11-05'; // a Thursday
const tasks = [
  mkTask('a', 'gym', { deferredTo: '2026-11-05T18:00' }),
  mkTask('b', 'call mom', { deferredTo: '2026-11-05', completed: true }),
  mkTask('c', 'pay rent', { dueDate: Date.parse('2026-11-07T09:00:00+03:00') }),
  mkTask('d', 'pitch', { deferredTo: '2026-11-03', dueDate: Date.parse('2026-11-12T17:00:00+03:00') }),
  mkTask('e', 'someday'),
  mkTask('f', 'gone', { deferredTo: '2026-11-05', deleted: true }),
  mkTask('g', 'read', { deferredTo: '2026-11-01', recurrence: { frequency: 'daily', startDate: '2026-11-01', completedDates: ['2026-11-02'] } }),
  mkTask('h', 'remind only', { remindAt: Date.parse('2026-11-06T08:00:00+03:00') }),
];

await test('events: deferred, due, both, undated, deleted, reminder', async () => {
  const { events, undated } = eventsInRange(tasks, tz, '2026-11-01', '2026-11-30');
  const by = (id: string) => events.filter((e) => e.id === id);
  assert.deepEqual(by('a').map((e) => [e.date, e.time, e.kind]), [['2026-11-05', '18:00', 'task']]);
  assert.deepEqual(by('c').map((e) => [e.date, e.time, e.kind]), [['2026-11-07', '09:00', 'deadline']]);
  assert.deepEqual(by('d').map((e) => [e.date, e.kind]), [['2026-11-03', 'task'], ['2026-11-12', 'deadline']]);
  assert.deepEqual(by('h').map((e) => [e.date, e.time, e.kind]), [['2026-11-06', '08:00', 'reminder']]);
  assert.equal(by('f').length, 0);
  assert.equal(undated, 1); // 'someday'
  assert.equal(by('g').length, 30);
  assert.equal(by('g').find((e) => e.date === '2026-11-02')!.done, true);
  assert.equal(by('g').find((e) => e.date === '2026-11-03')!.done, false);
});

await test('events: sorted by day, then time; open before done', async () => {
  const { events } = eventsInRange(tasks, tz, '2026-11-05', '2026-11-05');
  assert.deepEqual(events.map((e) => e.text), ['gym', 'read', 'call mom']);
});

await test('month grid: Monday start, full weeks, today flagged, stats', async () => {
  const m = buildMonth(tasks, tz, today, 0);
  assert.equal(m.title, 'November 2026');
  assert.equal(m.weeks.length, 6); // Nov 2026 starts on Sunday: Oct 26 .. Dec 6
  assert.ok(m.weeks.every((w) => w.length === 7 && w[0].dow === 0));
  assert.equal(m.weeks[0][0].date, '2026-10-26');
  assert.equal(m.weeks.flat().filter((d) => d.isToday).length, 1);
  assert.equal(m.weeks.flat().find((d) => d.date === '2026-11-05')!.events.length, 3);
  assert.ok(m.total > 0 && m.done >= 1);
  assert.equal(buildMonth(tasks, tz, today, 1).title, 'December 2026');
  assert.equal(buildMonth(tasks, tz, '2026-01-31', 1).title, 'February 2026'); // no day-31 overflow
});

await test('week model: Mon-Sun, title spans months', async () => {
  const w = buildWeek(tasks, tz, today, 0);
  assert.deepEqual([w.from, w.to, w.title], ['2026-11-02', '2026-11-08', 'Nov 2 – 8, 2026']);
  assert.equal(buildWeek(tasks, tz, '2026-11-30', 0).title, 'Nov 30 – Dec 6, 2026');
  assert.equal(buildWeek(tasks, tz, today, -1).from, '2026-10-26');
});

await test('agenda text: labels, times', async () => {
  const w = buildWeek(tasks, tz, today, 0);
  const t = agendaText(w.days, today);
  assert.match(t, /\*Today 5 Nov\*/);
  assert.match(t, /6pm gym/);
  assert.match(t, /\*Tomorrow 6 Nov\*/);
});

await test('parse: slash + text commands', async () => {
  const p = (s: string) => parseFast(text(s));
  assert.deepEqual(p('/calendar'), { t: 'calendar', view: 'month', offset: 0 });
  assert.deepEqual(p('/cal week'), { t: 'calendar', view: 'week', offset: 0 });
  assert.deepEqual(p('/cal next'), { t: 'calendar', view: 'month', offset: 1 });
  assert.deepEqual(p('/cal next week'), { t: 'calendar', view: 'week', offset: 1 });
  assert.deepEqual(p('/cal last month'), { t: 'calendar', view: 'month', offset: -1 });
  assert.deepEqual(p('/agenda'), { t: 'calendar', view: 'week', offset: 0 });
  assert.deepEqual(p('calendar'), { t: 'calendar', view: 'month', offset: 0 });
  assert.deepEqual(p('Show calendar'), { t: 'calendar', view: 'month', offset: 0 });
  assert.deepEqual(p('week calendar'), { t: 'calendar', view: 'week', offset: 0 });
  assert.equal(p('what is on my calendar for lunch'), null); // sentences are left to the model
  assert.deepEqual(parseFast(tap('cal:week:-2')), { t: 'calendar', view: 'week', offset: -2 });
  assert.deepEqual(parseFast(tap('cal:month:999')), { t: 'calendar', view: 'month', offset: 24 });
  assert.equal(parseFast(tap('cal:year:1')), null);
  assert.deepEqual(p('/week'), { t: 'week' }); // fitness week is untouched
});

function withCalendar(f: ReturnType<typeof makeFake>, ok = true) {
  const sent: { view: string; caption: string; buttons: { id: string; title: string }[]; title: string }[] = [];
  f.deps.calendar = {
    tasks: async () => tasks,
    sendImage: async (_to, view, model, caption, buttons) => { sent.push({ view, caption, buttons, title: model.title }); return ok; },
  };
  return sent;
}

await test('bot: /calendar sends the month image with Prev/Next/Week buttons', async () => {
  const f = makeFake();
  const sent = withCalendar(f);
  await handleWith(f.deps, text('/calendar'));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].view, 'month');
  assert.equal(sent[0].title, 'November 2026');
  assert.deepEqual(sent[0].buttons.map((b) => b.id), ['cal:month:-1', 'cal:month:1', 'cal:week:0']);
  assert.match(sent[0].caption, /Coming up/);
  assert.equal(f.sent.length, 0); // no extra text
});

await test('bot: tapping Next walks forward; Week view switches', async () => {
  const f = makeFake();
  const sent = withCalendar(f);
  await handleWith(f.deps, tap('cal:month:1'));
  assert.equal(sent[0].title, 'December 2026');
  assert.deepEqual(sent[0].buttons.map((b) => b.id), ['cal:month:0', 'cal:month:2', 'cal:week:0']);
  await handleWith(f.deps, tap('cal:week:0'));
  assert.equal(sent[1].view, 'week');
  assert.deepEqual(sent[1].buttons.map((b) => b.id), ['cal:week:-1', 'cal:week:1', 'cal:month:0']);
});

await test('bot: image failure falls back to a text agenda', async () => {
  const f = makeFake();
  withCalendar(f, false);
  await handleWith(f.deps, text('/cal next week')); // the fake clock says today is 1 Nov
  assert.match(f.sent.at(-1)!.body, /gym/);
});

await test('bot: no calendar dep -> polite message, never a crash', async () => {
  const f = makeFake();
  await handleWith(f.deps, text('/calendar'));
  assert.match(f.sent.at(-1)!.body, /not available/);
});

console.log(`\n${passed} passed`);
