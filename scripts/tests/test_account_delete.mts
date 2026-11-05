// Emulator test for self-service account deletion (lib/server/accountDelete.ts + POST /api/app/account/delete).
//   FIRESTORE_PORT=8585 bash scripts/test-emulator.sh scripts/tests/test_account_delete.mts
// The worst outcome is deleting SOMEONE ELSE's data, so most asserts are about what must survive:
// friends' own docs, their comments, other people's WhatsApp numbers (including a number now linked to another account
// and a number that shares a prefix), and an e-mail whitelist entry another account still uses.
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import * as del from '../../lib/server/accountDelete';
import { authDeps } from '../../lib/server/appAuth';
import { POST } from '../../app/api/app/account/delete/route';

const db = adminDb();
const NOW = Date.parse('2026-11-06T10:00:00Z');

// ---------- fakes for Storage / Google / Auth ----------
let storage = new Set<string>();
let googleDisconnected: string[] = [];
let authUsers = new Set<string>();
let failStorageOnce = false;
Object.assign(del.deps, {
  now: () => NOW,
  deleteStorage: async (p: string) => {
    if (failStorageOnce) {
      failStorageOnce = false;
      throw new Error('storage down');
    }
    const hit = [...storage].filter((f) => (p.endsWith('/') ? f.startsWith(p) : f === p));
    hit.forEach((f) => storage.delete(f));
    return hit.length;
  },
  disconnectGoogle: async (uid: string) => {
    googleDisconnected.push(uid);
    await db.doc(`calendarLinks/${uid}`).update({ google: null }).catch(() => undefined);
  },
  deleteAuthUser: async (uid: string) => { authUsers.delete(uid); },
} satisfies Partial<del.DeleteDeps>);

async function wipe() {
  for (const c of await db.listCollections()) await db.recursiveDelete(c);
  storage = new Set();
  googleDisconnected = [];
  authUsers = new Set(['alice', 'bob', 'carol', 'alice2']);
}

