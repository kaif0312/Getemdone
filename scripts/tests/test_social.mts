// Emulator tests for lib/server/social.ts + lib/server/scheduler.ts.
//   FIRESTORE_PORT=8385 bash scripts/test-emulator.sh scripts/tests/test_social.mts
// The sibling modules (users/tasks/links/send) are stubs in this worktree, so every collaborator is injected via `deps`.
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import * as social from '../../lib/server/social';
import * as sched from '../../lib/server/scheduler';
import type { WaLink } from '../../lib/wa/types';

const db = adminDb();
const NOW = Date.parse('2026-11-03T02:30:00Z'); // 08:00 Asia/Kolkata, 05:30 Asia/Kuwait

function localDate(tz: string, at = NOW): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}
function localTime(tz: string, at = NOW): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
}
const windowOpen = (last: number, now = NOW) => now - last < 24 * 3600_000 - 5 * 60_000;

type Sent = { kind: string; to: string; a?: unknown; b?: unknown; c?: unknown };
let sent: Sent[] = [];
let clock = NOW;
const links = new Map<string, WaLink>(); // by uid
function mkLink(waId: string, uid: string, over: Partial<WaLink> = {}): WaLink {
  const l: WaLink = {
    waId, uid, linkedAt: 0, lastInboundAt: NOW - 3600_000, timezone: 'Asia/Kolkata', checkinTime: null, recapTime: null,
    friendAlerts: true, muted: false, ...over,
  };
  links.set(uid, l);
  return l;
}

Object.assign(social.deps, {
  now: () => clock,
  localDate,
  windowOpen,
  getLinkByUid: async (uid: string) => links.get(uid) ?? null,
  sendText: async (to: string, text: string) => { sent.push({ kind: 'text', to, a: text }); return 'w1'; },
  sendButtons: async (to: string, body: string, buttons: unknown) => { sent.push({ kind: 'buttons', to, a: body, b: buttons }); return 'w2'; },
  sendTemplate: async (to: string, name: string, vars: string[], opts: unknown) => { sent.push({ kind: 'template', to, a: name, b: vars, c: opts }); return 'w3'; },
});

async function wipe() {
  for (const c of ['users', 'tasks', 'notifications', 'nudgeLimits', 'friendInvites', 'waLinks', 'waSchedule', 'waCounters', 'fitnessGoals']) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  const f = await db.collection('fitness').get();
  await Promise.all(f.docs.map((d) => db.recursiveDelete(d.ref)));
  links.clear();
  sent = [];
  clock = NOW;
}
const notifsFor = async (uid: string) => (await db.collection('notifications').where('userId', '==', uid).get()).docs.map((d) => d.data());

// ---------- fixtures ----------
await wipe();
const notif = { enabled: true, friendComments: true, friendEncouragement: true };
await db.doc('users/alice').set({ displayName: 'Alice', friends: ['bob', 'erin'], friendCode: 'ALICE1', timezone: 'Asia/Kolkata', streakData: { currentStreak: 2 } });
await db.doc('users/bob').set({ displayName: 'Bob', friends: ['alice'], friendCode: 'BOB123', notificationSettings: notif, streakData: { currentStreak: 5 } });
await db.doc('users/erin').set({ displayName: 'Erin Lee', friends: ['alice'], friendCode: 'ERIN12', streakData: { currentStreak: 1 } });
await db.doc('users/carol').set({ displayName: 'Carol', friends: [], friendCode: 'CAROL1', notificationSettings: notif });
await db.doc('users/dave').set({ displayName: 'Dave', friends: [], friendCode: 'DAVE12' });
const base = { userId: 'bob', completed: false, completedAt: null, createdAt: NOW - 1000, deleted: false, isPrivate: false };
await db.doc('tasks/t1').set({ ...base, text: 'Write report', visibility: 'everyone' });
await db.doc('tasks/t2').set({ ...base, text: 'Secret', visibility: 'private', isPrivate: true });
await db.doc('tasks/t3').set({ ...base, text: 'Only carol', visibility: 'only', visibilityList: ['carol'] });

// ---------- friends ----------
{
  const fr = await social.listFriends('alice');
  assert.deepEqual(fr.map((f) => f.uid).sort(), ['bob', 'erin']);
  assert.equal((await social.findFriend('alice', 'bo'))?.uid, 'bob');
  assert.equal((await social.findFriend('alice', 'lee'))?.uid, 'erin');
  assert.equal(await social.findFriend('alice', 'zz'), null);
}

