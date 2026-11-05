// Emulator tests for the GTD-style server pieces: stale-task picking, the weekly review data, renameTask, the
// scheduler's daily "this has been sitting" nudge and Sunday review, and a friend's top-3 progress.
//   FIRESTORE_PORT=8485 bash scripts/test-emulator.sh scripts/tests/test_gtd_server.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import * as tasks from '../../lib/server/tasks';
import * as social from '../../lib/server/social';
import * as sched from '../../lib/server/scheduler';
import type { Task } from '../../lib/types';
import type { WaLink } from '../../lib/wa/types';

const db = adminDb();
const DAY = 86_400_000;
const TUE = Date.parse('2026-11-03T07:30:00Z'); // Tuesday 13:00 Asia/Kolkata = the stale slot
const SUN = Date.parse('2026-11-08T11:30:00Z'); // Sunday 17:00 Asia/Kolkata = the review slot

const lDate = (tz: string, at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
const lTime = (tz: string, at: number) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));

type Sent = { kind: string; to: string; a?: string; b?: unknown; c?: unknown };
let sent: Sent[] = [];
Object.assign(sched.deps, {
  localDate: lDate,
  localTime: lTime,
  windowOpen: (last: number, now: number) => now - last < 24 * 3600_000 - 5 * 60_000,
  sendText: async (to: string, a: string) => { sent.push({ kind: 'text', to, a }); return 'x'; },
  sendButtons: async (to: string, a: string, b: unknown) => { sent.push({ kind: 'buttons', to, a, b }); return 'x'; },
  sendList: async (to: string, a: string, c: string, b: unknown) => { sent.push({ kind: 'list', to, a, b, c }); return 'x'; },
  sendTemplate: async (to: string, a: string) => { sent.push({ kind: 'template', to, a }); return 'x'; },
  friendsActivity: async () => [],
});

async function wipe() {
  for (const c of ['users', 'tasks', 'waSchedule', 'waCounters']) {
    const s = await db.collection(c).get();
    await Promise.all(s.docs.map((d) => db.recursiveDelete(d.ref)));
  }
  sent = [];
}

function task(id: string, text: string, over: Partial<Task> = {}): Promise<unknown> {
  return db.doc(`tasks/${id}`).set({ userId: 'u1', text, isPrivate: false, visibility: 'everyone', completed: false, completedAt: null, deleted: false, createdAt: TUE - 1 * DAY, ...over });
}
const link = (over: Partial<WaLink> = {}): WaLink => ({
  waId: 'w1', uid: 'u1', linkedAt: 0, lastInboundAt: TUE - 3600_000, timezone: 'Asia/Kolkata', checkinTime: null, recapTime: null,
  friendAlerts: true, muted: false, ...over,
});

// ---------- staleTasks (pure) ----------
{
  const mk = (id: string, over: Partial<Task>): Task => ({ id, userId: 'u', text: id, isPrivate: false, completed: false, createdAt: TUE - 9 * DAY, completedAt: null, ...over } as Task);
  const today = '2026-11-03';
  const all = [
    mk('old', {}),
    mk('older', { createdAt: TUE - 20 * DAY }),
    mk('fresh', { createdAt: TUE - 2 * DAY }),
    mk('done', { completed: true }),
    mk('deleted', { deleted: true }),
    mk('recurring', { recurrence: { frequency: 'daily', startDate: '2026-10-01' } as Task['recurrence'] }),
    mk('later', { deferredTo: '2026-11-05' }),
    mk('due-today', { deferredTo: '2026-11-03' }),
    mk('focus', { focusDate: today }),
    mk('secret', { text: 'e1:abcdef' }),
    mk('asked', { staleNudgedAt: TUE - 2 * DAY }),
    mk('asked-long-ago', { staleNudgedAt: TUE - 9 * DAY }),
  ];
  assert.deepEqual(tasks.staleTasks(all, today, TUE, 5, 7).map((t) => t.id), ['older', 'old', 'due-today', 'asked-long-ago']);
  assert.deepEqual(tasks.staleTasks(all, today, TUE, 5).map((t) => t.id), ['older', 'old', 'due-today', 'asked', 'asked-long-ago'], 'no re-nudge window: everything stale');
  assert.deepEqual(tasks.staleTasks(all, today, TUE, 15, 7).map((t) => t.id), ['older']);
  console.log('staleTasks ok');
}