// alice = the account being deleted. bob = her friend. carol = a stranger who now owns alice's OLD number 9111.
// alice2 = another account whose uid starts with "alice" (prefix safety for Storage).
async function seed() {
  const set = (p: string, d: Record<string, unknown>) => db.doc(p).set(d);
  await set('users/alice', { id: 'alice', displayName: 'Alice', email: 'Alice@x.com', friends: ['bob'], whatsapp: { waId: '9111' }, friendCode: 'AAAAAA', createdAt: 1 });
  await set('users/bob', { id: 'bob', displayName: 'Bob', email: 'bob@x.com', friends: ['alice', 'carol'], friendCode: 'BBBBBB', createdAt: 1 });
  await set('users/carol', { id: 'carol', displayName: 'Carol', email: 'carol@x.com', friends: ['bob'], whatsapp: { waId: '9111' }, friendCode: 'CCCCCC', createdAt: 1 });
  await set('users/alice2', { id: 'alice2', displayName: 'Alice Two', email: 'shared@x.com', friends: [], friendCode: 'DDDDDD', createdAt: 1 });

  // tasks: alice's own (with an attachment), bob's task carrying alice's + bob's comments/reactions, carol's task
  await set('tasks/ta1', { userId: 'alice', text: 'secret plan', completed: false, createdAt: 1 });
  await set('tasks/ta2', { userId: 'alice', text: 'other', completed: true, createdAt: 2 });
  await set('tasks/tb1', {
    userId: 'bob', text: 'bob task', completed: false, createdAt: 1,
    reactions: [{ userId: 'alice', emoji: '🔥' }, { userId: 'carol', emoji: '👍' }],
    comments: [
      { id: 'c1', userId: 'alice', text: 'go bob' },
      { id: 'c2', userId: 'bob', text: 'thanks', reactions: [{ userId: 'alice', emoji: '❤️' }, { userId: 'carol', emoji: '❤️' }] },
    ],
  });
  await set('tasks/tb2', { userId: 'bob', text: 'untouched', completed: false, createdAt: 1, comments: [{ id: 'c3', userId: 'carol', text: 'hi' }] });
  await set('tasks/tc1', { userId: 'carol', text: 'carol task', completed: false, createdAt: 1 });
  storage = new Set(['attachments/ta1/f1', 'attachments/ta1/f1_thumb', 'attachments/tb1/f9', 'profilePictures/alice', 'profilePictures/alice2', 'bugReports/alice/i1', 'bugReports/alice2/i2']);

  await set('notifications/n1', { userId: 'alice', fromUserId: 'bob', type: 'x', title: 't', message: 'm', createdAt: 1, read: false });
  await set('notifications/n2', { userId: 'bob', fromUserId: 'alice', type: 'x', title: 't', message: 'Alice nudged you', createdAt: 1, read: false });
  await set('notifications/n3', { userId: 'bob', fromUserId: 'carol', type: 'x', title: 't', message: 'Carol', createdAt: 1, read: false });
  await set('bugReports/b1', { userId: 'alice', description: 'bug' });
  await set('bugReports/b2', { userId: 'bob', description: 'bug' });
  await set('pendingSignups/p1', { userId: 'alice', email: 'alice@x.com' });
  await set('friendInvites/i1', { fromUid: 'alice', toUid: 'carol', status: 'pending' });
  await set('friendInvites/i2', { fromUid: 'carol', toUid: 'alice', status: 'pending' });
  await set('friendInvites/i3', { fromUid: 'carol', toUid: 'bob', status: 'pending' });
  await set('nudgeLimits/alice_bob_2026-11-06', { from: 'alice', to: 'bob', date: '2026-11-06' });
  await set('nudgeLimits/bob_alice_2026-11-06', { from: 'bob', to: 'alice', date: '2026-11-06' });
  await set('nudgeLimits/bob_carol_2026-11-06', { from: 'bob', to: 'carol', date: '2026-11-06' });

  await set('userKeys/alice', { masterKey: 'k', friendKeys: { bob: 'kb' } });
  await set('userKeys/bob', { masterKey: 'kb', friendKeys: { alice: 'ka', carol: 'kc' } });
  await set('fitnessGoals/alice', { visibility: 'friends' });
  await set('fitness/alice/days/2026-11-05', { workouts: [] });
  await set('fitness/bob/days/2026-11-05', { workouts: [] });
  await set('focusSessions/alice/sessions/2026-11-05', { tasks: [] });
  await set('calendarEvents/alice/months/2026-11', { events: [] });
  await set('calendarEventVisibility/alice', { x: 1 });
  await set('migrationStatus/alice', { done: true });
  await set('presence/alice', { focusing: true });
  await set('presence/bob', { focusing: true });
  await set('calendarLinks/alice', { feedToken: 'tokA', google: { refreshToken: 'r', calendarId: 'c' } });
  await set('calendarFeeds/tokA', { uid: 'alice' });
  await set('calendarFeeds/tokOld', { uid: 'alice' });
  await set('calendarFeeds/tokB', { uid: 'bob' });

  await set('medPlans/m1', { ownerUid: 'alice', patientWaId: '9333' });
  await set('medDoses/m1_2026-11-06_0800', { planId: 'm1', ownerUid: 'alice' });
  await set('medPlans/m2', { ownerUid: 'bob', patientWaId: '9222' }); // alice is bob's patient: bob's plan, stays
  await set('medDoses/m2_2026-11-06_0800', { planId: 'm2', ownerUid: 'bob' });

  // WhatsApp: alice's live number 9222. Her old number 9111 is now carol's (users/alice still points at it: stale).
  // 92220 is a different person whose ids share the prefix.
  await set('waLinks/9222', { waId: '9222', uid: 'alice', learnId: 'L-alice' });
  await set('waLinks/9111', { waId: '9111', uid: 'carol', learnId: 'L-carol' });
  await set('waLinks/92220', { waId: '92220', uid: 'bob', learnId: 'L-bob' });
  for (const w of ['9222', '9111', '92220']) {
    await set(`waSessions/${w}`, { turns: [] });
    await set(`waSchedule/${w}_2026-11-06_checkin`, { at: 1 });
    await set(`waReminderCaps/${w}_2026-11-06`, { templates: 1 });
    await set(`waReminderCaps/med_${w}_2026-11-06`, { templates: 1 });
    await set(`waSeen/fwdnote:${w}:2026-11-06`, { at: 1 });
    await set(`vaultUploads/wamid.${w}`, { from: w, name: 'scan.pdf' });
  }
  await set('waSeen/wamid.unrelated', { at: 1 });
  await set('learningLog/l1', { lid: 'L-alice', user: 'hi' });
  await set('learningLog/l2', { lid: 'L-carol', user: 'hi' });
  await set('waLinkCodes/ABC234', { uid: 'alice', expiresAt: 1 });
  await set('waLinkCodes/XYZ234', { uid: 'bob', expiresAt: 1 });
  await set('appLogins/pollA', { uid: 'alice', status: 'consumed' });
  await set('appLogins/pollB', { uid: 'bob', status: 'consumed' });
  await set('betaWhitelist/alice@x.com', { email: 'alice@x.com' });
  await set('betaWhitelist/bob@x.com', { email: 'bob@x.com' });
}

const exists = async (p: string) => (await db.doc(p).get()).exists;
const count = async (c: string, f: string, v: unknown) => (await db.collection(c).where(f, '==', v).get()).size;

