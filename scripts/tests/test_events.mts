// Events: pure rules, the English reader, task-vs-event table, repeat expansion, calendar mirror + ICS, the bot (fake deps, no network).
// Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_events.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  alignSeries, classifyItem, currentOrNext, defaultReminderMinutes, isEventish, localDay, nextStart, normalizeRepeat, occurrencesBetween, wallToMs,
} from '../../lib/events/rules';
import { parseCancelText, parseClock, parseDuration, parseEventText, parseRepeat } from '../../lib/events/parse';
import { calendarEntries, eventForTask, eventsForEvents } from '../../lib/server/calendarEvents';
import { buildIcs } from '../../lib/server/ics';
import { googleBody } from '../../lib/server/googleCal';
import { normalizeEventRequest } from '../../lib/server/events';
import { BadRequest } from '../../lib/server/meetings';
import { handleWith } from '../../lib/bot/core';
import { matchEvents, rangeLabel } from '../../lib/bot/events';
import { parseFast, parseSlash } from '../../lib/bot/fastpath';
import type { BotDeps, EventBotDeps, GeminiResult } from '../../lib/bot/types';
import type { EventItem, Meeting } from '../../lib/meetings/types';
import type { InboundMessage } from '../../lib/wa/types';
import { makeFake, mkTask } from './fakes';

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}
let n = 0;
const text = (s: string, from = '9100'): InboundMessage => ({ id: 'm' + ++n, from, timestamp: 1000 + n, type: 'text', text: s });
const IST = 'Asia/Kolkata';
const NOW = Date.parse('2026-11-01T08:30:00Z'); // the fake clock: Sun 1 Nov 2026 14:00 IST
const ctx = { today: '2026-11-01', time: '14:00', tz: IST };

// ---------- the reader ----------
await test('parse: "physio today 4:30pm for 1 hour"', () => {
  const p = parseEventText('physio today 4:30pm for 1 hour', ctx)!;
  assert.deepEqual([p.title, p.date, p.time, p.durationMin, p.kind], ['Physio', '2026-11-01', '16:30', 60, 'event']);
  assert.equal(parseEventText('physio today 4:30 pm for 1 hour', ctx)!.time, '16:30');
});

await test('parse: ranges ("4:30-5:30pm", "11 to 1pm", "10:00-11:30")', () => {
  const a = parseEventText('physio 4:30-5:30pm', ctx)!;
  assert.deepEqual([a.time, a.durationMin, a.endStated, a.kind], ['16:30', 60, true, 'event']);
  const b = parseEventText('lunch 11 to 1pm', ctx)!;
  assert.deepEqual([b.time, b.durationMin], ['11:00', 120]);
  const c = parseEventText('standup 10:00-10:15', ctx)!;
  assert.deepEqual([c.time, c.durationMin], ['10:00', 15]);
  const d = parseClock('from 9am till 10:30am')!;
  assert.deepEqual([d.start, d.end], ['09:00', '10:30']);
});

await test('parse: lengths in every shape', () => {
  assert.equal(parseDuration('for 45 mins')?.min, 45);
  assert.equal(parseDuration('for 1.5 hours')?.min, 90);
  assert.equal(parseDuration('for 1 hour 30 min')?.min, 90);
  assert.equal(parseDuration('for an hour')?.min, 60);
  assert.equal(parseDuration('half an hour')?.min, 30);
  assert.equal(parseDuration('1h')?.min, 60);
  assert.equal(parseDuration('no length here'), null);
  assert.equal(parseDuration('for 25 hours'), null);
});

await test('parse: repeat ("music class every tuesday 6pm for 1h")', () => {
  const p = parseEventText('music class every tuesday 6pm for 1h', ctx)!;
  assert.deepEqual([p.title, p.time, p.durationMin, p.kind], ['Music class', '18:00', 60, 'event']);
  assert.deepEqual(p.repeat, { freq: 'weekly', days: [2] });
  assert.deepEqual(parseRepeat('yoga every tue and thu').repeat, { freq: 'weekly', days: [2, 4] });
  assert.deepEqual(parseRepeat('standup weekdays').repeat, { freq: 'weekdays' });
  assert.deepEqual(parseRepeat('swim daily').repeat, { freq: 'daily' });
  assert.deepEqual(parseRepeat('swim every day').repeat, { freq: 'daily' });
  assert.deepEqual(parseRepeat('mon-fri standup').repeat, { freq: 'weekdays' });
  assert.equal(parseRepeat('physio today').repeat, undefined);
});

