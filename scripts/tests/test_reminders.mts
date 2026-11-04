// Emulator tests: reminders (who gets what, where, and what it costs). Run via scripts/test-emulator.sh.
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { addTasks, deferTask, setReminder } from '../../lib/server/tasks';
import { deps, fireFor, runReminders, untilLabel } from '../../lib/server/reminders';
import { zonedToMs } from '../../lib/bot/format';
import type { Task } from '../../lib/types';

const db = adminDb();
const TZ = 'Asia/Dubai';
const NOW = zonedToMs('2026-11-10T17:00', TZ)!;
const min = (n: number) => n * 60_000;

// ---- pure: fireFor
const base = { id: 't', userId: 'u', text: 'x', isPrivate: false, completed: false, createdAt: 1, completedAt: null } as Task;
assert.equal(fireFor({ ...base, remindAt: NOW + 1 }, NOW, 60, TZ), null, 'future remindAt waits');
assert.deepEqual(fireFor({ ...base, remindAt: NOW - min(2), remindFor: NOW + min(13) }, NOW, 60, TZ), { fireAt: NOW - min(2), eventAt: NOW + min(13) });
assert.equal(fireFor({ ...base, remindAt: NOW - min(120), remindFor: NOW - min(100) }, NOW, 60, TZ), null, 'stale and event passed');
assert.ok(fireFor({ ...base, remindAt: NOW - min(120), remindFor: NOW + min(30) }, NOW, 60, TZ), 'stale fire time but event still ahead');
assert.equal(fireFor({ ...base, completed: true, remindAt: NOW - 1 }, NOW, 60, TZ), null);
assert.ok(fireFor({ ...base, dueDate: NOW + min(50) }, NOW, 60, TZ), 'deadline within the lead');
assert.equal(fireFor({ ...base, dueDate: NOW + min(90) }, NOW, 60, TZ), null, 'deadline outside the lead');
assert.equal(fireFor({ ...base, dueDate: zonedToMs('2026-11-10T23:59', TZ)! }, NOW, 600, TZ), null, 'date-only deadline (23:59) is skipped');
assert.equal(untilLabel(NOW + min(15), NOW), 'in 15 min');
assert.equal(untilLabel(NOW + min(180), NOW), 'in 3 h');

// ---- fakes
const pushes: { token: string; title: string; body: string }[] = [];
const waButtons: { to: string; body: string }[] = [];
const waTemplates: { to: string; name: string; vars: string[] }[] = [];
let pushResult: 'ok' | 'dead' | 'error' = 'ok';
let buttonsOk = true;
deps.sendPush = async (token, title, body) => { pushes.push({ token, title, body }); return pushResult; };
deps.sendButtons = async (to, body) => { waButtons.push({ to, body }); return buttonsOk ? 'wamid.X' : null; };
deps.sendTemplate = async (to, name, vars) => { waTemplates.push({ to, name, vars }); return 'wamid.T'; };
const reset = () => { pushes.length = 0; waButtons.length = 0; waTemplates.length = 0; pushResult = 'ok'; buttonsOk = true; };

const mkUser = async (uid: string, extra: Record<string, unknown>) =>
  db.doc(`users/${uid}`).set({ displayName: uid, friends: [], timezone: TZ, ...extra });
const mkLink = async (uid: string, waId: string, lastInboundAt: number, extra: Record<string, unknown> = {}) =>
  db.doc(`waLinks/${waId}`).set({ waId, uid, linkedAt: 1, lastInboundAt, timezone: TZ, checkinTime: null, recapTime: null, friendAlerts: true, muted: false, ...extra });
const remind = async (uid: string, text: string, eventIn = 15) => {
  const [t] = await addTasks(uid, [{ text, remindAt: NOW - min(1), remindFor: NOW + min(eventIn) }]);
  return t;
};
const sentFor = async (id: string) => (await db.doc(`tasks/${id}`).get()).data()?.remindSentFor;

// ---- 1. app user (auto) gets push, once; a second tick sends nothing
const sfx = String(Date.now());
const app = 'app_' + sfx;
await mkUser(app, { fcmToken: 'tok_app' });
const ta = await remind(app, 'Gym');
let c = await runReminders(NOW);
assert.equal(c.push, 1);
assert.equal(pushes.length, 1);
assert.equal(pushes[0].token, 'tok_app');
assert.match(pushes[0].title, /Gym/);
assert.match(pushes[0].body, /in 16 min|in 15 min/);
assert.equal(waButtons.length + waTemplates.length, 0, 'no WhatsApp for an app user');
assert.ok(await sentFor(ta.id));
reset();
c = await runReminders(NOW + min(1));
assert.equal(c.push + c.waFree + c.waTemplate, 0, 'no duplicate on the next tick');

// ---- 2. encrypted task text is never sent in the clear
reset();
const enc = await remind(app, 'e1:AAAA');
await runReminders(NOW);
assert.match(pushes[0].title, /a task/);
void enc;

