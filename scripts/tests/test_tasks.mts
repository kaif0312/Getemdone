// Emulator tests: tasks, streak wrapper, focus, fitness. Run via scripts/test-emulator.sh.
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { addTasks, completeTask, daySummary, deferTask, deleteTask, findTask, listOpen, listToday, restoreTask, setFocus, uncompleteTask } from '../../lib/server/tasks';
import { getGoals, logMetric, logWorkout, setGoals, undoLastWorkout, weekSummary } from '../../lib/server/fitness';
import { recomputeStreak } from '../../lib/server/streaks';
import { addDays, dayOfWeek, getUserLite, localDate } from '../../lib/server/users';

const db = adminDb();
const TZ = 'Asia/Kolkata';
const uid = 'u_' + Date.now();
await db.doc(`users/${uid}`).set({ id: uid, displayName: 'Tester', email: 't@x.com', friendCode: 'ABC123', friends: [], createdAt: Date.now(), timezone: TZ });
const today = localDate(TZ);

// getUserLite
const lite = await getUserLite(uid);
assert.equal(lite?.displayName, 'Tester');
assert.equal(lite?.timezone, TZ);
assert.equal(await getUserLite('nobody'), null);
await db.doc('users/u_notz').set({ displayName: 'NoTz', friends: [] });
assert.equal((await getUserLite('u_notz'))?.timezone, 'Asia/Kolkata');