// ---------- reactions ----------
{
  await social.reactToTask('alice', 't1', '👏');
  let t = (await db.doc('tasks/t1').get()).data()!;
  assert.equal(t.reactions.length, 1);
  assert.deepEqual(Object.keys(t.reactions[0]).sort(), ['emoji', 'timestamp', 'userId', 'userName']);
  assert.equal(t.reactions[0].userName, 'Alice');
  const n = await notifsFor('bob');
  assert.equal(n.length, 1);
  assert.equal(n[0].type, 'comment');
  assert.equal(n[0].fromUserId, 'alice');
  assert.equal(n[0].reactionEmoji, '👏');
  assert.equal(n[0].read, false);
  assert.equal(typeof n[0].createdAt, 'number');
  await social.reactToTask('alice', 't1', '🔥'); // replaces previous (one per user)
  t = (await db.doc('tasks/t1').get()).data()!;
  assert.deepEqual(t.reactions.map((r: { emoji: string }) => r.emoji), ['🔥']);
  await social.reactToTask('alice', 't1', '🔥'); // same emoji toggles off, no new notification
  t = (await db.doc('tasks/t1').get()).data()!;
  assert.equal(t.reactions.length, 0);
  assert.equal((await notifsFor('bob')).length, 2);
  await assert.rejects(social.reactToTask('alice', 't2', '👏'), /not_visible/);
  await assert.rejects(social.reactToTask('alice', 't3', '👏'), /not_visible/);
  await assert.rejects(social.reactToTask('alice', 'nope', '👏'), /task_not_found/);
  console.log('reactions ok');
}

// ---------- comments ----------
{
  await social.commentOnTask('alice', 't1', 'nice one');
  const t = (await db.doc('tasks/t1').get()).data()!;
  assert.equal(t.comments.length, 1);
  assert.equal(t.comments[0].text, 'nice one');
  assert.equal(t.comments[0].userId, 'alice');
  assert.equal(typeof t.comments[0].timestamp, 'number');
  const n = (await notifsFor('bob')).filter((x) => x.message === 'Alice commented on your task');
  assert.equal(n.length, 1);
  assert.equal(n[0].commentText, 'nice one');
  assert.equal(n[0].taskText, 'Write report');
  await db.doc('users/bob').update({ 'notificationSettings.friendComments': false });
  await social.commentOnTask('alice', 't1', 'second');
  assert.equal((await db.doc('tasks/t1').get()).data()!.comments.length, 2);
  assert.equal((await notifsFor('bob')).filter((x) => x.message === 'Alice commented on your task').length, 1);
  await db.doc('users/bob').update({ 'notificationSettings.friendComments': true });
  await assert.rejects(social.commentOnTask('carol', 't1', 'hi'), /not_visible/);
  console.log('comments ok');
}

// ---------- nudge ----------
{
  mkLink('919000000002', 'bob', { lastInboundAt: NOW - 3600_000 });
  const before = (await notifsFor('bob')).length;
  assert.deepEqual(await social.nudgeFriend('alice', 'bob'), { ok: true });
  assert.equal((await notifsFor('bob')).length, before + 1);
  const nn = (await notifsFor('bob')).find((x) => x.type === 'encouragement')!;
  assert.equal(nn.message, 'Alice nudged you to get things done today!');
  assert.equal(nn.title, '💪 Alice nudged you to get things done today!');
  assert.ok((await db.doc(`nudgeLimits/alice_bob_2026-11-03`).get()).exists);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'buttons'); // window open -> free message
  assert.deepEqual(sent[0].b, [{ id: 'nudge:alice', title: 'Nudge back' }]);
  const again = await social.nudgeFriend('alice', 'bob', 'come on');
  assert.deepEqual(again, { ok: false, reason: 'already_nudged_today' });
  assert.equal(sent.length, 1);
  assert.equal((await social.nudgeFriend('alice', 'carol')).reason, 'not_friends');
  // next local day is allowed again; window closed -> template with vars + payload
  clock = NOW + 24 * 3600_000 + 60_000;
  mkLink('919000000002', 'bob', { lastInboundAt: NOW - 48 * 3600_000 });
  sent = [];
  assert.deepEqual(await social.nudgeFriend('alice', 'bob', 'ship it'), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'template');
  assert.equal(sent[0].a, 'nudge_friend');
  assert.deepEqual(sent[0].b, ['Alice', 'ship it']);
  assert.deepEqual((sent[0].c as { buttonPayloads: string[] }).buttonPayloads, ['nudge:alice']);
  assert.equal((await db.doc('waCounters/2026-11-04').get()).data()!.templates, 1);
  // friendAlerts off / muted -> no WhatsApp
  clock += 24 * 3600_000;
  mkLink('919000000002', 'bob', { lastInboundAt: NOW - 48 * 3600_000, friendAlerts: false });
  sent = [];
  assert.equal((await social.nudgeFriend('alice', 'bob')).ok, true);
  assert.equal(sent.length, 0);
  // recipient has notifications disabled -> no notification doc
  await db.doc('users/erin').update({ notificationSettings: { enabled: false } });
  const eBefore = (await notifsFor('erin')).length;
  assert.equal((await social.nudgeFriend('alice', 'erin')).ok, true);
  assert.equal((await notifsFor('erin')).length, eBefore);
  clock = NOW;
  console.log('nudge ok');
}

