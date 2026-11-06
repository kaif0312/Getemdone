// Pure check of the widget snapshot (src/features/widgets). Run: npm run test:widgets
import assert from 'node:assert/strict';
import { buildSnapshot, markDone, pickPose, progressLine, isStale, MAX_ROWS } from '../src/features/widgets/snapshot';
import { iosTodayProps, iosStreakProps } from '../src/features/widgets/iosProps';

const today = '2026-11-07';
const now = new Date(2026, 10, 7, 12, 0).getTime();
const base = { userId: 'u', isPrivate: false, completed: false, createdAt: now - 1000, completedAt: null } as const;
const T = (id: string, extra: Record<string, unknown> = {}) => ({ ...base, id, text: `task ${id}`, ...extra }) as never;

const tasks = [
  T('a', { focusDate: today }),
  T('b', { committed: true }),
  T('c'),
  T('p', { visibility: 'private', text: 'secret surgery plan' }),
  T('later', { deferredTo: '2026-11-09' }), // scheduled for a later day: not counted
  T('timed', { deferredTo: `${today}T15:30` }),
  T('done1', { completed: true, completedAt: now - 500 }),
  T('gone', { deleted: true }),
  T('parked', { parkedAt: now - 5 }),
];
const s = buildSnapshot({ uid: 'u', tasks, today, zone: 'Asia/Dubai', streak: 4, atRisk: true, now });

assert.equal(s.openCount, 5, 'a b c p timed (not later/done/deleted/parked)');
assert.equal(s.doneCount, 1);
assert.deepEqual(s.open.slice(0, 2).map((t) => t.id), ['a', 'b'], 'focus then committed first');
assert.ok(!JSON.stringify(s).includes('secret'), 'private text never in the snapshot');
assert.equal(s.open.find((t) => t.id === 'p')?.text, 'Private task');
assert.equal(s.open.find((t) => t.id === 'timed')?.time, '15:30');
assert.equal(progressLine(s), '1 of 6 done');
assert.equal(s.pose, 'waiting', 'streak at risk');

const many = buildSnapshot({ uid: 'u', tasks: Array.from({ length: 20 }, (_, i) => T(`m${i}`)), today, zone: 'UTC', streak: 0, atRisk: false, now });
assert.equal(many.open.length, MAX_ROWS);
assert.equal(many.openCount, 20, 'count keeps the real total');
assert.equal(iosTodayProps(many, today).more, 12);

const long = buildSnapshot({ uid: 'u', tasks: [T('l', { text: 'x'.repeat(300) })], today, zone: 'UTC', streak: 0, atRisk: false, now });
assert.ok(long.open[0].text.length <= 80);

// tick on the widget
const t1 = markDone(s, 'a');
assert.equal(t1.openCount, 4);
assert.equal(t1.doneCount, 2);
assert.equal(t1.open.some((t) => t.id === 'a'), false);
assert.equal(t1.atRisk, false);
assert.equal(t1.streak, 4, 'not the first completion today: streak unchanged');
const first = markDone(buildSnapshot({ uid: 'u', tasks: [T('x')], today, zone: 'UTC', streak: 4, atRisk: true, now }), 'x');
assert.equal(first.streak, 5, 'first completion of the day extends the streak');
assert.equal(first.pose, 'cheer');
assert.equal(markDone(s, 'nope'), s, 'unknown id: same object');

assert.equal(pickPose(0, 0, 9, false), 'sleepy');
assert.equal(pickPose(2, 0, 9, false), 'flex');
assert.equal(isStale(s, '2026-11-08'), true);
assert.equal(isStale(s, today), false);

const out = buildSnapshot({ uid: null, tasks, today, zone: 'UTC', streak: 4, atRisk: true, now });
assert.equal(out.open.length, 0, 'signed out: nothing');
assert.equal(iosTodayProps(out, today).empty, 'Open Nudge');
assert.equal(iosStreakProps(out).streak, '-');
assert.equal(iosTodayProps(s, '2026-11-08').empty, 'New day. Open Nudge.', 'yesterday list is not shown today');

console.log('widget snapshot ok');
