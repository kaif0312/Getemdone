// Pure checks of the native events view helpers (no React, no Firebase). Run in native/: npx tsx scripts/test_events_view.mts
import assert from 'node:assert/strict';
import type { Meeting } from '../src/lib/meetingsTypes';
import { draftOf, eventsOnDay, newEventDraft, occurrencesOf, repeatLabel, soonEvents, toEventBody, toEventPatch, validateEvent } from '../src/features/events/view';
import { wallToUtcMs } from '../src/features/meetings/view';

const IST = 'Asia/Kolkata';
const NOW = Date.parse('2026-11-01T08:30:00Z'); // Sun 1 Nov 2026 14:00 IST
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log('ok   ' + name); };
const ev = (id: string, date: string, time: string, mins: number, extra: Partial<Meeting> = {}): Meeting => {
  const s = wallToUtcMs(date, time, IST);
  return { id, ownerUid: 'u', kind: 'event', title: 'Physio', startAt: new Date(s).toISOString(), endAt: new Date(s + mins * 60_000).toISOString(), tz: IST, attendees: [], status: 'scheduled', createdVia: 'app', reminderMinutes: [30], createdAt: '', updatedAt: '', ...extra };
};

test('new draft: next half hour, 60 min, 30-min nudge, no repeat; a past day is ignored', () => {
  const d = newEventDraft(IST, undefined, NOW);
  assert.deepEqual([d.date, d.time, d.durationMin, d.reminderMinutes, d.repeat], ['2026-11-01', '14:30', 60, [30], null]);
  assert.equal(newEventDraft(IST, '2026-10-01', NOW).date, '2026-11-01');
  assert.deepEqual([newEventDraft(IST, '2026-11-05', NOW).date, newEventDraft(IST, '2026-11-05', NOW).time], ['2026-11-05', '09:00']);
});

test('validate: title, past one-off refused, a series may start in the past (the server aligns it)', () => {
  const d = { ...newEventDraft(IST, undefined, NOW), title: 'Physio' };
  assert.equal(validateEvent(d, NOW), null);
  assert.equal(validateEvent({ ...d, title: ' ' }, NOW), 'Give it a title.');
  assert.equal(validateEvent({ ...d, date: '2026-10-30' }, NOW), 'That time has passed.');
  assert.equal(validateEvent({ ...d, date: '2026-10-30', repeat: { freq: 'daily' } }, NOW), null);
  assert.equal(validateEvent({ ...d, repeat: { freq: 'weekly', days: [] } }, NOW), 'Pick at least one day.');
});

test('body and patch: the real instant, only what changed', () => {
  const d = { ...newEventDraft(IST, undefined, NOW), title: ' Physio ', date: '2026-11-01', time: '16:30', durationMin: 60 };
  const b = toEventBody(d);
  assert.equal(b.start, '2026-11-01T11:00:00.000Z');
  assert.deepEqual([b.title, b.durationMin, b.kind, b.createdVia, b.repeat], ['Physio', 60, 'event', 'app', undefined]);
  const e = ev('e1', '2026-11-01', '16:30', 60, { repeat: { freq: 'weekly', days: [2] } });
  const orig = draftOf(e);
  assert.deepEqual([orig.date, orig.time, orig.durationMin], ['2026-11-01', '16:30', 60]);
  assert.deepEqual(toEventPatch({ ...orig, title: 'Piano' }, orig), { title: 'Piano' }, 'a title edit never re-anchors the series');
  assert.deepEqual(toEventPatch({ ...orig, durationMin: 90, notes: ' hi ' }, orig), { durationMin: 90, notes: 'hi' });
  assert.deepEqual(toEventPatch({ ...orig, repeat: null }, orig), { repeat: null });
  assert.equal(toEventPatch({ ...orig, time: '17:00' }, orig).start, '2026-11-01T11:30:00.000Z');
  assert.deepEqual(toEventPatch(orig, orig), {});
});

test('labels', () => {
  assert.equal(repeatLabel(null), 'Does not repeat');
  assert.equal(repeatLabel({ freq: 'daily' }), 'Every day');
  assert.equal(repeatLabel({ freq: 'weekdays' }), 'Every weekday');
  assert.equal(repeatLabel({ freq: 'weekly', days: [2, 4] }), 'Every Tue, Thu');
});

test('Today block: running now + next 48 h; cancelled and finished ones are not listed', () => {
  const list = [
    ev('a', '2026-11-01', '13:30', 60), // running at 14:00
    ev('b', '2026-11-01', '16:30', 60),
    ev('c', '2026-11-04', '16:30', 60), // beyond 48 h
    ev('d', '2026-11-01', '15:00', 60, { status: 'cancelled' }),
    ev('e', '2026-11-01', '09:00', 30), // over
    { ...ev('m', '2026-11-01', '15:00', 30), kind: 'meeting' as const },
  ];
  assert.deepEqual(soonEvents(list, NOW).map((o) => o.event.id), ['a', 'b']);
});

test('a series: expanded per day, skipped days gone, one list for Calendar and Today', () => {
  const s = ev('w', '2026-11-03', '18:00', 60, { title: 'Music class', repeat: { freq: 'weekly', days: [2] }, exceptions: ['2026-11-10'] });
  const o = occurrencesOf([s], wallToUtcMs('2026-11-01', '00:00', IST), wallToUtcMs('2026-11-30', '00:00', IST));
  assert.deepEqual(o.map((x) => x.date), ['2026-11-03', '2026-11-17', '2026-11-24']);
  assert.equal(eventsOnDay([s], '2026-11-03', IST).length, 1);
  assert.equal(eventsOnDay([s], '2026-11-04', IST).length, 0);
  assert.equal(eventsOnDay([s], '2026-11-10', IST).length, 0, 'the cancelled day');
  assert.equal(eventsOnDay([ev('x', '2026-11-03', '23:30', 60)], '2026-11-03', IST).length, 1, 'by its start day');
});

console.log(`${passed} passed`);