await test('parse: days and dates', () => {
  assert.equal(parseEventText('dinner with Ali tomorrow at 8pm', ctx)!.date, '2026-11-02');
  assert.equal(parseEventText('dentist on friday 3pm', ctx)!.date, '2026-11-06');
  assert.equal(parseEventText('flight on 14 nov 6:45am', ctx)!.date, '2026-11-14');
  assert.equal(parseEventText('flight 3 jan 6:45am', ctx)!.date, '2027-01-03', 'a date already past this year means next year');
  assert.equal(parseEventText('class 5pm', ctx)!.date, '2026-11-01', 'no day = today');
  assert.equal(parseEventText('carnatic class for 45 mins, starting from 4pm today, set the event', ctx)!.durationMin, 45);
});

await test('parse: lists, reminders and unreadable text are left to the model', () => {
  assert.equal(parseEventText('gym 6pm, call mom', ctx), null);
  assert.equal(parseEventText('class at 9', ctx), null, 'a bare hour has no am/pm: ask the model');
  assert.equal(parseEventText('remind me to call mom at 5pm', ctx), null);
  assert.equal(parseEventText('hello there', ctx), null);
  assert.equal(parseEventText('physio 4:30pm\nclass 6pm', ctx), null);
  assert.equal(parseCancelText('cancel physio'), 'physio');
  assert.equal(parseCancelText('cancel my physio session.'), 'physio');
  assert.equal(parseCancelText('cancel 2'), null);
  assert.equal(parseCancelText('delete gym'), null, 'only "cancel" is taken for events');
});

// ---------- task or event ----------
await test('classification table: a start time plus a length or an event-like word', () => {
  const rows: [string, 'event' | 'task'][] = [
    ['physio today 4:30pm for 1 hour', 'event'],
    ['physio 4:30-5:30pm', 'event'],
    ['carnatic class 4pm today', 'event'],
    ['dentist friday 3pm', 'event'],
    ['dinner with Ali tomorrow 8pm', 'event'],
    ['music class every tuesday 6pm', 'event'],
    ['football 5pm', 'event'],
    ['call mom 6pm', 'task'],
    ['gym 6pm', 'task'],
    ['pay rent 5pm', 'task'],
    ['gym every day 6pm', 'task'],
    ['call mom 6pm for 20 min', 'event'],
  ];
  for (const [s, want] of rows) assert.equal(parseEventText(s, ctx)?.kind, want, s);
  assert.equal(classifyItem({ title: 'physio', hasTime: false }), 'task', 'no start time = task');
  assert.equal(classifyItem({ title: 'write report', hasTime: false, durationStated: true }), 'task');
  assert.equal(isEventish('Call mom'), false);
  assert.equal(isEventish('Physio session'), true);
});

// ---------- rules ----------
const series = (startIso: string, mins: number, repeat: unknown, extra: object = {}) => ({
  startAt: startIso, endAt: new Date(Date.parse(startIso) + mins * 60_000).toISOString(), tz: IST, repeat: normalizeRepeat(repeat), ...extra,
});

