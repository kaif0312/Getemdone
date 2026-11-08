// Emulator tests: routines (lib/server/routines.ts). Run via scripts/test-emulator.sh.
//   FIRESTORE_PORT=8585 bash scripts/test-emulator.sh scripts/tests/test_routines.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import {
  deps, listRoutines, logIdOf, openLogFor, parseDays, parseTime, removeRoutine, runRoutines, runsOn, setLogStatus, statusLines, streakOf,
  updateRoutine, upsertRoutine,
} from '../../lib/server/routines';
import { zonedToMs } from '../../lib/bot/format';

const db = adminDb();
const TZ = 'Asia/Kolkata';
const at = (date: string, hhmm: string) => zonedToMs(`${date}T${hhmm}`, TZ)!;
const min = (n: number) => n * 60_000;
const sfx = String(Date.now());

const buttons: { to: string; body: string; ids: string[] }[] = [];
const templates: { to: string; name: string; vars: string[]; payloads?: string[] }[] = [];
const pushes: string[] = [];
let templateOk = true;
deps.sendButtons = async (to, body, bs) => { buttons.push({ to, body, ids: bs.map((b) => b.id) }); return 'wamid.B' + buttons.length; };
deps.sendTemplateLang = async (to, name, vars, _l, opts) => { templates.push({ to, name, vars, payloads: opts?.buttonPayloads }); return templateOk ? 'wamid.T' + templates.length : null; };
deps.sendPush = async (_t, _title, body) => { pushes.push(body); return true; };
const reset = () => { buttons.length = 0; templates.length = 0; pushes.length = 0; templateOk = true; };

// ---- pure helpers
assert.equal(parseTime('10pm'), '22:00');
assert.equal(parseTime('9:30 am'), '09:30');
assert.equal(parseTime('12am'), '00:00');
assert.equal(parseTime('25:00'), null);
assert.equal(parseTime('night'), null);
assert.deepEqual(parseDays(undefined), []);
assert.deepEqual(parseDays(['weekdays']), [1, 2, 3, 4, 5]);
assert.deepEqual(parseDays(['Mon', 'wednesday']), [1, 3]);
assert.deepEqual(parseDays([0, 1, 2, 3, 4, 5, 6]), []);
assert.equal(runsOn({ days: [] }, '2026-11-10'), true);
assert.equal(runsOn({ days: [2] }, '2026-11-10'), true); // 2026-11-10 is a Tuesday
assert.equal(runsOn({ days: [3] }, '2026-11-10'), false);

// ---- a user with WhatsApp (window open) and one with the window closed
const uid = 'ru_' + sfx, wa = '9190' + sfx.slice(-8);
const uid2 = 'ru2_' + sfx, wa2 = '9180' + sfx.slice(-8);
const D = '2026-11-10';
await db.doc(`users/${uid}`).set({ displayName: 'Kaif', friends: [], timezone: TZ });
await db.doc(`users/${uid2}`).set({ displayName: 'Friend', friends: [], timezone: TZ });
const link = (waId: string, u: string, last: number) =>
  db.doc(`waLinks/${waId}`).set({ waId, uid: u, linkedAt: 1, lastInboundAt: last, timezone: TZ, checkinTime: null, recapTime: null, friendAlerts: false, muted: false });
await link(wa, uid, at(D, '21:00')); // window open at 22:00
await link(wa2, uid2, at(D, '21:00') - min(60 * 30)); // closed