async function assertAliceGone() {
  for (const p of [
    'users/alice', 'tasks/ta1', 'tasks/ta2', 'notifications/n1', 'notifications/n2', 'bugReports/b1', 'pendingSignups/p1',
    'friendInvites/i1', 'friendInvites/i2', 'nudgeLimits/alice_bob_2026-11-06', 'nudgeLimits/bob_alice_2026-11-06',
    'userKeys/alice', 'fitnessGoals/alice', 'fitness/alice/days/2026-11-05', 'focusSessions/alice/sessions/2026-11-05',
    'calendarEvents/alice/months/2026-11', 'calendarEventVisibility/alice', 'migrationStatus/alice', 'presence/alice',
    'calendarLinks/alice', 'calendarFeeds/tokA', 'calendarFeeds/tokOld', 'medPlans/m1', 'medDoses/m1_2026-11-06_0800',
    'waLinks/9222', 'waSessions/9222', 'waSchedule/9222_2026-11-06_checkin', 'waReminderCaps/9222_2026-11-06',
    'waReminderCaps/med_9222_2026-11-06', 'waSeen/fwdnote:9222:2026-11-06', 'vaultUploads/wamid.9222', 'learningLog/l1',
    'waLinkCodes/ABC234', 'appLogins/pollA', 'betaWhitelist/alice@x.com',
  ]) assert.equal(await exists(p), false, `${p} should be deleted`);
  for (const f of ['attachments/ta1/f1', 'attachments/ta1/f1_thumb', 'profilePictures/alice', 'bugReports/alice/i1']) {
    assert.equal(storage.has(f), false, `storage ${f} should be deleted`);
  }
  assert.equal(authUsers.has('alice'), false, 'auth user deleted');
  const tomb = (await db.doc('accountDeletions/alice').get()).data();
  assert.equal(tomb?.status, 'done');
  assert.deepEqual(Object.keys(tomb ?? {}).sort(), ['doneAt', 'status'], 'tombstone keeps no personal data');
}

async function assertOthersIntact() {
  // other people's docs survive
  for (const p of [
    'users/bob', 'users/carol', 'users/alice2', 'tasks/tb1', 'tasks/tb2', 'tasks/tc1', 'notifications/n3', 'bugReports/b2',
    'friendInvites/i3', 'nudgeLimits/bob_carol_2026-11-06', 'userKeys/bob', 'fitness/bob/days/2026-11-05', 'presence/bob',
    'calendarFeeds/tokB', 'medPlans/m2', 'medDoses/m2_2026-11-06_0800', 'waLinkCodes/XYZ234', 'appLogins/pollB',
    'betaWhitelist/bob@x.com', 'learningLog/l2', 'waSeen/wamid.unrelated',
  ]) assert.equal(await exists(p), true, `${p} must survive`);
  // carol's number 9111 (alice's stale pointer) and bob's 92220 (shared prefix) are untouched
  for (const w of ['9111', '92220']) {
    for (const p of [`waLinks/${w}`, `waSessions/${w}`, `waSchedule/${w}_2026-11-06_checkin`, `waReminderCaps/${w}_2026-11-06`,
      `waReminderCaps/med_${w}_2026-11-06`, `waSeen/fwdnote:${w}:2026-11-06`, `vaultUploads/wamid.${w}`]) {
      assert.equal(await exists(p), true, `${p} (not alice's number) must survive`);
    }
  }
  assert.equal((await db.doc('waLinks/9111').get()).data()?.uid, 'carol');
  for (const f of ['attachments/tb1/f9', 'profilePictures/alice2', 'bugReports/alice2/i2']) assert.equal(storage.has(f), true, `storage ${f} must survive`);
  assert.equal(authUsers.has('bob') && authUsers.has('carol') && authUsers.has('alice2'), true);

  // bob: alice removed from friends + keys, carol kept
  const bob = (await db.doc('users/bob').get()).data()!;
  assert.deepEqual(bob.friends, ['carol']);
  assert.deepEqual((await db.doc('userKeys/bob').get()).data()?.friendKeys, { carol: 'kc' });
  assert.equal((await db.doc('userKeys/bob').get()).data()?.masterKey, 'kb');
  // bob's task: alice's comment + reactions gone, bob's comment and carol's reactions kept
  const tb1 = (await db.doc('tasks/tb1').get()).data()!;
  assert.equal(tb1.text, 'bob task');
  assert.deepEqual(tb1.reactions, [{ userId: 'carol', emoji: '👍' }]);
  assert.deepEqual(tb1.comments, [{ id: 'c2', userId: 'bob', text: 'thanks', reactions: [{ userId: 'carol', emoji: '❤️' }] }]);
  assert.deepEqual((await db.doc('tasks/tb2').get()).data()?.comments, [{ id: 'c3', userId: 'carol', text: 'hi' }]);
  assert.equal(await count('users', 'friends', 'alice'), 0);
}