// ---------- invites ----------
{
  mkLink('919000000001', 'alice', { lastInboundAt: NOW - 1000 });
  await db.doc('waLinks/919000000001').set({ uid: 'alice' });
  assert.equal((await social.inviteFriend('carol', 'NOPE99')).reason, 'not_found');
  assert.equal((await social.inviteFriend('carol', 'carol1')).reason, 'self');
  assert.equal((await social.inviteFriend('alice', 'BOB123')).reason, 'already_friends');
  sent = [];
  const first = await social.inviteFriend('carol', 'alice1'); // by friendCode, case-insensitive
  assert.equal(first.ok, true);
  assert.equal(typeof first.inviteId, 'string');
  const note = (await db.collection('notifications').where('userId', '==', 'alice').where('type', '==', 'announcement').get()).docs.map((d) => d.data());
  assert.equal(note.length, 1);
  assert.equal(note[0].fromUserId, 'carol');
  assert.match(note[0].title as string, /wants to be your friend/);
  const inv = (await db.collection('friendInvites').where('fromUid', '==', 'carol').get()).docs;
  assert.equal(inv.length, 1);
  const d = inv[0].data();
  assert.equal(d.status, 'pending');
  assert.equal(d.toUid, 'alice');
  assert.equal(typeof d.createdAt, 'number');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].b, [
    { id: `invite:accept:${inv[0].id}`, title: 'Accept' },
    { id: `invite:decline:${inv[0].id}`, title: 'Decline' },
  ]);
  assert.equal((await social.inviteFriend('carol', 'ALICE1')).reason, 'already_invited');
  await assert.rejects(social.answerInvite('bob', inv[0].id, true), /not_your_invite/);
  mkLink('919000000003', 'carol'); // so the inviter gets told
  sent = [];
  await social.answerInvite('alice', inv[0].id, true);
  assert.ok(((await db.doc('users/alice').get()).data()!.friends as string[]).includes('carol'));
  assert.deepEqual((await db.doc('users/carol').get()).data()!.friends, ['alice']);
  assert.equal((await db.doc(`friendInvites/${inv[0].id}`).get()).data()!.status, 'accepted');
  assert.equal(sent.length, 1);
  await assert.rejects(social.answerInvite('alice', inv[0].id, true), /invite_already_answered/);
  // by phone, decline
  assert.equal((await social.inviteFriend('dave', '+91 90000 00001')).ok, true);
  const di = (await db.collection('friendInvites').where('fromUid', '==', 'dave').get()).docs[0];
  await social.answerInvite('alice', di.id, false);
  assert.equal((await db.doc(`friendInvites/${di.id}`).get()).data()!.status, 'declined');
  assert.deepEqual((await db.doc('users/dave').get()).data()!.friends, []);
  console.log('invites ok');
}