// ---- 3. WhatsApp-only user, window open: free interactive message with Done / Tomorrow
reset();
const wa = 'wa_' + sfx;
await mkUser(wa, {});
await mkLink(wa, '9715000' + sfx.slice(-5), NOW - min(60));
await remind(wa, 'Call mom');
c = await runReminders(NOW);
assert.equal(c.waFree, 1);
assert.equal(waTemplates.length, 0, 'inside the window no template is used');
assert.match(waButtons[0].body, /Call mom/);

// ---- 4. WhatsApp-only user, window closed: one template, then the per-user daily cap stops more
reset();
process.env.NUDGE_MAX_REMINDER_TEMPLATES_PER_USER_DAY = '1';
const cl = 'cl_' + sfx;
const clWa = '9716000' + sfx.slice(-5);
await mkUser(cl, {});
await mkLink(cl, clWa, NOW - 30 * 3_600_000);
await remind(cl, 'Dentist');
c = await runReminders(NOW);
assert.equal(c.waTemplate, 1);
assert.equal(waTemplates[0].name, 'nudge_reminder');
assert.equal(waTemplates[0].vars[0], 'Dentist');
assert.match(waTemplates[0].vars[1], /^5:1\d pm$/);
assert.equal(waButtons.length, 0);
assert.deepEqual((await db.doc(`waSessions/${clWa}`).get()).data()?.lastList?.length, 1, 'reply "done" resolves to the task');
reset();
await remind(cl, 'Pay rent');
c = await runReminders(NOW);
assert.equal(c.waTemplate, 0, 'second paid template the same day is dropped');
assert.equal(waTemplates.length, 0);
assert.equal(c.skipped >= 1, true);

// ---- 5. push dead + linked -> falls back to WhatsApp (free when the window is open)
reset();
pushResult = 'dead';
const fb = 'fb_' + sfx;
await mkUser(fb, { fcmToken: 'tok_dead' });
await mkLink(fb, '9717000' + sfx.slice(-5), NOW - min(5));
await remind(fb, 'Meeting');
c = await runReminders(NOW);
assert.equal(c.waFree, 1);

// ---- 6. channel 'app' never uses WhatsApp; 'both' uses both; muted blocks WhatsApp
reset();
const only = 'only_' + sfx;
await mkUser(only, { fcmToken: 'tok_only', reminderChannel: 'app' });
await mkLink(only, '9718000' + sfx.slice(-5), NOW - min(5));
await remind(only, 'A');
await runReminders(NOW);
assert.equal(pushes.length, 1);
assert.equal(waButtons.length, 0);
reset();
const both = 'both_' + sfx;
await mkUser(both, { fcmToken: 'tok_both', reminderChannel: 'both' });
await mkLink(both, '9719000' + sfx.slice(-5), NOW - min(5));
await remind(both, 'B');
await runReminders(NOW);
assert.equal(pushes.length, 1);
assert.equal(waButtons.length, 1);
reset();
const mu = 'mu_' + sfx;
await mkUser(mu, {});
await mkLink(mu, '9710000' + sfx.slice(-5), NOW - min(5), { muted: true });
await remind(mu, 'M');
c = await runReminders(NOW);
assert.equal(waButtons.length + waTemplates.length, 0, 'STOP is respected');

// ---- 7. deadline path: dueDate with a real time reminds at the user's lead; focus mode suppresses push
reset();
const dl = 'dl_' + sfx;
await mkUser(dl, { fcmToken: 'tok_dl', notificationSettings: { deadlineMinutesBefore: 30 } });
await addTasks(dl, [{ text: 'Submit report', dueDate: NOW + min(25) }]);
await addTasks(dl, [{ text: 'Later report', dueDate: NOW + min(200) }]);
await runReminders(NOW);
assert.equal(pushes.length, 1);
assert.match(pushes[0].title, /Submit report/);
reset();
const fo = 'fo_' + sfx;
await mkUser(fo, { fcmToken: 'tok_fo', focusModeActive: true });
await remind(fo, 'Focus');
await runReminders(NOW);
assert.equal(pushes.length, 0);

// ---- 8. deferring clears the reminder; setReminder(null) clears it
const dd = 'dd_' + sfx;
await mkUser(dd, {});
const t = await remind(dd, 'Move me');
await deferTask(dd, t.id, '2026-11-11');
assert.equal((await db.doc(`tasks/${t.id}`).get()).data()?.remindAt, undefined);
await setReminder(dd, t.id, NOW + min(5), NOW + min(20));
assert.equal((await db.doc(`tasks/${t.id}`).get()).data()?.remindAt, NOW + min(5));
await setReminder(dd, t.id, null);
assert.equal((await db.doc(`tasks/${t.id}`).get()).data()?.remindAt, undefined);

console.log('reminders: ok');