// ---------- listStale / markStaleNudged / weekReview / renameTask ----------
{
  await wipe();
  await db.doc('users/u1').set({ displayName: 'Ind', friends: [], timezone: 'Asia/Kolkata' });
  await task('a', 'taxes', { createdAt: TUE - 12 * DAY });
  await task('b', 'call dentist', { createdAt: TUE - 6 * DAY });
  await task('c', 'fresh one', { createdAt: TUE - 1 * DAY });
  await task('d', 'finished', { completed: true, completedAt: TUE - 2 * DAY, createdAt: TUE - 10 * DAY });
  await task('e', 'finished long ago', { completed: true, completedAt: TUE - 12 * DAY, createdAt: TUE - 14 * DAY });
  await task('h', 'daily habit', { createdAt: TUE - 30 * DAY, recurrence: { frequency: 'daily', startDate: '2026-10-01', completedDates: ['2026-11-02', '2026-11-03', '2026-10-01'] } as Task['recurrence'] });
  await task('x', 'someone else', { userId: 'u2', createdAt: TUE - 30 * DAY });

  assert.deepEqual((await tasks.listStale('u1', TUE)).map((t) => t.id), ['a', 'b']);
  await tasks.markStaleNudged('u1', ['a', 'x'], TUE); // 'x' is not theirs: ignored
  assert.equal((await db.doc('tasks/a').get()).data()!.staleNudgedAt, TUE);
  assert.equal((await db.doc('tasks/x').get()).data()!.staleNudgedAt, undefined);
  assert.deepEqual((await tasks.listStale('u1', TUE)).map((t) => t.id), ['b'], 'asked about: not again for a week');
  assert.deepEqual((await tasks.listStale('u1', TUE + 8 * DAY)).map((t) => t.id), ['a', 'b', 'c'], 'a week later they are back (c has aged too)');

  const r = await tasks.weekReview('u1', TUE);
  assert.equal(r.done, 1 + 2, 'one finished task + two recurring completions inside the 7 days');
  assert.equal(r.open, 3);
  assert.deepEqual(r.stale.map((t) => t.id), ['a', 'b'].filter((id) => id === 'a'), 'review only lists tasks open 7+ days (b is 6)');
  assert.equal(r.staleTotal, 1);

  const ren = await tasks.renameTask('u1', 'a', '  Email the accountant  ');
  assert.equal(ren.old, 'taxes');
  assert.equal((await db.doc('tasks/a').get()).data()!.text, 'Email the accountant');
  await assert.rejects(tasks.renameTask('u1', 'a', '   '), /empty/);
  await assert.rejects(tasks.renameTask('u1', 'a', 'x'.repeat(2001)), /too long/);
  await assert.rejects(tasks.renameTask('u1', 'x', 'hijack'), /not found/);
  console.log('listStale / weekReview / renameTask ok');
}

// ---------- scheduler: the daily stale nudge ----------
{
  await wipe();
  await db.doc('users/u1').set({ displayName: 'Ind', friends: [], timezone: 'Asia/Kolkata' });
  await task('a', 'taxes', { createdAt: TUE - 12 * DAY });
  await task('b', 'call dentist', { createdAt: TUE - 6 * DAY });
  await task('c', 'fresh one', { createdAt: TUE - 1 * DAY });
  const L = [link()];
  sched.deps.listLinks = async () => L;

  let c = await sched.runSchedule(TUE - 30 * 60_000); // 12:30 local: not the slot yet
  assert.equal(c.stale, 0);
  assert.equal(sent.length, 0);

  c = await sched.runSchedule(TUE);
  assert.equal(c.stale, 1);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.kind, 'buttons');
  assert.match(m.a!, /taxes[\s\S]*12 days/);
  assert.deepEqual((m.b as { id: string; title: string }[]).map((x) => x.id), ['step:a', 'tmrw:a', 'del:a']);
  assert.ok((m.b as { title: string }[]).every((x) => x.title.length <= 20));
  assert.equal((await db.doc('tasks/a').get()).data()!.staleNudgedAt, TUE);
  assert.equal((await db.doc('waSchedule/w1_2026-11-03_stale').get()).data()!.status, 'sent');

  await sched.runSchedule(TUE + 5 * 60_000); // same slot again: nothing new
  assert.equal(sent.length, 1);

  sent = [];
  L[0] = link({ lastInboundAt: TUE + DAY - 3600_000 });
  c = await sched.runSchedule(TUE + DAY); // next day: taxes is resting for a week, so the next oldest comes up
  assert.equal(c.stale, 1);
  assert.deepEqual((sent[0].b as { id: string }[]).map((x) => x.id), ['step:b', 'tmrw:b', 'del:b']);

  // opt-out, closed window, onboarding, muted: nothing is sent
  sent = [];
  const open2 = TUE + 2 * DAY - 3600_000;
  await task('g', 'old extra', { createdAt: TUE - 8 * DAY });
  L[0] = link({ lastInboundAt: open2 });
  assert.equal((await sched.runSchedule(TUE + 2 * DAY)).stale, 1, 'control: the same setup does send');
  sent = [];
  await db.doc('waSchedule/w1_2026-11-05_stale').delete();
  await db.doc('tasks/g').update({ staleNudgedAt: null });
  L[0] = link({ lastInboundAt: open2, reviews: false });
  assert.equal((await sched.runSchedule(TUE + 2 * DAY)).stale, 0);
  L[0] = link({ lastInboundAt: open2, onboarding: { step: 'welcome' } });
  assert.equal((await sched.runSchedule(TUE + 2 * DAY)).stale, 0);
  L[0] = link({ lastInboundAt: open2, muted: true });
  assert.equal((await sched.runSchedule(TUE + 2 * DAY)).stale, 0);
  assert.equal(sent.length, 0);
  L[0] = link({ lastInboundAt: TUE - 3 * DAY });
  const closed = await sched.runSchedule(TUE + 9 * DAY);
  assert.equal(closed.stale, 0);
  assert.equal(sent.length, 0, 'window closed: no template, nothing paid');
  assert.equal((await db.doc('waSchedule/w1_2026-11-12_stale').get()).data()!.status, 'skipped_window_closed');
  console.log('scheduler stale ok');
}