await test('occurrences: weekly on named days, weekdays, daily, until, exceptions', () => {
  const tue = series('2026-11-03T12:30:00.000Z', 60, { freq: 'weekly', days: [2] }); // Tue 6pm IST
  const o = occurrencesBetween(tue, Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-12-01T00:00:00Z'));
  assert.deepEqual(o.map((x) => x.date), ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']);
  assert.equal(o[0].endMs - o[0].startMs, 3_600_000);
  const tt = series('2026-11-03T12:30:00.000Z', 60, { freq: 'weekly', days: [4, 2] });
  assert.deepEqual(occurrencesBetween(tt, Date.parse('2026-11-01T00:00:00Z'), Date.parse('2026-11-12T00:00:00Z')).map((x) => x.date), ['2026-11-03', '2026-11-05', '2026-11-10']);
  const wk = series('2026-11-02T04:30:00.000Z', 15, { freq: 'weekdays' }); // Mon 10:00 IST
  assert.equal(occurrencesBetween(wk, Date.parse('2026-11-02T00:00:00Z'), Date.parse('2026-11-09T00:00:00Z')).length, 5);
  const daily = series('2026-11-02T04:30:00.000Z', 30, { freq: 'daily', until: '2026-11-05' });
  assert.deepEqual(occurrencesBetween(daily, 0, Date.parse('2027-01-01T00:00:00Z')).map((x) => x.date), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
  const skipped = series('2026-11-02T04:30:00.000Z', 30, { freq: 'daily' }, { exceptions: ['2026-11-03'] });
  assert.deepEqual(occurrencesBetween(skipped, Date.parse('2026-11-02T00:00:00Z'), Date.parse('2026-11-05T00:00:00Z')).map((x) => x.date), ['2026-11-02', '2026-11-04']);
  assert.equal(occurrencesBetween(tue, 0, Date.parse('2026-11-02T00:00:00Z')).length, 0, 'nothing before the first occurrence');
});

await test('occurrences keep the wall clock across DST (New York, 1 Nov 2026 clocks go back)', () => {
  const ny = { startAt: new Date(wallToMs('2026-10-30', '18:00', 'America/New_York')).toISOString(), endAt: new Date(wallToMs('2026-10-30', '19:00', 'America/New_York')).toISOString(), tz: 'America/New_York', repeat: { freq: 'daily' as const } };
  const o = occurrencesBetween(ny, Date.parse('2026-10-30T00:00:00Z'), Date.parse('2026-11-04T00:00:00Z'));
  assert.equal(o.length, 5);
  assert.equal(o[0].startMs, Date.parse('2026-10-30T22:00:00Z')); // EDT
  assert.equal(o[3].startMs, Date.parse('2026-11-02T23:00:00Z')); // EST: same 6pm, one hour later in UTC
});

await test('alignSeries: a series starts on its first matching day, never in the past', () => {
  const sunTue = series(wallIst('2026-11-01', '18:00'), 60, { freq: 'weekly', days: [2] });
  const a = alignSeries(sunTue, NOW)!;
  assert.equal(localDay(Date.parse(a.startAt), IST), '2026-11-03');
  const lateTue = series(wallIst('2026-11-03', '18:00'), 60, { freq: 'weekly', days: [2] });
  assert.equal(localDay(Date.parse(alignSeries(lateTue, Date.parse('2026-11-03T14:00:00Z'))!.startAt), IST), '2026-11-10');
  assert.deepEqual(alignSeries({ startAt: 'a', endAt: 'b', tz: IST }, NOW), { startAt: 'a', endAt: 'b' });
});
function wallIst(d: string, t: string) { return new Date(wallToMs(d, t, IST)).toISOString(); }

await test('currentOrNext / nextStart for one-offs and series', () => {
  const one = series(wallIst('2026-11-01', '16:30'), 60, undefined);
  assert.equal(currentOrNext(one, NOW)!.startMs, wallToMs('2026-11-01', '16:30', IST));
  assert.equal(currentOrNext(one, wallToMs('2026-11-01', '17:00', IST))!.endMs, wallToMs('2026-11-01', '17:30', IST), 'running now counts');
  assert.equal(currentOrNext(one, wallToMs('2026-11-01', '17:31', IST)), null, 'over');
  const sr = series(wallIst('2026-11-03', '18:00'), 60, { freq: 'weekly', days: [2] });
  assert.equal(nextStart(sr, wallToMs('2026-11-03', '18:00', IST))!.date, '2026-11-10', 'at the start moment the next one is a week away');
});

await test('default reminder: 30 min, else 10, else none', () => {
  const t = (min: number) => NOW + min * 60_000;
  assert.deepEqual(defaultReminderMinutes(t(120), NOW), [30]);
  assert.deepEqual(defaultReminderMinutes(t(20), NOW), [10]);
  assert.deepEqual(defaultReminderMinutes(t(5), NOW), []);
});

// ---------- request validation (server, pure) ----------
await test('normalizeEventRequest: default length 60, default nudge 30, past refused, repeat aligned', () => {
  const b = normalizeEventRequest({ title: ' Physio ', start: '2026-11-01 16:30', tz: IST, createdVia: 'bot' }, NOW);
  assert.equal(b.endMs - b.startMs, 3_600_000);
  assert.deepEqual(b.reminderMinutes, [30]);
  assert.throws(() => normalizeEventRequest({ title: 'x', start: '2026-11-01 10:00', tz: IST, createdVia: 'bot' }, NOW), /past/);
  assert.throws(() => normalizeEventRequest({ title: 'x', start: '2026-11-02 10:00', durationMin: 2, tz: IST, createdVia: 'bot' }, NOW), BadRequest);
  assert.throws(() => normalizeEventRequest({ title: '', start: '2026-11-02 10:00', tz: IST, createdVia: 'bot' }, NOW), BadRequest);
  assert.throws(() => normalizeEventRequest({ title: 'x', start: '2026-11-02 10:00', tz: IST, createdVia: 'bot', repeat: { freq: 'monthly' } as never }, NOW), /bad repeat/);
  const r = normalizeEventRequest({ title: 'Class', start: '2026-11-01 18:00', tz: IST, repeat: { freq: 'weekly', days: [2] }, createdVia: 'app' }, NOW);
  assert.equal(localDay(r.startMs, IST), '2026-11-03');
  const soon = normalizeEventRequest({ title: 'x', start: '2026-11-01 14:20', tz: IST, createdVia: 'bot' }, NOW);
  assert.deepEqual(soon.reminderMinutes, [10]);
  assert.deepEqual(normalizeEventRequest({ title: 'x', start: '2026-11-02 14:20', tz: IST, createdVia: 'bot', reminderMinutes: [] }, NOW).reminderMinutes, []);
});

// ---------- calendar mirror + ICS ----------
const ev = (id: string, startIso: string, mins: number, extra: Partial<Meeting> = {}): Meeting => ({
  id, ownerUid: 'u1', kind: 'event', title: 'Physio', startAt: startIso, endAt: new Date(Date.parse(startIso) + mins * 60_000).toISOString(), tz: IST, attendees: [],
  status: 'scheduled', createdVia: 'bot', reminderMinutes: [30], createdAt: '', updatedAt: '', ...extra,
});

await test('mirror: an event keeps its REAL length (60 min, not the fixed 30)', () => {
  const [e] = eventsForEvents([ev('e1', '2026-11-01T11:00:00.000Z', 60, { location: 'Clinic' })], NOW);
  assert.equal(e.endMs! - e.startMs!, 3_600_000);
  assert.equal(e.title, 'Physio');
  assert.equal(e.taskId, 'ev:e1');
  const ics = buildIcs([e], { name: 'Nudge', now: NOW });
  assert.match(ics, /DTSTART:20261101T110000Z/);
  assert.match(ics, /DTEND:20261101T120000Z/);
  assert.match(ics, /LOCATION:Clinic/);
  const g = googleBody(e, IST) as { end: { dateTime: string }; location: string };
  assert.equal(g.end.dateTime, '2026-11-01T12:00:00.000Z');
  assert.equal(g.location, 'Clinic');
});

await test('mirror: a cancelled event and an event outside the window are not shown; a series expands inside the window only', () => {
  assert.equal(eventsForEvents([ev('e1', '2026-11-01T11:00:00.000Z', 60, { status: 'cancelled' })], NOW).length, 0);
  assert.equal(eventsForEvents([ev('e2', '2027-03-01T11:00:00.000Z', 60)], NOW).length, 0);
  const weekly = eventsForEvents([ev('w', '2026-11-03T12:30:00.000Z', 60, { repeat: { freq: 'weekly', days: [2] } })], NOW);
  assert.equal(weekly.length, 13, '90 days of Tuesdays');
  assert.equal(new Set(weekly.map((x) => x.taskId)).size, 13, 'one key (one Google event) per occurrence');
  assert.ok(weekly.every((x) => x.endMs! - x.startMs! === 3_600_000));
  const meeting = { ...ev('m', '2026-11-01T11:00:00.000Z', 30), kind: 'meeting' as const };
  assert.equal(eventsForEvents([meeting], NOW).length, 0, 'meetings are not the mirror\'s business');
});

await test('mirror: the reminder tasks of an event do NOT become duplicate calendar entries', () => {
  const reminder = mkTask('r1', 'Physio at 4:30 PM', { reminderOf: 'e1', remindAt: NOW, remindFor: Date.parse('2026-11-01T11:00:00Z') });
  assert.equal(eventForTask(reminder, IST), null);
  const all = calendarEntries({ tasks: [reminder], events: [ev('e1', '2026-11-01T11:00:00.000Z', 60)], tz: IST, now: NOW });
  assert.equal(all.length, 1);
  assert.equal(all[0].taskId, 'ev:e1');
});

await test('mirror: a task with a stated length uses it (class 4pm for 45 min = 45 min)', () => {
  const t = mkTask('t1', 'Class', { deferredTo: '2026-11-01T16:00', durationMin: 45 });
  const e = eventForTask(t, IST)!;
  assert.equal(e.endMs! - e.startMs!, 45 * 60_000);
  assert.equal(eventForTask(mkTask('t2', 'Gym', { deferredTo: '2026-11-01T18:00' }), IST)!.endMs! - eventForTask(mkTask('t2', 'Gym', { deferredTo: '2026-11-01T18:00' }), IST)!.startMs!, 30 * 60_000);
});

await test('the native app carries a byte-identical copy of the pure rules', () => {
  const a = readFileSync(new URL('../../lib/events/rules.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const b = readFileSync(new URL('../../native/src/lib/eventsRules.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(b.split('\n').slice(1).join('\n'), a.split('\n').slice(1).join('\n'), 'native/src/lib/eventsRules.ts must equal lib/events/rules.ts (after its one header line)');
});

// ---------- the bot ----------
class Bad extends Error {}
const T0 = '2026-11-01T08:30:00Z';
function fakeEvents(initial: Meeting[] = []) {
  const docs = new Map<string, Meeting>(initial.map((m) => [m.id, m]));
  const calls: string[] = [];
  let seq = 0;
  const d: EventBotDeps = {
    create: async (_u, req, now = Date.parse(T0)) => {
      const nz = normalizeEventRequest(req, now); // the real validation
      const m: Meeting = {
        id: 'ev' + ++seq, ownerUid: 'u1', kind: 'event', title: nz.title, startAt: new Date(nz.startMs).toISOString(), endAt: new Date(nz.endMs).toISOString(), tz: nz.tz,
        attendees: [], ...(nz.repeat ? { repeat: nz.repeat } : {}), status: 'scheduled', createdVia: 'bot', reminderMinutes: nz.reminderMinutes, createdAt: '', updatedAt: '',
      };
      docs.set(m.id, m);
      calls.push(`create ${JSON.stringify(req)}`);
      return { event: m };
    },
    listUpcoming: async (_u, _l, now = Date.parse(T0)) => [...docs.values()].filter((m) => m.status === 'scheduled')
      .map((m): EventItem => { const o = currentOrNext(m, now); return { ...m, next: o ? { startAt: new Date(o.startMs).toISOString(), endAt: new Date(o.endMs).toISOString() } : null }; })
      .filter((i) => i.next),
    update: async (_u, id, patch) => {
      calls.push(`update ${id} ${JSON.stringify(patch)}`);
      const m = docs.get(id); if (!m) return null;
      const tz = m.tz;
      if (patch.start) { const [dd, tt] = patch.start.split(' '); const dur = Date.parse(m.endAt) - Date.parse(m.startAt); m.startAt = new Date(wallToMs(dd, tt, tz)).toISOString(); m.endAt = new Date(Date.parse(m.startAt) + dur).toISOString(); }
      if (patch.durationMin) m.endAt = new Date(Date.parse(m.startAt) + patch.durationMin * 60_000).toISOString();
      return m;
    },
    cancel: async (_u, id) => { calls.push(`cancel ${id}`); const m = docs.get(id); if (!m) return null; m.status = 'cancelled'; return m; },
    isBadRequest: (e) => e instanceof BadRequest || e instanceof Bad,
  };
  return { d, docs, calls };
}
function bot(events: EventBotDeps | undefined, gemini?: (r: Parameters<BotDeps['gemini']>[0]) => Promise<GeminiResult>, link: object = {}) {
  const f = makeFake({ gemini, link });
  if (events) f.deps.events = events;
  return f;
}
const last = (f: ReturnType<typeof makeFake>) => f.sent[f.sent.length - 1].body;
const noModel = async (): Promise<GeminiResult> => { throw new Error('the model must not be called'); };

await test('bot: "physio today 4:30 pm for 1 hour" -> an event, no model, reads like a set event', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, noModel);
  await handleWith(f.deps, text('physio today 4:30 pm for 1 hour'));
  assert.equal(f.geminiReqs.length, 0);
  const created = JSON.parse(fe.calls[0].slice('create '.length));
  assert.deepEqual([created.title, created.start, created.durationMin, created.tz, created.createdVia], ['Physio', '2026-11-01 16:30', 60, IST, 'bot']);
  assert.equal([...f.tasks.values()].length, 0, 'no task was created');
  assert.equal(f.calls.filter((c) => c.startsWith('addTasks')).length, 0);
  assert.equal(last(f), "📅 *Physio* — today, 4:30–5:30 PM\nI'll nudge you at 4:00 PM. (reply 'cancel physio' to remove)");
});

await test('bot: "4:30-5:30pm" gives an 60-min event; "tomorrow" is named', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, noModel);
  await handleWith(f.deps, text('physio tomorrow 4:30-5:30pm'));
  assert.match(last(f), /^📅 \*Physio\* — tomorrow, 4:30–5:30 PM/);
  await handleWith(f.deps, text('lunch with Sam on friday 12:30 to 1:30pm'));
  assert.match(last(f), /^📅 \*Lunch with Sam\* — Fri 6 Nov, 12:30–1:30 PM/);
});

await test('bot: a range that crosses noon writes both AM/PM', () => {
  assert.equal(rangeLabel('11:30', '12:30'), '11:30 AM–12:30 PM');
  assert.equal(rangeLabel('16:30', '17:30'), '4:30–5:30 PM');
  assert.equal(rangeLabel('09:00', '09:45'), '9:00–9:45 AM');
});

await test('bot: "call mom 6pm" and "gym 6pm" stay tasks (they go to the model)', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, async () => ({ text: '', calls: [{ name: 'add_tasks', args: { items: [{ text: 'Call mom', when: '2026-11-01T18:00' }] } }] }));
  await handleWith(f.deps, text('call mom 6pm'));
  assert.equal(f.geminiReqs.length, 1);
  assert.equal(fe.calls.length, 0);
  assert.match(f.calls.find((c) => c.startsWith('addTasks'))!, /Call mom/);
  assert.match(last(f), /Added/);
});