// ---------- friendsActivity ----------
{
  // bob: 4 completed today (everyone), 1 private, 1 completed yesterday, 1 recurring done today, 1 deleted
  const done = { ...base, completed: true, completedAt: NOW - 60_000 };
  await db.doc('tasks/a1').set({ ...done, text: 'Ran 5k', visibility: 'everyone', createdAt: NOW - 10 });
  await db.doc('tasks/a2').set({ ...done, text: 'Private done', visibility: 'private', isPrivate: true, createdAt: NOW - 20 });
  await db.doc('tasks/a3').set({ ...done, text: 'Old', visibility: 'everyone', completedAt: NOW - 2 * 24 * 3600_000, createdAt: NOW - 30 });
  await db.doc('tasks/a4').set({ ...done, text: 'Not for alice', visibility: 'except', visibilityList: ['alice'], createdAt: NOW - 40 });
  await db.doc('tasks/a5').set({ ...base, text: 'Daily habit', visibility: 'everyone', createdAt: NOW - 50, recurrence: { frequency: 'daily', startDate: '2026-10-01', completedDates: ['2026-11-03'] } });
  await db.doc('tasks/a6').set({ ...done, text: 'Deleted', deleted: true, visibility: 'everyone', createdAt: NOW - 60 });
  await db.doc('fitness/bob/days/2026-11-03').set({ date: '2026-11-03', workouts: [{ type: 'run', minutes: 28, distanceKm: 5 }], updatedAt: NOW });
  await db.doc('fitness/erin/days/2026-11-03').set({ date: '2026-11-03', workouts: [{ type: 'yoga', minutes: 30 }], updatedAt: NOW });
  await db.doc('fitnessGoals/erin').set({ visibility: 'private' });
  await db.doc('fitnessGoals/bob').set({ visibility: 'friends' });
  const act = await social.friendsActivity('alice');
  const bob = act.find((a) => a.uid === 'bob')!;
  assert.deepEqual(bob.doneToday.map((x) => x.text).sort(), ['Daily habit', 'Ran 5k']);
  assert.deepEqual(bob.workoutsToday, ['run 5 km 28 min']);
  assert.equal(bob.streak, 5);
  const erin = act.find((a) => a.uid === 'erin')!;
  assert.deepEqual(erin.workoutsToday, []); // fitness goals visibility private
  console.log('friendsActivity ok');
}

