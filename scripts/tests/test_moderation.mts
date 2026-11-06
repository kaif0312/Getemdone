// Emulator test: report + block (App Store guideline 1.2). lib/server/moderation.ts, POST /api/app/report, POST /api/app/block,
// and the block checks in lib/server/social.ts (invite + answer). Run:
//   FIRESTORE_PORT=8685 bash scripts/test-emulator.sh scripts/tests/test_moderation.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { authDeps } from '../../lib/server/appAuth';
import * as mod from '../../lib/server/moderation';
import * as social from '../../lib/server/social';
import { POST as report } from '../../app/api/app/report/route';
import { POST as block } from '../../app/api/app/block/route';
import { POST as invite } from '../../app/api/app/friends/invite/route';

const db = adminDb();
const NOW = Date.parse('2026-11-06T10:00:00Z');
authDeps.verify = async (t) => {
  if (!t.startsWith('tok_')) throw new Error('bad token');
  return t.slice(4);
};
Object.assign(social.deps, {
  now: () => NOW,
  getLinkByUid: async () => null,
  sendText: async () => 'w', sendButtons: async () => 'w', sendTemplate: async () => 'w',
});

// owner alert fakes
const sent: { kind: 'text' | 'template'; to: string; body: string; vars?: string[] }[] = [];
let ownerLastInbound = NOW - 60_000; // window open
let textFails = false;
Object.assign(mod.deps, {
  now: () => NOW,
  ownerWa: () => '916238952660',
  getLink: async (wa: string) => (wa === '916238952660' ? { waId: wa, uid: 'owner', lastInboundAt: ownerLastInbound } : null),
  sendText: async (to: string, body: string) => {
    if (textFails) return null;
    sent.push({ kind: 'text', to, body });
    return 'wamid.t';
  },
  sendTemplate: async (to: string, name: string, vars: string[]) => {
    sent.push({ kind: 'template', to, body: name, vars });
    return 'wamid.p';
  },
});