await test('bot: music class every tuesday -> a weekly series, first day is Tuesday', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, noModel);
  await handleWith(f.deps, text('music class every tuesday 6pm for 1h'));
  const created = JSON.parse(fe.calls[0].slice('create '.length));
  assert.deepEqual(created.repeat, { freq: 'weekly', days: [2] });
  assert.equal(created.durationMin, 60);
  assert.match(last(f), /^📅 \*Music class\* — every Tuesday, 6:00–7:00 PM\nNext: Tue 3 Nov, 6:00–7:00 PM\.\nI'll nudge you at 5:30 PM\. \(reply 'cancel music class' to remove\)/);
});

await test('bot: the model path - create_event tool, default length, repeat days', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, async () => ({ text: '', calls: [{ name: 'create_event', args: { title: 'Yoga', start: '2026-11-03T07:00', repeat: 'weekly', repeat_days: ['tue', 'thu'] } }] }));
  await handleWith(f.deps, text('yoga every tue thu 7 in the morning'));
  const created = JSON.parse(fe.calls[0].slice('create '.length));
  assert.equal(created.durationMin, 60, 'no stated length = 60');
  assert.deepEqual(created.repeat, { freq: 'weekly', days: [2, 4] });
  assert.match(last(f), /every Tuesday, Thursday, 7:00–8:00 AM/);
});