// addTasks: app write shape
const [t1, t2, t3] = await addTasks(uid, [
  { text: '  Buy milk  ' },
  { text: 'Call the gym about membership', tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
  { text: 'Water plants', recurrenceText: 'every day' },
]);
const raw = (await db.doc(`tasks/${t1.id}`).get()).data()!;
assert.equal(raw.text, 'Buy milk');
assert.equal(raw.userId, uid);
assert.equal(raw.isPrivate, false);
assert.equal(raw.visibility, 'everyone');
assert.deepEqual(raw.visibilityList, []);
assert.equal(raw.completed, false);
assert.equal(raw.completedAt, null);
assert.equal(raw.deleted, false);
assert.ok(Number.isInteger(raw.createdAt));
assert.ok(typeof raw.order === 'number');
assert.equal('deferredTo' in raw, false);
assert.equal((await db.doc(`tasks/${t2.id}`).get()).data()!.tags.length, 5);
assert.ok(t2.order! > t1.order!);
const rec = (await db.doc(`tasks/${t3.id}`).get()).data()!.recurrence;
assert.equal(rec.frequency, 'daily');
assert.equal(rec.startDate, today, 'recurrence starts on the user local today');
assert.deepEqual(rec.completedDates, []);
await assert.rejects(addTasks(uid, [{ text: '   ' }]));
await assert.rejects(addTasks(uid, [{ text: 'x'.repeat(2001) }]));

// default visibility
await db.doc(`users/${uid}`).update({ defaultVisibility: 'private' });
const [priv] = await addTasks(uid, [{ text: 'Secret plan' }]);
assert.equal(priv.visibility, 'private');
assert.equal(priv.isPrivate, true);
const [pub] = await addTasks(uid, [{ text: 'Public thing', visibility: 'everyone' }]);
assert.equal(pub.isPrivate, false);
await db.doc(`users/${uid}`).update({ defaultVisibility: 'everyone' });

// listToday / listOpen
const todayList = await listToday(uid);
assert.ok(todayList.some((t) => t.id === t1.id));
assert.ok(todayList.some((t) => t.id === t3.id), 'daily recurring shows today');
assert.equal((await listOpen(uid)).length, 5);
assert.equal((await listOpen(uid, 2)).length, 2);

// scheduled in future shows (like the app), past deferral hides
const [future] = await addTasks(uid, [{ text: 'Dentist', when: addDays(today, 3) }]);
assert.ok((await listToday(uid)).some((t) => t.id === future.id));
await db.doc(`tasks/${future.id}`).update({ deferredTo: addDays(today, -2) });
assert.ok(!(await listToday(uid)).some((t) => t.id === future.id));
await deleteTask(uid, future.id);

// findTask
assert.equal((await findTask(uid, 'the gym one'))?.id, t2.id);
assert.equal((await findTask(uid, 'milk'))?.id, t1.id);
assert.equal(await findTask(uid, 'zzzz unknown'), null);
await addTasks(uid, [{ text: 'Gym bag pack' }]);
assert.equal(await findTask(uid, 'gym'), null, 'ambiguous -> null');
assert.equal((await findTask(uid, 'gym membership'))?.id, t2.id);

// complete / uncomplete + streak
const c1 = await completeTask(uid, t1.id);
assert.equal(c1.completed, true);
assert.ok(Number.isInteger(c1.completedAt));
const u = (await db.doc(`users/${uid}`).get()).data()!;
assert.equal(u.streakData.currentStreak, 1);
assert.ok(todayList.length > 0);
assert.ok((await listToday(uid)).some((t) => t.id === t1.id && t.completed), 'completed today still listed');
await uncompleteTask(uid, t1.id);
assert.equal((await db.doc(`tasks/${t1.id}`).get()).data()!.completed, false);
assert.equal((await db.doc(`users/${uid}`).get()).data()!.streakData.currentStreak, 0);
await completeTask(uid, t1.id);

// recurring completion: completedDates, not completed
const r1 = await completeTask(uid, t3.id);
assert.deepEqual(r1.recurrence?.completedDates, [today]);
assert.equal(r1.completed, false);
await completeTask(uid, t3.id);
assert.deepEqual((await db.doc(`tasks/${t3.id}`).get()).data()!.recurrence.completedDates, [today], 'idempotent');
assert.ok(!(await listToday(uid)).some((t) => t.id === t3.id), 'recurring done today is hidden');
await uncompleteTask(uid, t3.id);
assert.deepEqual((await db.doc(`tasks/${t3.id}`).get()).data()!.recurrence.completedDates, []);
await completeTask(uid, t3.id);

// defer
const d1 = await deferTask(uid, t2.id);
assert.equal(d1.deferredTo, addDays(today, 1));
const d2 = await deferTask(uid, t2.id, addDays(today, 5));
assert.equal(d2.deferredTo, addDays(today, 5));
const [rec2] = await addTasks(uid, [{ text: 'Stretch', recurrenceText: 'daily' }]);
const d3 = await deferTask(uid, rec2.id);
assert.deepEqual(d3.recurrence?.skippedDates, [today]);
assert.ok(!(await listToday(uid)).some((t) => t.id === rec2.id));

// delete / restore, ownership
await deleteTask(uid, t1.id);
let after = (await db.doc(`tasks/${t1.id}`).get()).data()!;
assert.equal(after.deleted, true);
assert.ok(Number.isInteger(after.deletedAt));
assert.ok(!(await listToday(uid)).some((t) => t.id === t1.id));
assert.ok(!(await listOpen(uid)).some((t) => t.id === t1.id));
await restoreTask(uid, t1.id);
after = (await db.doc(`tasks/${t1.id}`).get()).data()!;
assert.equal(after.deleted, false);
assert.equal(after.deletedAt, null);
await assert.rejects(completeTask('someone_else', t1.id), /not found/);
await assert.rejects(deleteTask(uid, 'missing'), /not found/);

// focus
await setFocus(uid, [t1.id, t2.id]);
const sess = (await db.doc(`focusSessions/${uid}/sessions/${today}`).get()).data()!;
assert.deepEqual(sess.taskIds, [t1.id, t2.id]);
assert.equal(sess.skipped, false);
assert.equal(sess.date, today);
assert.equal((await db.doc(`tasks/${t2.id}`).get()).data()!.focusDate, today);
assert.equal((await db.doc(`users/${uid}`).get()).data()!.lastFocusSessionDate, today);
await assert.rejects(setFocus(uid, ['a', 'b', 'c', 'd', 'e', 'f']));
await assert.rejects(setFocus(uid, ['missing']));

// daySummary
const sum = await daySummary(uid);
assert.ok(sum.done.some((t) => t.id === t1.id));
assert.ok(sum.done.some((t) => t.id === t3.id), 'recurring done today counts as done');
assert.ok(sum.open.every((t) => !t.completed));
assert.equal(sum.streak, 1);
assert.equal(sum.fitnessStreak, 0);

// streak wrapper keeps longestStreak
await db.doc(`users/${uid}`).set({ streakData: { longestStreak: 9, currentStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} } }, { merge: true });
const st = await recomputeStreak(uid);
assert.equal(st.longestStreak, 9);
assert.equal(st.currentStreak, 1);

