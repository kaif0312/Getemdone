// Emulator test: native app friend-invite endpoints (consent flow). Run:
//   FIRESTORE_PORT=8585 bash scripts/test-emulator.sh scripts/tests/test_app_friends.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { authDeps } from '../../lib/server/appAuth';
import * as social from '../../lib/server/social';
import { POST as invite } from '../../app/api/app/friends/invite/route';
import { POST as answer } from '../../app/api/app/friends/answer/route';

const db = adminDb();
authDeps.verify = async (t) => {
  if (!t.startsWith('tok_')) throw new Error('bad token');
  return t.slice(4);
};
Object.assign(social.deps, {
  getLinkByUid: async () => null,
  sendText: async () => 'w', sendButtons: async () => 'w', sendTemplate: async () => 'w',
});

const call = (h: (r: Request) => Promise<Response>, body: unknown, token?: string) =>
  h(new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
const j = async (r: Response): Promise<{ status: number; error?: string; ok?: boolean; inviteId?: string }> => ({ status: r.status, ...(await r.json()) });

for (const c of ['users', 'notifications', 'friendInvites']) {
  const s = await db.collection(c).get();
  await Promise.all(s.docs.map((d) => d.ref.delete()));
}
await db.doc('users/sara').set({ displayName: 'Sara', friends: [], friendCode: 'SARA22' });
await db.doc('users/ali').set({ displayName: 'Ali', friends: [], friendCode: 'ALI333', notificationSettings: { enabled: true } });
await db.doc('users/quiet').set({ displayName: 'Quiet', friends: [], friendCode: 'QUIET4', notificationSettings: { enabled: false } });

// auth
assert.equal((await j(await call(invite, { code: 'ALI333' }))).status, 401);
assert.equal((await j(await call(invite, { code: 'ALI333' }, 'nope'))).status, 401);
assert.equal((await j(await call(answer, { inviteId: 'x', accept: true }))).status, 401);
// validation
assert.equal((await j(await call(invite, {}, 'tok_sara'))).status, 400);
assert.equal((await j(await call(invite, 'not json', 'tok_sara'))).status, 400);
assert.equal((await j(await call(answer, { inviteId: 'x' }, 'tok_ali'))).status, 400);
// invite errors
assert.equal((await j(await call(invite, { code: 'ZZZZZZ' }, 'tok_sara'))).error, 'not_found');
assert.equal((await j(await call(invite, { code: 'ZZZZZZ' }, 'tok_sara'))).status, 404);
assert.equal((await j(await call(invite, { code: 'sara22' }, 'tok_sara'))).error, 'self');
assert.equal((await j(await call(invite, { uid: 'ghost' }, 'tok_sara'))).status, 404);

// invite by code (case-insensitive) -> invite doc + notification
const r1 = await j(await call(invite, { code: 'ali333' }, 'tok_sara'));
assert.equal(r1.status, 200);
assert.equal(typeof r1.inviteId, 'string');
const inv = (await db.doc(`friendInvites/${r1.inviteId}`).get()).data()!;
assert.deepEqual({ f: inv.fromUid, t: inv.toUid, s: inv.status }, { f: 'sara', t: 'ali', s: 'pending' });
const notes = (await db.collection('notifications').where('userId', '==', 'ali').get()).docs.map((d) => d.data());
assert.equal(notes.length, 1);
assert.equal(notes[0].fromUserId, 'sara');
assert.equal((await j(await call(invite, { code: 'ALI333' }, 'tok_sara'))).error, 'already_invited');
// opted-out recipient: invite exists, no notification
const rq = await j(await call(invite, { uid: 'quiet' }, 'tok_sara'));
assert.equal(rq.status, 200);
assert.equal((await db.collection('notifications').where('userId', '==', 'quiet').get()).size, 0);

// answer: wrong person, then accept, then again
assert.deepEqual(await j(await call(answer, { inviteId: r1.inviteId, accept: true }, 'tok_sara')), { status: 403, error: 'not_your_invite' });
assert.deepEqual(await j(await call(answer, { inviteId: 'missing', accept: true }, 'tok_ali')), { status: 404, error: 'invite_not_found' });
assert.deepEqual(await j(await call(answer, { inviteId: r1.inviteId, accept: true }, 'tok_ali')), { status: 200, ok: true });
assert.deepEqual((await db.doc('users/sara').get()).data()!.friends, ['ali']);
assert.deepEqual((await db.doc('users/ali').get()).data()!.friends, ['sara']);
assert.equal((await db.doc(`friendInvites/${r1.inviteId}`).get()).data()!.status, 'accepted');
assert.equal((await j(await call(answer, { inviteId: r1.inviteId, accept: true }, 'tok_ali'))).status, 409);
assert.equal((await j(await call(invite, { code: 'ALI333' }, 'tok_sara'))).error, 'already_friends');
// decline leaves friends untouched
assert.equal((await j(await call(answer, { inviteId: rq.inviteId, accept: false }, 'tok_quiet'))).status, 200);
assert.deepEqual((await db.doc('users/quiet').get()).data()!.friends, []);
console.log('app friends ok');