// ---------- scheduler ----------
{
  await wipe();
  await db.doc('users/u1').set({ displayName: 'Ind', friends: [] });
  await db.doc('users/u2').set({ displayName: 'Kuw', friends: [] });
  await db.doc('users/u3').set({ displayName: 'Closed', friends: [] });
  const L = [
    mkLink('w1', 'u1', { timezone: 'Asia/Kolkata', checkinTime: '08:05', recapTime: '21:00' }),
    mkLink('w2', 'u2', { timezone: 'Asia/Kuwait', checkinTime: '08:00', recapTime: '21:00' }),
    mkLink('w3', 'u3', { timezone: 'Asia/Kolkata', checkinTime: '08:00', lastInboundAt: NOW - 48 * 3600_000 }),
    mkLink('w4', 'u3', { timezone: 'Asia/Kolkata', checkinTime: '08:00', muted: true }),
  ];
  const open = [{ id: 'tk1', text: 'Gym', completed: false }, { id: 'tk2', text: 'A very long task name that exceeds twenty four chars', completed: false }];
  Object.assign(sched.deps, {
    listLinks: async () => L,
    localDate, localTime, windowOpen,
    listToday: async () => open,
    daySummary: async () => ({ done: [{ id: 'x', text: 'Done thing' }], open: [{ id: 'y', text: 'Left thing' }], streak: 3, fitnessStreak: 0 }),
    friendsActivity: async () => [{ uid: 'f', displayName: 'Bob', doneToday: [], workoutsToday: [], streak: 5 }],
    sendText: async (to: string, t: string) => { sent.push({ kind: 'text', to, a: t }); return 'x'; },
    sendList: async (to: string, body: string, label: string, rows: unknown) => { sent.push({ kind: 'list', to, a: body, b: rows, c: label }); return 'x'; },
    sendButtons: async (to: string, body: string, b: unknown) => { sent.push({ kind: 'buttons', to, a: body, b }); return 'x'; },
    sendTemplate: async (to: string, name: string, v: string[], o: unknown) => { sent.push({ kind: 'template', to, a: name, b: v, c: o }); return 'x'; },
  });

  assert.equal(sched.inSlot('08:05', '08:00'), true);
  assert.equal(sched.inSlot('08:05', '07:59'), false);
  assert.equal(sched.inSlot('08:05', '08:14'), true);
  assert.equal(sched.inSlot('08:05', '08:44'), false);
  assert.equal(sched.inSlot(null, '08:00'), false);

  // 02:30Z = 08:00 Kolkata, 05:30 Kuwait: u1 (slot 08:00-08:14) and u3 (window closed, template); u4 muted; Kuwait not yet
  let c = await sched.runSchedule(NOW);
  assert.equal(c.checkinFree, 1);
  assert.equal(c.checkinTemplate, 1);
  const free = sent.find((s) => s.to === 'w1')!;
  assert.equal(free.kind, 'list');
  assert.match(String(free.a), /Friends: Bob 5-day streak/);
  assert.deepEqual((free.b as { id: string; title: string }[]).map((r) => r.id), ['focus:tk1', 'focus:tk2']);
  assert.ok((free.b as { title: string }[])[1].title.length <= 24);
  const tpl = sent.find((s) => s.to === 'w3')!;
  assert.equal(tpl.kind, 'template');
  assert.equal(tpl.a, 'nudge_checkin');
  assert.deepEqual(tpl.b, ['Closed', '2']);
  assert.deepEqual((tpl.c as { buttonPayloads: string[] }).buttonPayloads, ['checkin:start', 'checkin:skip']);
  assert.equal(sent.some((s) => s.to === 'w2' || s.to === 'w4'), false);
  assert.equal((await db.doc('waCounters/2026-11-03').get()).data()!.templates, 1);
  assert.equal((await db.doc('waSchedule/w1_2026-11-03_checkin').get()).data()!.status, 'sent');

  // idempotent: a second tick (and one 10 min later, inside grace) sends nothing new
  const n0 = sent.length;
  await sched.runSchedule(NOW);
  await sched.runSchedule(NOW + 10 * 60_000);
  assert.equal(sent.length, n0);

  // 05:00Z = 08:00 Kuwait (10:30 Kolkata)
  sent = [];
  c = await sched.runSchedule(Date.parse('2026-11-03T05:00:00Z'));
  assert.equal(c.checkinFree, 1);
  assert.deepEqual(sent.map((s) => s.to), ['w2']);

  // recap 21:00 Kuwait = 18:00Z; window open (fake lastInboundAt is relative to NOW, so reopen it)
  const T2 = Date.parse('2026-11-03T18:00:00Z');
  L[1].lastInboundAt = T2 - 1000;
  L[0].lastInboundAt = NOW; // >12h old but < 24h => open at T2? NOW=02:30Z, T2=18:00Z -> 15.5h, open
  sent = [];
  c = await sched.runSchedule(T2); // 18:00Z = 23:30 Kolkata (u1 recap 21:00 missed), 21:00 Kuwait
  assert.equal(c.recaps, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'w2');
  assert.match(String(sent[0].a), /1 done, 1 still open/);
  assert.match(String(sent[0].a), /Streak: 3 days/);

  // recap with closed window: skipped, no template
  const T3 = Date.parse('2026-11-04T15:30:00Z'); // 21:00 Kolkata on the 4th
  L[0].lastInboundAt = NOW - 5 * 24 * 3600_000;
  L[0].checkinTime = null;
  L[2].checkinTime = null; L[1].checkinTime = null; L[1].recapTime = null;
  sent = [];
  c = await sched.runSchedule(T3);
  assert.equal(sent.length, 0);
  assert.equal(c.skipped, 1);
  assert.equal((await db.doc('waSchedule/w1_2026-11-04_recap').get()).data()!.status, 'skipped_window_closed');

  // daily template cap
  process.env.NUDGE_MAX_TEMPLATES_PER_DAY = '1';
  L[0].lastInboundAt = 0; L[0].checkinTime = '08:00'; L[0].recapTime = null;
  L[2].lastInboundAt = 0; L[2].checkinTime = '08:00';
  const T4 = Date.parse('2026-11-05T02:30:00Z');
  sent = [];
  c = await sched.runSchedule(T4);
  assert.equal(c.checkinTemplate, 1);
  assert.equal(c.capped, 1);
  assert.equal(sent.filter((s) => s.kind === 'template').length, 1);
  assert.equal((await db.doc('waCounters/2026-11-05').get()).data()!.templates, 1);
  delete process.env.NUDGE_MAX_TEMPLATES_PER_DAY;

  // failed send is retried on the next tick (claim released)
  const T5 = Date.parse('2026-11-06T02:30:00Z');
  L[0].lastInboundAt = T5 - 1000; L[2].checkinTime = null;
  let fail = true;
  const realList = sched.deps.sendList;
  sched.deps.sendList = async (...a: Parameters<typeof realList>) => { if (fail) throw new Error('boom'); return realList(...a); };
  sent = [];
  c = await sched.runSchedule(T5);
  assert.equal(c.errors, 1);
  fail = false;
  c = await sched.runSchedule(T5 + 5 * 60_000);
  assert.equal(c.checkinFree, 1);
  console.log('scheduler ok');
}

console.log('TEST_SOCIAL_PASSED');