// ---------- scheduler: the Sunday review ----------
{
  await wipe();
  await db.doc('users/u1').set({ displayName: 'Ind', friends: [], timezone: 'Asia/Kolkata' });
  for (let i = 0; i < 12; i++) await task('s' + i, 'old task ' + i, { createdAt: SUN - (8 + i) * DAY });
  await task('d1', 'done one', { completed: true, completedAt: SUN - 1 * DAY, createdAt: SUN - 3 * DAY });
  await task('d2', 'done two', { completed: true, completedAt: SUN - 3 * DAY, createdAt: SUN - 4 * DAY });
  const L = [link({ lastInboundAt: SUN - 3600_000 })];
  sched.deps.listLinks = async () => L;

  // Sunday 13:00 local is NOT a stale-nudge day: the review covers it
  let c = await sched.runSchedule(SUN - 4 * 3600_000 - 30 * 60_000);
  assert.equal(c.stale, 0);
  assert.equal(sent.length, 0);

  c = await sched.runSchedule(SUN);
  assert.equal(c.reviews, 1);
  assert.equal(sent.length, 1);
  const r = sent[0];
  assert.equal(r.kind, 'list');
  assert.match(r.a!, /2 done · 📋 12 open · 🕸 12 untouched/);
  const rows = r.b as { id: string; title: string; description: string }[];
  assert.equal(rows.length, 10);
  assert.equal(rows[0].id, 'task:s11', 'oldest first');
  assert.match(rows[0].description, /19 days old/);
  assert.ok(rows.every((x) => x.title.length <= 24));
  assert.equal((await db.doc('tasks/s11').get()).data()!.staleNudgedAt, SUN);
  assert.equal((await db.doc('tasks/s0').get()).data()!.staleNudgedAt, undefined, 'only the 10 shown are marked');
  await sched.runSchedule(SUN + 5 * 60_000);
  assert.equal(sent.length, 1, 'once a day');

  // nothing stale: a short congratulation, no list
  await wipe();
  await db.doc('users/u1').set({ displayName: 'Ind', friends: [], timezone: 'Asia/Kolkata' });
  await task('f1', 'fresh', { createdAt: SUN - 1 * DAY });
  await task('d1', 'done one', { completed: true, completedAt: SUN - 1 * DAY, createdAt: SUN - 3 * DAY });
  c = await sched.runSchedule(SUN);
  assert.equal(c.reviews, 1);
  assert.equal(sent[0].kind, 'text');
  assert.match(sent[0].a!, /1 done · 📋 1 open\n\nNothing is going stale/);

  // an empty week sends nothing
  await wipe();
  await db.doc('users/u1').set({ displayName: 'Ind', friends: [], timezone: 'Asia/Kolkata' });
  c = await sched.runSchedule(SUN);
  assert.equal(c.reviews, 0);
  assert.equal(sent.length, 0);
  assert.equal((await db.doc('waSchedule/w1_2026-11-08_review').get()).data()!.status, 'skipped_empty');
  console.log('scheduler review ok');
}

// ---------- friends: a friend's top 3 ----------
{
  await wipe();
  Object.assign(social.deps, { now: () => TUE, localDate: lDate });
  await db.doc('users/alice').set({ displayName: 'Alice', friends: ['bob'], timezone: 'Asia/Kolkata' });
  await db.doc('users/bob').set({ displayName: 'Bob', friends: ['alice'], timezone: 'Asia/Kolkata' });
  const base = { userId: 'bob', isPrivate: false, visibility: 'everyone', deleted: false, createdAt: TUE - 1000, focusDate: '2026-11-03' };
  await db.doc('tasks/f1').set({ ...base, text: 'one', completed: true, completedAt: TUE - 60_000 });
  await db.doc('tasks/f2').set({ ...base, text: 'two', completed: false, completedAt: null });
  await db.doc('tasks/f3').set({ ...base, text: 'secret', visibility: 'private', isPrivate: true, completed: false, completedAt: null });
  await db.doc('tasks/f4').set({ ...base, text: 'yesterday focus', focusDate: '2026-11-02', completed: false, completedAt: null });
  const bob = (await social.friendsActivity('alice')).find((a) => a.uid === 'bob')!;
  assert.deepEqual(bob.focus, { done: 1, total: 2 }, 'only focus tasks Alice may see, only today');
  await db.doc('tasks/f1').delete();
  await db.doc('tasks/f2').delete();
  assert.equal((await social.friendsActivity('alice')).find((a) => a.uid === 'bob')!.focus, undefined);
  console.log('friend focus ok');
}

console.log('ALL GTD SERVER TESTS PASSED');