// fitness
const fuid = 'f_' + Date.now();
await db.doc(`users/${fuid}`).set({ displayName: 'Fit', friends: [], timezone: TZ });
const w1 = await logWorkout(fuid, { type: 'run', minutes: 30, distanceKm: 5 });
assert.equal(w1.date, today);
assert.equal(w1.workouts.length, 1);
assert.equal(w1.workouts[0].source, 'wa');
assert.equal('sets' in w1.workouts[0], false);
await logWorkout(fuid, { type: 'pushups', sets: 3, reps: 15 });
await logWorkout(fuid, { type: 'run', minutes: 20, date: addDays(today, -1) });
await assert.rejects(logWorkout(fuid, { type: '' }));
await assert.rejects(logWorkout(fuid, { type: 'run', minutes: -4 }));
const m = await logMetric(fuid, 'steps', 8000);
assert.equal(m.steps, 8000);
assert.equal(m.workouts.length, 2, 'metric keeps workouts');
await logMetric(fuid, 'weightKg', 71.5);
await assert.rejects(logMetric(fuid, 'weightKg', 0));
assert.equal(await getGoals(fuid), null);
const g = await setGoals(fuid, { workoutsPerWeek: 4 });
assert.deepEqual(g, { visibility: 'friends', workoutsPerWeek: 4 });
assert.equal((await setGoals(fuid, { stepsPerDay: 9000, visibility: 'private' })).workoutsPerWeek, 4);

// week = Mon-Sun of local today; entries outside it are ignored
const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
await db.doc(`fitness/${fuid}/days/${addDays(monday, -1)}`).set({ date: addDays(monday, -1), workouts: [{ type: 'old', minutes: 99, source: 'wa', at: 1 }], updatedAt: 1 });
await db.doc(`fitness/${fuid}/days/${addDays(monday, 7)}`).set({ date: addDays(monday, 7), workouts: [{ type: 'next', minutes: 99, source: 'wa', at: 1 }], updatedAt: 1 });
const wk = await weekSummary(fuid);
const yesterdayInWeek = addDays(today, -1) >= monday;
assert.equal(wk.workouts, yesterdayInWeek ? 3 : 2);
assert.equal(wk.minutes, yesterdayInWeek ? 50 : 30);
assert.equal(wk.distanceKm, 5);
assert.equal(wk.goal, 4);
assert.equal(wk.lastWeightKg, 71.5);
assert.ok(wk.days.every((d) => d.date >= monday && d.date <= addDays(monday, 6)));

// fitness streak + undo
let fu = (await db.doc(`users/${fuid}`).get()).data()!;
assert.equal(fu.streakData.fitnessStreak, 2, 'today + yesterday');
await undoLastWorkout(fuid);
assert.equal((await db.doc(`fitness/${fuid}/days/${today}`).get()).data()!.workouts.length, 1);
await undoLastWorkout(fuid);
fu = (await db.doc(`users/${fuid}`).get()).data()!;
assert.equal(fu.streakData.fitnessStreak, 1, 'only yesterday left (today may be empty)');
await undoLastWorkout(fuid); // nothing left today: no throw

console.log('TASKS OK');