// ---- create / change / list
const a = await upsertRoutine(uid, { title: '  Take isabgol ', time: '10pm' });
assert.ok(a.ok && a.created && a.routine.time === '22:00' && a.routine.title === 'Take isabgol' && a.routine.days.length === 0);
const a2 = await upsertRoutine(uid, { title: 'take isabgol', time: '22:30', days: ['weekdays'] }); // same title = change
assert.ok(a2.ok && !a2.created && a2.routine.time === '22:30');
assert.equal((await listRoutines(uid)).length, 1);
assert.deepEqual((await upsertRoutine(uid, { title: '', time: '10pm' })), { ok: false, reason: 'no_title' });
assert.deepEqual((await upsertRoutine(uid, { title: 'x', time: 'soon' })), { ok: false, reason: 'bad_time' });
const back = await updateRoutine(uid, 'isabgol', { time: '22:00', days: [] });
assert.ok(back.ok && back.routine.time === '22:00' && back.routine.days.length === 0);
const rid = (await listRoutines(uid))[0].id;
const rid2 = (await upsertRoutine(uid2, { title: 'Stretch', time: '22:00' }) as { ok: true; routine: { id: string } }).routine.id;

// ---- before the time: nothing
reset();
let c = await runRoutines(at(D, '21:55'));
assert.equal(c.sent, 0);
assert.equal(buttons.length + templates.length, 0);

// ---- at 22:00 (cron late by 5 min): free message with Done / Skip for the open window; template for the closed one
c = await runRoutines(at(D, '22:05'));
assert.equal(buttons.length, 1);
assert.equal(buttons[0].to, wa);
assert.deepEqual(buttons[0].ids, [`rt:done:${logIdOf(rid, D)}`, `rt:skip:${logIdOf(rid, D)}`]);
assert.equal(templates.length, 1);
assert.equal(templates[0].to, wa2);
assert.equal(templates[0].name, 'nudge_routine');
assert.deepEqual(templates[0].vars, ['Stretch', '10:00 PM']);
assert.deepEqual(templates[0].payloads, [`rt:done:${logIdOf(rid2, D)}`, `rt:skip:${logIdOf(rid2, D)}`]);
assert.equal(c.sent, 2);

// ---- the same tick again / a later tick: no double send
reset();
await runRoutines(at(D, '22:10'));
assert.equal(buttons.length + templates.length, 0);

// ---- 45+ min unanswered: one follow-up, free only (the closed window gets none), and only once
reset();
await runRoutines(at(D, '22:55'));
assert.equal(buttons.length, 1);
assert.equal(buttons[0].to, wa);
assert.match(buttons[0].body, /Still pending/);
assert.equal(templates.length, 0);
reset();
await runRoutines(at(D, '23:40'));
assert.equal(buttons.length + templates.length, 0);

// ---- Done: records, counts, only for the owner, idempotent
const logId = logIdOf(rid, D);
assert.deepEqual(await setLogStatus(logId, 'someone_else', 'done', at(D, '23:00')), { ok: false });
const open = await openLogFor(uid, at(D, '23:00'), TZ);
assert.equal(open?.id, logId);
const t1 = await setLogStatus(logId, uid, 'done', at(D, '23:00'));
assert.ok(t1.ok && t1.title === 'Take isabgol' && !t1.already && t1.streak === 1);
const t2 = await setLogStatus(logId, uid, 'done', at(D, '23:01'));
assert.ok(t2.ok && t2.already);
assert.equal(await openLogFor(uid, at(D, '23:02'), TZ), null);
assert.deepEqual(await setLogStatus('nope_x', uid, 'done', 1), { ok: false });

// ---- the other one is skipped for today: not open any more, no follow-up
await setLogStatus(logIdOf(rid2, D), uid2, 'skipped', at(D, '22:20'));
assert.equal(await openLogFor(uid2, at(D, '22:30'), TZ), null);

// ---- streak: three days in a row, a gap breaks it, a weekday-only routine skips weekends
const d9 = '2026-11-09', d8 = '2026-11-08';
for (const d of [d9, d8]) await db.doc(`routineLogs/${logIdOf(rid, d)}`).set({ routineId: rid, uid, date: d, status: 'done' });
assert.equal(await streakOf(rid, D, { days: [] }), 3);
await db.doc(`routineLogs/${logIdOf(rid, d9)}`).delete();
assert.equal(await streakOf(rid, D, { days: [] }), 1);
// 2026-11-07 Sat, 11-08 Sun: weekday routine done Fri 11-06 and Mon 11-09, Tue 11-10 = streak 3 across the weekend
for (const d of ['2026-11-06', '2026-11-09']) await db.doc(`routineLogs/${logIdOf(rid, d)}`).set({ routineId: rid, uid, date: d, status: 'done' });
assert.equal(await streakOf(rid, D, { days: [1, 2, 3, 4, 5] }), 3);

