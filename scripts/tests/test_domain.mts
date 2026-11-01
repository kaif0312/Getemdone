// Pure tests: timezone helpers + computeStreak (no emulator needed).
import assert from 'node:assert/strict';
import { computeStreak, type StreakTask } from '../../lib/server/streaks';
import { addDays, localDate, localTime, shiftToServerWallClock, timezoneForWaId } from '../../lib/server/users';

const IST = 'Asia/Kolkata';
const ms = (iso: string) => new Date(iso).getTime();

// --- timezone helpers ---
// 23:30 IST on 2026-03-10 is 18:00 UTC the same day; 00:30 IST on the 11th is 19:00 UTC on the 10th.
assert.equal(localDate(IST, ms('2026-03-10T18:00:00Z')), '2026-03-10');
assert.equal(localDate(IST, ms('2026-03-10T19:00:00Z')), '2026-03-11');
assert.equal(localDate('UTC', ms('2026-03-10T19:00:00Z')), '2026-03-10');
assert.equal(localTime(IST, ms('2026-03-10T18:00:00Z')), '23:30');
assert.equal(localTime('UTC', ms('2026-03-10T00:05:00Z')), '00:05');
assert.equal(localDate('Not/AZone', ms('2026-03-10T19:00:00Z')), '2026-03-11', 'bad zone falls back to IST');
assert.equal(addDays('2026-02-28', 1), '2026-03-01');
assert.equal(addDays('2026-01-01', -1), '2025-12-31');
const shifted = new Date(shiftToServerWallClock(IST, ms('2026-03-10T19:00:00Z')));
assert.equal(`${shifted.getFullYear()}-${shifted.getMonth() + 1}-${shifted.getDate()}`, '2026-3-11');

assert.equal(timezoneForWaId('916238952660'), 'Asia/Kolkata');
assert.equal(timezoneForWaId('96560091617'), 'Asia/Kuwait');
assert.equal(timezoneForWaId('971501234567'), 'Asia/Dubai');
assert.equal(timezoneForWaId('966500000000'), 'Asia/Riyadh');
assert.equal(timezoneForWaId('447700900000'), 'Europe/London');
assert.equal(timezoneForWaId('15551234567'), 'America/New_York');
assert.equal(timezoneForWaId('999'), 'Asia/Kolkata');

// --- streaks ---
const done = (id: string, doneIso: string, createdIso = doneIso): StreakTask => ({
  id, createdAt: ms(createdIso), completed: true, completedAt: ms(doneIso),
});
const base = { sessions: [], workoutDates: [], timezone: IST };