await test('bot: a timed add_tasks item that the rules call an event is routed to an event (a model slip)', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, async () => ({ text: '', calls: [{ name: 'add_tasks', args: { items: [
    { text: 'class', when: '2026-11-01T16:00', duration_min: 45 },
    { text: 'call mom', when: '2026-11-01T18:00' },
  ] } }] }));
  await handleWith(f.deps, text('class 4pm for 45 min and call mom 6pm'));
  assert.equal(fe.calls.length, 1);
  assert.match(fe.calls[0], /"title":"class".*"durationMin":45/);
  assert.equal(f.calls.filter((c) => c.startsWith('addTasks')).length, 1, 'only the call is a task');
  const out = f.sent.map((s) => s.body).join('\n');
  assert.match(out, /📅 \*class\* — today, 4:00–4:45 PM/);
  assert.match(out, /call mom/);
});

await test('bot: /task always adds a TASK, even with a time and a length', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, async () => ({ text: '', calls: [{ name: 'add_tasks', args: { items: [{ text: 'Physio', when: '2026-11-01T16:30', duration_min: 60 }] } }] }));
  await handleWith(f.deps, text('/task physio 4:30pm for 1 hour'));
  assert.equal(fe.calls.length, 0);
  assert.equal(f.calls.filter((c) => c.startsWith('addTasks')).length, 1);
});