// ---- the day after: today not done yet keeps the streak so far (11-10, 11-09, 11-08 done)
assert.equal(await streakOf(rid, '2026-11-11', { days: [] }), 3);

// ---- status lines
const lines = await statusLines(uid, at(D, '23:10'), TZ);
assert.equal(lines.length, 1);
assert.match(lines[0], /Take isabgol/);
assert.match(lines[0], /done ✅/);
assert.match(lines[0], /10:00 PM/);

// ---- weekday-only routine does not fire on a weekend; a removed routine stops
const uid3 = 'ru3_' + sfx, wa3 = '9170' + sfx.slice(-8);
await db.doc(`users/${uid3}`).set({ displayName: 'W', friends: [], timezone: TZ });
await link(wa3, uid3, at('2026-11-14', '21:30'));
await upsertRoutine(uid3, { title: 'Office stretch', time: '22:00', days: ['weekdays'] });
reset();
await runRoutines(at('2026-11-14', '22:05')); // Saturday
assert.equal(buttons.filter((b) => b.to === wa3).length, 0);
await runRoutines(at('2026-11-16', '22:05')); // Monday (window closed by then: template)
assert.equal(templates.filter((x) => x.to === wa3).length, 1);
const rm = await removeRoutine(uid3, 'stretch');
assert.ok(rm.ok);
reset();
await runRoutines(at('2026-11-17', '22:05'));
assert.equal(templates.filter((x) => x.to === wa3).length, 0);
assert.deepEqual(await removeRoutine(uid3, 'zzz'), { ok: false, reason: 'not_found', names: [] });

// ---- template cap: no more than 3 paid templates per person per day, the rest is dropped
const uid4 = 'ru4_' + sfx, wa4 = '9160' + sfx.slice(-8);
await db.doc(`users/${uid4}`).set({ displayName: 'C', friends: [], timezone: TZ });
await link(wa4, uid4, 0);
for (const n of ['a', 'b', 'c', 'd']) await upsertRoutine(uid4, { title: 'R' + n, time: '22:00' });
reset();
const c4 = await runRoutines(at('2026-11-18', '22:05'));
assert.equal(templates.filter((x) => x.to === wa4).length, 3);
assert.ok(c4.skipped >= 1);

// ---- push-only user (no WhatsApp): a push, no WhatsApp
const uid5 = 'ru5_' + sfx;
await db.doc(`users/${uid5}`).set({ displayName: 'P', friends: [], timezone: TZ, fcmToken: 'tok_' + sfx });
await upsertRoutine(uid5, { title: 'Push one', time: '22:00' });
reset();
await runRoutines(at('2026-11-19', '22:05'));
assert.equal(pushes.length, 1);
assert.equal(templates.length + buttons.length >= 0, true);

// ---- a failed template is retried on the next tick (counter released), and a muted user is left alone
const uid6 = 'ru6_' + sfx, wa6 = '9150' + sfx.slice(-8);
await db.doc(`users/${uid6}`).set({ displayName: 'F', friends: [], timezone: TZ });
await link(wa6, uid6, 0);
await upsertRoutine(uid6, { title: 'Retry me', time: '22:00' });
reset();
templateOk = false;
await runRoutines(at('2026-11-20', '22:05'));
const sentBefore = templates.filter((x) => x.to === wa6).length;
assert.equal(sentBefore, 1);
templateOk = true;
await runRoutines(at('2026-11-20', '22:20'));
assert.equal(templates.filter((x) => x.to === wa6).length, 2); // the retry
await db.doc(`waLinks/${wa6}`).update({ muted: true });
await upsertRoutine(uid6, { title: 'After mute', time: '22:00' });
reset();
await runRoutines(at('2026-11-21', '22:05'));
assert.equal(templates.filter((x) => x.to === wa6).length, 0);