// ---------- 1. full deletion ----------
await wipe();
await seed();
const r = await del.deleteAccount("alice");
await assertAliceGone();
await assertOthersIntact();
assert.deepEqual(r.waIds, ['9222']);
assert.deepEqual(r.skippedWaIds, ['9111']);
assert.deepEqual(googleDisconnected, ['alice']);
assert.equal(r.deleted.tasks, 2);
assert.equal(r.kept.length > 0, true);
console.log('ok 1: deletes alice, keeps bob/carol/alice2 + reused and prefix-sharing numbers');

// ---------- 2. idempotent: a second run is a no-op on everyone else ----------
const r2 = await del.deleteAccount('alice');
assert.equal(Object.keys(r2.deleted).length, 0, `second run deletes nothing: ${JSON.stringify(r2.deleted)}`);
await assertAliceGone();
await assertOthersIntact();
console.log('ok 2: idempotent');

// ---------- 3. a run that fails half way is finished by a retry ----------
await wipe();
await seed();
failStorageOnce = true; // first Storage call (alice's first task attachment) throws
await assert.rejects(() => del.deleteAccount('alice'), /storage down/);
assert.equal((await db.doc('accountDeletions/alice').get()).data()?.status, 'running');
assert.equal(authUsers.has('alice'), true, 'auth user kept until everything else is gone');
// Simulate a worst-case partial run: the user doc AND the WhatsApp link are already gone; the tombstone must carry the number.
await db.doc('users/alice').delete();
await db.doc('waLinks/9222').delete();
await del.deleteAccount('alice');
await assertAliceGone();
await assertOthersIntact();
console.log('ok 3: partial failure + retry finishes the job (tombstone keeps identifiers)');

// ---------- 4. the whitelist entry stays when another account uses the same e-mail ----------
await wipe();
await seed();
await db.doc('users/alice').update({ email: 'shared@x.com' });
await db.doc('betaWhitelist/shared@x.com').set({ email: 'shared@x.com' });
await del.deleteAccount('alice');
assert.equal(await exists('betaWhitelist/shared@x.com'), true, 'alice2 still uses shared@x.com');
console.log('ok 4: shared whitelist e-mail kept');

// ---------- 4b. many tasks (more than two pages), each with attachments: all go, in parallel, nobody else's ----------
await wipe();
await seed();
{
  const N = 650;
  for (let i = 0; i < N; i += 400) {
    const b = db.batch();
    for (let j = i; j < Math.min(N, i + 400); j++) b.set(db.doc(`tasks/many${j}`), { userId: 'alice', text: `t${j}`, completed: false, createdAt: j });
    await b.commit();
  }
  for (let j = 0; j < N; j++) storage.add(`attachments/many${j}/f`);
  storage.add('attachments/many1x/f'); // a task id that only shares a prefix (no such alice task): must survive
  const rm = await del.deleteAccount('alice');
  assert.equal(rm.deleted.tasks, N + 2);
  assert.equal((await db.collection('tasks').where('userId', '==', 'alice').get()).size, 0);
  assert.equal([...storage].filter((f) => f.startsWith('attachments/many') && f !== 'attachments/many1x/f').length, 0);
  assert.equal(storage.has('attachments/many1x/f'), true);
  await assertAliceGone();
  await assertOthersIntact();
}
console.log('ok 4b: 650 tasks with attachments deleted across pages; prefix-sharing attachment folder kept');

// ---------- 5. route: auth, recent sign-in, confirm ----------
await wipe();
await seed();
let session: { uid: string; authTime: number } | null = null;
authDeps.verifyStrict = async () => {
  if (!session) throw new Error('bad token');
  return session;
};
const call = (body: unknown, token = 'tok') =>
  POST(new Request('http://x/api/app/account/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  }));
assert.equal((await call({ confirm: 'DELETE' }, '')).status, 401);
session = null;
assert.equal((await call({ confirm: 'DELETE' })).status, 401);
session = { uid: 'alice', authTime: Date.now() - 6 * 60_000 };
let res = await call({ confirm: 'DELETE' });
assert.equal(res.status, 401);
assert.equal((await res.json()).error, 'reauth_required');
assert.equal(await exists('users/alice'), true, 'old sign-in deletes nothing');
session = { uid: 'alice', authTime: Date.now() - 30_000 };
assert.equal((await call({})).status, 400, 'confirm is required');
assert.equal(await exists('users/alice'), true);
res = await call({ confirm: 'DELETE' });
assert.equal(res.status, 200);
const j = await res.json();
assert.equal(j.ok, true);
assert.equal(j.deleted.users, 1);
await assertAliceGone();
await assertOthersIntact();
console.log('ok 5: route requires a token, a sign-in < 5 min old, and confirm; then deletes only the caller');

console.log('test_account_delete: all passed');