await test('bot: /event always an event; /events lists; text "events" lists', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, noModel);
  await handleWith(f.deps, text('/event call dad 7pm'));
  assert.match(fe.calls[0], /"title":"Call dad".*"durationMin":60/);
  assert.match(last(f), /📅 \*Call dad\* — today, 7:00–8:00 PM/);
  await handleWith(f.deps, text('/events'));
  assert.match(last(f), /Your next events[\s\S]*1\. \*Call dad\* · today 7:00–8:00 PM/);
  await handleWith(f.deps, text('my events'));
  assert.match(last(f), /Your next events/);
  assert.deepEqual(parseSlash('/event physio 4pm'), { fast: { t: 'addEvent', text: 'physio 4pm' } });
  assert.deepEqual(parseSlash('/events'), { fast: { t: 'events' } });
  assert.deepEqual(parseFast(text('events')), { t: 'events' });
});

await test('bot: cancel physio (no model), unknown title falls through to the model, ambiguity asks', async () => {
  const fe = fakeEvents([ev('p1', '2026-11-01T11:00:00.000Z', 60), ev('p2', '2026-11-02T11:00:00.000Z', 60, { title: 'Piano lesson' })]);
  const f = bot(fe.d, noModel);
  await handleWith(f.deps, text('cancel physio'));
  assert.deepEqual(fe.calls, ['cancel p1']);
  assert.match(last(f), /^❌ Cancelled \*Physio\* \(today, 4:30–5:30 PM\)\. The reminders are removed\./);
  const f2 = bot(fe.d, async () => ({ text: '', calls: [{ name: 'delete_task', args: { ref: 'gym' } }] }));
  f2.tasks.set('t1', mkTask('t1', 'gym'));
  await handleWith(f2.deps, text('cancel gym'));
  assert.equal(f2.geminiReqs.length, 1, 'no event named gym: the model decides');
  const two = fakeEvents([ev('a', '2026-11-01T11:00:00.000Z', 60, { title: 'Class A' }), ev('b', '2026-11-02T11:00:00.000Z', 60, { title: 'Class B' })]);
  const f3 = bot(two.d, noModel);
  await handleWith(f3.deps, text('cancel class'));
  assert.equal(two.calls.length, 0);
  assert.match(last(f3), /Which one\?.*Class A.*Class B/);
});