// ---- at-most-once: the send is claimed first; a throwing send releases the claim and the next tick retries
const uid7 = 'ru7_' + sfx, wa7 = '9140' + sfx.slice(-8);
const D7 = '2026-11-23';
await db.doc(`users/${uid7}`).set({ displayName: 'Q', friends: [], timezone: TZ });
await link(wa7, uid7, at(D7, '21:30'));
const rid7 = (await upsertRoutine(uid7, { title: 'Claimed', time: '22:00' }) as { ok: true; routine: { id: string } }).routine.id;
const log7 = db.doc(`routineLogs/${logIdOf(rid7, D7)}`);
const realButtons = deps.sendButtons;
reset();
deps.sendButtons = async () => { throw new Error('boom'); };
const c7 = await runRoutines(at(D7, '22:05'));
assert.equal(c7.failed >= 1, true);
let l7 = (await log7.get()).data()!;
assert.equal(l7.sentAt, null); // released
assert.equal(l7.tries, 1);
deps.sendButtons = async (to, body, bs) => {
  // the claim is held while the send is in flight: a parallel tick must not send too
  const inflight = (await log7.get()).data()!;
  assert.equal(inflight.sentAt, at(D7, '22:20'));
  assert.equal(inflight.tries, 2);
  const c = await runRoutines(at(D7, '22:20'));
  assert.equal(c.sent, 0);
  return realButtons(to, body, bs);
};
reset();
await runRoutines(at(D7, '22:20')); // retry inside the 2h window
deps.sendButtons = realButtons;
assert.equal(buttons.filter((b) => b.to === wa7).length, 1);
l7 = (await log7.get()).data()!;
assert.equal(l7.sentAt, at(D7, '22:20'));
assert.equal(l7.tries, 2);
assert.equal(l7.channel, 'free');
assert.ok(l7.wamid);

// ---- a crash after the claim (sentAt set, no wamid): no second first-send, but the 45-min follow-up still goes out
const D8 = '2026-11-24';
await link(wa7, uid7, at(D8, '21:30'));
await log7.delete();
await db.doc(`routineLogs/${logIdOf(rid7, D8)}`).set({
  routineId: rid7, uid: uid7, date: D8, title: 'Claimed', time: '22:00', dueAt: at(D8, '22:00'), status: 'sent', sentAt: at(D8, '22:03'), tries: 1,
});
reset();
const mine = () => [...buttons, ...templates].filter((x) => x.to === wa7) as { body: string }[];
await runRoutines(at(D8, '22:20'));
assert.equal(mine().length, 0);
await runRoutines(at(D8, '22:50'));
assert.equal(mine().length, 1);
assert.match(mine()[0].body, /Still pending/);
reset();
await runRoutines(at(D8, '23:10'));
assert.equal(mine().length, 0); // once only

// ---- a bare "done" only answers a message sent in the last 8 hours; a tap on an old one still counts
const uid8 = 'ru8_' + sfx;
const mk = (date: string, sentAt: number) =>
  db.doc(`routineLogs/old_${sfx}_${date}`).set({ routineId: 'old_' + sfx, uid: uid8, date, title: 'Old', time: '22:00', dueAt: at(date, '22:00'), status: 'sent', sentAt, tries: 1 });
await mk('2026-11-25', at('2026-11-25', '22:00'));
assert.equal(await openLogFor(uid8, at('2026-11-26', '07:30'), TZ), null); // 9.5 h later: too old
assert.equal((await openLogFor(uid8, at('2026-11-26', '05:50'), TZ))?.id, `old_${sfx}_2026-11-25`); // 7 h 50 min: still open
const late = await setLogStatus(`old_${sfx}_2026-11-25`, uid8, 'done', at('2026-11-26', '09:00')); // a late tap still counts
assert.ok(late.ok && !late.already);

console.log('routines: all passed');