// 3 days in a row, today empty: streak 3, today allowed to be empty.
{
  const r = computeStreak({ ...base, tasks: [
    done('a', '2026-03-07T10:00:00Z'), done('b', '2026-03-08T10:00:00Z'), done('c', '2026-03-09T10:00:00Z'),
  ] }, '2026-03-10');
  assert.equal(r.currentStreak, 3);
  assert.equal(r.longestStreak, 3);
  assert.equal(r.lastCompletionDate, '2026-03-07');
}
// Gap yesterday: streak is 0 if today empty, 1 if today done.
{
  const tasks = [done('a', '2026-03-07T10:00:00Z')];
  assert.equal(computeStreak({ ...base, tasks }, '2026-03-10').currentStreak, 0);
  tasks.push(done('b', '2026-03-10T10:00:00Z'));
  const r = computeStreak({ ...base, tasks }, '2026-03-10');
  assert.equal(r.currentStreak, 1);
  assert.equal(r.longestStreak, 1);
}
// Timezone boundary: completed 23:30 IST (18:00Z) and 00:30 IST (19:00Z) are TWO different local days in IST, one day in UTC.
{
  const tasks = [done('a', '2026-03-10T18:00:00Z'), done('b', '2026-03-10T19:00:00Z')];
  const ist = computeStreak({ ...base, tasks }, '2026-03-11');
  assert.deepEqual(Object.keys(ist.completionHistory).sort(), ['2026-03-10', '2026-03-11']);
  assert.equal(ist.currentStreak, 2);
  const utc = computeStreak({ ...base, timezone: 'UTC', tasks }, '2026-03-10');
  assert.deepEqual(Object.keys(utc.completionHistory), ['2026-03-10']);
  assert.equal(utc.currentStreak, 1);
}
// Recurring completedDates count, and the completed flag is ignored for them.
{
  const tasks: StreakTask[] = [{
    id: 'r', createdAt: ms('2026-03-01T00:00:00Z'), completed: false,
    recurrence: { completedDates: ['2026-03-08', '2026-03-09', '2026-03-10'] },
  }];
  assert.equal(computeStreak({ ...base, tasks }, '2026-03-10').currentStreak, 3);
}
// Deleted tasks do not count.
{
  const t = done('a', '2026-03-10T10:00:00Z');
  t.deleted = true;
  assert.equal(computeStreak({ ...base, tasks: [t] }, '2026-03-10').currentStreak, 0);
}
// longestStreak is never lowered; an empty history keeps the old value.
{
  const r = computeStreak({ ...base, tasks: [done('a', '2026-03-10T10:00:00Z')], existing: { longestStreak: 12, focusLongestStreak: 4 } }, '2026-03-10');
  assert.equal(r.longestStreak, 12);
  assert.equal(r.focusLongestStreak, 4);
  assert.equal(r.currentStreak, 1);
}
// Longest run in the past is found even when current is 0.
{
  const tasks = [done('a', '2026-02-01T10:00:00Z'), done('b', '2026-02-02T10:00:00Z'), done('c', '2026-02-03T10:00:00Z'), done('d', '2026-02-10T10:00:00Z')];
  const r = computeStreak({ ...base, tasks }, '2026-03-10');
  assert.equal(r.currentStreak, 0);
  assert.equal(r.longestStreak, 3);
}
// Missed commitments: committed, open, created before today, not deferred to today/future.
{
  const t: StreakTask = { id: 'm', createdAt: ms('2026-03-08T10:00:00Z'), completed: false, committed: true };
  const t2: StreakTask = { id: 'm2', createdAt: ms('2026-03-08T10:00:00Z'), completed: false, committed: true, deferredTo: '2026-03-10' };
  assert.deepEqual(computeStreak({ ...base, tasks: [t, t2] }, '2026-03-10').missedCommitments, { '2026-03-08': 1 });
}
// Focus streak: full / partial count, none breaks, skipped ignored, today may be empty.
{
  const tasks = [done('f1', '2026-03-08T10:00:00Z'), done('f2', '2026-03-09T10:00:00Z'), { id: 'f3', createdAt: ms('2026-03-07T10:00:00Z'), completed: false }];
  const sessions = [
    { date: '2026-03-07', taskIds: ['f3'] },                 // none -> breaks
    { date: '2026-03-08', taskIds: ['f1', 'x'] },            // partial
    { date: '2026-03-09', taskIds: ['f2'] },                 // full
    { date: '2026-03-10', taskIds: [], skipped: true },      // ignored
  ];
  const r = computeStreak({ ...base, tasks, sessions }, '2026-03-10');
  assert.equal(r.focusCurrentStreak, 2);
  assert.equal(r.focusLongestStreak, 2);
  assert.equal(r.focusCompletionHistory?.['2026-03-07'], 'none');
}
// Fitness streak: consecutive local days with a workout, today may be empty.
{
  const f = (workoutDates: string[], today = '2026-03-10') => computeStreak({ ...base, tasks: [], workoutDates }, today).fitnessStreak;
  assert.equal(f(['2026-03-08', '2026-03-09']), 2);
  assert.equal(f(['2026-03-08', '2026-03-09', '2026-03-10']), 3);
  assert.equal(f(['2026-03-07', '2026-03-09']), 1);
  assert.equal(f(['2026-03-07']), 0);
  assert.equal(f([]), 0);
}

console.log('DOMAIN PURE OK');