await test('bot: cancel and move through the model tools', async () => {
  const fe = fakeEvents([ev('p1', '2026-11-01T11:00:00.000Z', 60)]);
  const f = bot(fe.d, async () => ({ text: '', calls: [{ name: 'move_event', args: { ref: 'physio', start: '2026-11-01T17:00', duration_min: 90 } }] }));
  await handleWith(f.deps, text('move physio to 5pm and make it 90 minutes'));
  assert.deepEqual(fe.calls, ['update p1 {"start":"2026-11-01 17:00","durationMin":90}']);
  assert.match(last(f), /^📅 Moved \*Physio\* to today, 5:00–6:30 PM\./);
  const f2 = bot(fe.d, async () => ({ text: '', calls: [{ name: 'cancel_event', args: { ref: 'physio' } }] }));
  await handleWith(f2.deps, text('please drop the physio, plans changed'));
  assert.match(last(f2), /Cancelled \*Physio\*/);
});

await test('bot: moving one day of a repeating event is refused (days belong to the series), moving its time is fine', async () => {
  const fe = fakeEvents([ev('w', '2026-11-03T12:30:00.000Z', 60, { title: 'Music class', repeat: { freq: 'weekly', days: [2] } })]);
  const f = bot(fe.d, async () => ({ text: '', calls: [{ name: 'move_event', args: { ref: 'music class', start: '2026-11-05T18:00' } }] }));
  await handleWith(f.deps, text('move music class to thursday'));
  assert.match(last(f), /can only change its time or length/);
  const f2 = bot(fe.d, async () => ({ text: '', calls: [{ name: 'move_event', args: { ref: 'music class', start: '2026-11-03T19:00' } }] }));
  await handleWith(f2.deps, text('move music class to 7pm'));
  assert.match(fe.calls[fe.calls.length - 1], /"start":"2026-11-03 19:00"/);
});