const call = (h: (r: Request) => Promise<Response>, body: unknown, token?: string) =>
  h(new Request('http://x/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
const j = async (r: Response): Promise<{ status: number; error?: string; ok?: boolean; reportId?: string; inviteId?: string }> =>
  ({ status: r.status, ...(await r.json()) });

for (const c of await db.listCollections()) await db.recursiveDelete(c);
await db.doc('users/sara').set({ displayName: 'Sara', friends: ['ali', 'bo'], friendCode: 'SARA22' });
await db.doc('users/ali').set({ displayName: 'Ali', friends: ['sara', 'bo'], friendCode: 'ALI333' });
await db.doc('users/bo').set({ displayName: 'Bo', friends: ['sara', 'ali'], friendCode: 'BOBO44' });
await db.doc('users/cy').set({ displayName: 'Cy', friends: [], friendCode: 'CYCY55' });
await db.doc('tasks/t1').set({
  userId: 'sara', text: 'run', completed: false, createdAt: 1,
  comments: [{ id: 'c1', userId: 'ali', userName: 'Ali', text: 'you are useless', timestamp: 1 }, { id: 'c2', userId: 'bo', text: 'go', timestamp: 2 }],
});

// ---------- report: auth + validation ----------
assert.equal((await j(await call(report, { kind: 'user', targetUid: 'ali', reason: 'spam' }))).status, 401);
assert.equal((await j(await call(report, { kind: 'user', targetUid: 'ali', reason: 'spam' }, 'bad'))).status, 401);
assert.equal((await j(await call(report, 'not json', 'tok_sara'))).status, 400);
assert.equal((await j(await call(report, { kind: 'user', targetUid: 'ali', reason: 'rude' }, 'tok_sara'))).status, 400);
assert.equal((await j(await call(report, { kind: 'post', targetUid: 'ali', reason: 'spam' }, 'tok_sara'))).status, 400);
assert.equal((await j(await call(report, { kind: 'user', targetUid: 'a/b', reason: 'spam' }, 'tok_sara'))).status, 400);
assert.equal((await j(await call(report, { kind: 'comment', targetUid: 'ali', reason: 'spam' }, 'tok_sara'))).status, 400, 'comment needs ids');
assert.deepEqual(await j(await call(report, { kind: 'user', targetUid: 'sara', reason: 'spam' }, 'tok_sara')), { status: 409, error: 'self' });
assert.deepEqual(await j(await call(report, { kind: 'user', targetUid: 'ghost', reason: 'spam' }, 'tok_sara')), { status: 404, error: 'not_found' });
assert.equal((await db.collection('reports').get()).size, 0, 'nothing stored for refused reports');
assert.equal(sent.length, 0);
console.log('ok 1: report auth + validation');

// ---------- report a comment: stored with the server copy, owner alerted by text (window open) ----------
const r1 = await j(await call(report, {
  kind: 'comment', targetUid: 'ali', reason: 'harassment', taskId: 't1', commentId: 'c1', note: '  keeps doing this ', contentSeen: 'you are useless',
}, 'tok_sara'));
assert.equal(r1.status, 200);
const d1 = (await db.doc(`reports/${r1.reportId}`).get()).data()!;
assert.deepEqual(
  { r: d1.reporterUid, t: d1.targetUid, k: d1.kind, re: d1.reason, s: d1.status, n: d1.note, cs: d1.contentStored, cf: d1.commentFound, a: d1.alert, c: d1.createdAt },
  { r: 'sara', t: 'ali', k: 'comment', re: 'harassment', s: 'open', n: 'keeps doing this', cs: 'you are useless', cf: true, a: 'text', c: NOW },
);
assert.equal(sent.length, 1);
assert.equal(sent[0].kind, 'text');
assert.equal(sent[0].to, '916238952660');
assert.match(sent[0].body, /Harassment/);
assert.match(sent[0].body, /Sara reported a comment by Ali/);
assert.match(sent[0].body, /you are useless/);
assert.match(sent[0].body, new RegExp(`reports/${r1.reportId}`));
// a comment id that is not that person's: stored, flagged, still alerted
const r1b = await j(await call(report, { kind: 'comment', targetUid: 'ali', reason: 'spam', taskId: 't1', commentId: 'c2' }, 'tok_sara'));
assert.equal(r1b.status, 200);
assert.equal((await db.doc(`reports/${r1b.reportId}`).get()).data()!.commentFound, false);
assert.equal((await db.doc(`reports/${r1b.reportId}`).get()).data()!.contentStored, undefined);
console.log('ok 2: comment report stored + owner texted inside the 24 h window');

// ---------- window closed -> template; text failing -> template ----------
ownerLastInbound = NOW - 25 * 3600_000;
sent.length = 0;
const r2 = await j(await call(report, { kind: 'user', targetUid: 'ali', reason: 'inappropriate' }, 'tok_bo'));
assert.equal(r2.status, 200);
assert.equal(sent.length, 1);
assert.equal(sent[0].kind, 'template');
assert.equal(sent[0].body, 'nudge_reminder');
assert.equal(sent[0].vars?.length, 2);
assert.match(sent[0].vars![0], new RegExp(r2.reportId!));
assert.equal((await db.doc(`reports/${r2.reportId}`).get()).data()!.alert, 'template');
ownerLastInbound = NOW - 60_000;
textFails = true;
sent.length = 0;
const r3 = await j(await call(report, { kind: 'user', targetUid: 'bo', reason: 'other', note: 'x'.repeat(900) }, 'tok_ali'));
assert.equal(r3.status, 200);
assert.equal(sent[0].kind, 'template', 'failed text falls back to the template');
assert.equal(((await db.doc(`reports/${r3.reportId}`).get()).data()!.note as string).length, 500, 'note clipped');
textFails = false;
console.log('ok 3: closed window / failed text -> nudge_reminder template');

// ---------- rate limit ----------
for (let i = 0; i < mod.MAX_REPORTS_PER_DAY; i++) {
  await db.collection('reports').add({ reporterUid: 'cy', targetUid: 'ali', kind: 'user', reason: 'spam', status: 'open', createdAt: NOW - 1000 });
}
assert.deepEqual(await j(await call(report, { kind: 'user', targetUid: 'ali', reason: 'spam' }, 'tok_cy')), { status: 429, error: 'rate_limited' });
const old = await db.collection('reports').where('reporterUid', '==', 'cy').get();
await Promise.all(old.docs.map((d) => d.ref.update({ createdAt: NOW - 2 * 86_400_000 })));
assert.equal((await j(await call(report, { kind: 'user', targetUid: 'ali', reason: 'spam' }, 'tok_cy'))).status, 200, 'old reports do not count');
console.log('ok 4: rate limit per reporter per 24 h');

// ---------- block ----------
assert.equal((await j(await call(block, { uid: 'ali' }))).status, 401);
assert.equal((await j(await call(block, {}, 'tok_sara'))).status, 400);
assert.equal((await j(await call(block, { uid: 'ali', block: 'yes' }, 'tok_sara'))).status, 400);
assert.deepEqual(await j(await call(block, { uid: 'sara' }, 'tok_sara')), { status: 409, error: 'self' });
assert.deepEqual(await j(await call(block, { uid: 'ghost' }, 'tok_sara')), { status: 404, error: 'not_found' });
// a pending invite from ali to cy and from cy to sara... and one from sara to cy that must survive
const iAliSara = await db.collection('friendInvites').add({ fromUid: 'ali', toUid: 'sara', status: 'pending', createdAt: 1 });
const iSaraCy = await db.collection('friendInvites').add({ fromUid: 'sara', toUid: 'cy', status: 'pending', createdAt: 1 });
assert.deepEqual(await j(await call(block, { uid: 'ali' }, 'tok_sara')), { status: 200, ok: true });
assert.deepEqual((await db.doc('blocks/sara').get()).data()!.uids, ['ali']);
assert.deepEqual((await db.doc('users/sara').get()).data()!.friends, ['bo'], 'friendship removed on the blocker');
assert.deepEqual((await db.doc('users/ali').get()).data()!.friends, ['bo'], 'friendship removed on the blocked side');
assert.deepEqual((await db.doc('users/bo').get()).data()!.friends, ['sara', 'ali'], 'third parties untouched');
assert.equal((await iAliSara.get()).data()!.status, 'declined');
assert.equal((await iSaraCy.get()).data()!.status, 'pending');
// idempotent
assert.equal((await j(await call(block, { uid: 'ali' }, 'tok_sara'))).status, 200);
assert.deepEqual((await db.doc('blocks/sara').get()).data()!.uids, ['ali']);
console.log('ok 5: block removes the friendship both ways + declines pending invites');

// ---------- invites refused both ways; answer turns into decline ----------
assert.deepEqual(await j(await call(invite, { code: 'ALI333' }, 'tok_sara')), { status: 409, error: 'blocked' });
assert.deepEqual(await j(await call(invite, { uid: 'sara' }, 'tok_ali')), { status: 404, error: 'not_found' });
assert.deepEqual(await j(await call(invite, { code: 'sara22' }, 'tok_ali')), { status: 404, error: 'not_found' });
assert.equal((await db.collection('friendInvites').where('fromUid', '==', 'ali').where('status', '==', 'pending').get()).size, 0);
// an invite that slipped in before the block (written directly) cannot be accepted
const late = await db.collection('friendInvites').add({ fromUid: 'ali', toUid: 'sara', status: 'pending', createdAt: 2 });
await social.answerInvite('sara', late.id, true);
assert.equal((await late.get()).data()!.status, 'declined');
assert.deepEqual((await db.doc('users/sara').get()).data()!.friends, ['bo']);
assert.deepEqual((await db.doc('users/ali').get()).data()!.friends, ['bo']);
// other invites still work
assert.equal((await j(await call(invite, { code: 'CYCY55' }, 'tok_bo'))).status, 200);
console.log('ok 6: blocked pair cannot invite or accept; others can');

// ---------- unblock ----------
assert.deepEqual(await j(await call(block, { uid: 'ali', block: false }, 'tok_sara')), { status: 200, ok: true });
assert.deepEqual((await db.doc('blocks/sara').get()).data()!.uids, []);
assert.deepEqual((await db.doc('users/sara').get()).data()!.friends, ['bo'], 'unblock does not re-add the friend');
assert.equal((await j(await call(block, { uid: 'ghost', block: false }, 'tok_sara'))).status, 200, 'unknown uid can be unblocked');
const again = await j(await call(invite, { code: 'ALI333' }, 'tok_sara'));
assert.equal(again.status, 200, 'invites work again after unblock');
console.log('ok 7: unblock');

console.log('test_moderation: all passed');