await test('bot: a time that has passed asks again; server failure is not leaked', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, noModel);
  await handleWith(f.deps, text('physio today 9am for 1 hour'));
  assert.match(last(f), /already passed/);
  assert.equal(fe.docs.size, 0);
  const broken: EventBotDeps = { ...fe.d, create: async () => { throw new Error('secret firestore detail'); } };
  const f2 = bot(broken, noModel);
  await handleWith(f2.deps, text('physio today 5pm for 1 hour'));
  assert.doesNotMatch(last(f2), /secret/);
  assert.match(last(f2), /could not set that event/);
});

await test('bot: Malayalam and Hindi users get the event reply in their language (times stay Latin)', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, noModel, { lang: 'ml', langManual: true });
  await handleWith(f.deps, text('physio today 4:30pm for 1 hour'));
  assert.match(last(f), /📅 \*Physio\* — ഇന്ന്, 4:30–5:30 PM/);
  assert.match(last(f), /4:00 PM-ന് ഞാൻ ഓർമ്മിപ്പിക്കാം/);
  assert.match(last(f), /'cancel physio'/);
  const f2 = bot(fakeEvents().d, noModel, { lang: 'hi', langManual: true });
  await handleWith(f2.deps, text('physio today 4:30pm for 1 hour'));
  assert.match(last(f2), /📅 \*Physio\* — आज, 4:30–5:30 PM/);
});

await test('bot: Malayalam script text (no English phrase) goes to the model, which can call create_event', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, async () => ({ text: '', calls: [{ name: 'create_event', args: { title: 'ഫിസിയോ', start: '2026-11-01T16:30', duration_min: 60 } }] }));
  await handleWith(f.deps, text('ഇന്ന് 4:30 ന് ഫിസിയോ ഒരു മണിക്കൂർ'));
  assert.equal(f.geminiReqs.length, 1);
  assert.match(last(f), /📅 \*ഫിസിയോ\*/);
});

await test('bot: without events deps a timed item is still a task (nothing breaks)', async () => {
  const f = bot(undefined, async () => ({ text: '', calls: [{ name: 'add_tasks', args: { items: [{ text: 'Class', when: '2026-11-01T16:00', duration_min: 45 }] } }] }));
  await handleWith(f.deps, text('class 4pm for 45 min'));
  assert.equal(f.geminiReqs.length, 1);
  assert.match(f.calls.find((c) => c.startsWith('addTasks'))!, /Class/);
});

await test('bot: tool list carries the event tools and the prompt tells task from event', async () => {
  const fe = fakeEvents();
  const f = bot(fe.d, async () => ({ text: 'ok', calls: [] }));
  await handleWith(f.deps, text('hello'));
  const req = f.geminiReqs[0];
  for (const name of ['create_event', 'move_event', 'cancel_event', 'list_events', 'add_tasks']) assert.ok(req.tools.some((t) => t.name === name), name);
  assert.match(req.system, /Tasks vs events/);
  assert.match(req.system, /call mom 6pm/);
});

await test('formatEventSet / matchEvents unit checks', () => {
  const items = [ev('a', '2026-11-01T11:00:00.000Z', 60, { title: 'Physio' }), ev('b', '2026-11-02T11:00:00.000Z', 60, { title: 'Piano lesson' })].map((m): EventItem => ({ ...m, next: { startAt: m.startAt, endAt: m.endAt } }));
  assert.deepEqual(matchEvents(items, 'physio').map((i) => i.id), ['a']);
  assert.deepEqual(matchEvents(items, 'P').map((i) => i.id), ['a', 'b']);
  assert.deepEqual(matchEvents(items, 'my physio session').map((i) => i.id), ['a'], 'a longer phrase that contains the title still finds it');
  assert.deepEqual(matchEvents(items, 'lesson').map((i) => i.id), ['b']);
});

console.log(`${passed} passed`);
