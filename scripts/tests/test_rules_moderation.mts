// Emulator test of firestore.rules for the safety docs (App Store 1.2): reports (create-only by the reporter, no reads),
// blocks (owner reads, nobody writes), and a blocked person cannot add themselves to the blocker's friends array.
// Client SDK with mock auth tokens, so the RULES are checked (Admin seeding bypasses them). Run:
//   FIRESTORE_RULES=1 FIRESTORE_PORT=8785 bash scripts/test-emulator.sh scripts/tests/test_rules_moderation.mts
import assert from 'node:assert/strict';
import { deleteApp, initializeApp } from 'firebase/app';
import {
  arrayUnion, connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, updateDoc, collection, addDoc, deleteDoc,
  terminate, type Firestore,
} from 'firebase/firestore';
import { adminDb } from '../../lib/server/firebaseAdmin';

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort) throw new Error('run through scripts/test-emulator.sh (FIRESTORE_EMULATOR_HOST unset)');
const [host, port] = hostPort.split(':');
const apps: ReturnType<typeof initializeApp>[] = [];
function as(uid: string | null): Firestore {
  const app = initializeApp({ projectId: 'demo-nudge', apiKey: 'x' }, `u_${uid ?? 'anon'}_${apps.length}`);
  apps.push(app);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { user_id: uid, sub: uid } } : undefined);
  return db;
}
const denied = async (p: Promise<unknown>, what: string) => {
  await assert.rejects(p, (e: { code?: string }) => e?.code === 'permission-denied', `${what} should be denied`);
};

const admin = adminDb();
for (const c of await admin.listCollections()) await admin.recursiveDelete(c);
const user = (id: string, friends: string[]) =>
  admin.doc(`users/${id}`).set({ id, displayName: id, email: `${id}@x.com`, friendCode: id.toUpperCase(), friends, createdAt: 1 });
await user('alice', []);
await user('bob', []);
await user('carol', []);
await admin.doc('blocks/alice').set({ uids: ['bob'], updatedAt: 1 });

const alice = as('alice');
const bob = as('bob');
const carol = as('carol');
const anon = as(null);

// ---------- reports ----------
const good = { reporterUid: 'alice', targetUid: 'bob', kind: 'comment', reason: 'harassment', taskId: 't1', commentId: 'c1',
  contentSeen: 'mean', note: 'again', status: 'open', createdAt: Date.now(), source: 'app' };
const ref = await addDoc(collection(alice, 'reports'), good);
assert.equal((await admin.doc(`reports/${ref.id}`).get()).data()?.reporterUid, 'alice');
await addDoc(collection(alice, 'reports'), { reporterUid: 'alice', targetUid: 'bob', kind: 'user', reason: 'spam', status: 'open', createdAt: 1 });
await denied(getDoc(doc(alice, 'reports', ref.id)), 'reporter reading their report');
await denied(getDoc(doc(bob, 'reports', ref.id)), 'reported person reading the report');
await denied(updateDoc(doc(alice, 'reports', ref.id), { status: 'closed' }), 'update');
await denied(deleteDoc(doc(alice, 'reports', ref.id)), 'delete');
await denied(addDoc(collection(bob, 'reports'), good), 'filing as someone else');
await denied(addDoc(collection(anon, 'reports'), good), 'signed out');
await denied(addDoc(collection(alice, 'reports'), { ...good, targetUid: 'alice' }), 'reporting yourself');
await denied(addDoc(collection(alice, 'reports'), { ...good, reason: 'rude' }), 'unknown reason');
await denied(addDoc(collection(alice, 'reports'), { ...good, kind: 'post' }), 'unknown kind');
await denied(addDoc(collection(alice, 'reports'), { ...good, status: 'closed' }), 'status other than open');
await denied(addDoc(collection(alice, 'reports'), { ...good, contentStored: 'x' }), 'server-only field');
await denied(addDoc(collection(alice, 'reports'), { ...good, note: 'x'.repeat(501) }), 'long note');
console.log('ok 1: reports are create-only for the reporter, unreadable');

// ---------- blocks ----------
assert.deepEqual((await getDoc(doc(alice, 'blocks', 'alice'))).data()?.uids, ['bob']);
await denied(getDoc(doc(bob, 'blocks', 'alice')), 'reading someone else\'s block list');
await denied(setDoc(doc(alice, 'blocks', 'alice'), { uids: [] }), 'client write to own block list');
await denied(setDoc(doc(bob, 'blocks', 'bob'), { uids: ['alice'] }), 'client create of a block list');
console.log('ok 2: blocks readable by the owner only, server-written');

// ---------- friends array ----------
await denied(updateDoc(doc(bob, 'users', 'alice'), { friends: arrayUnion('bob') }), 'blocked person adding themselves');
await updateDoc(doc(carol, 'users', 'alice'), { friends: arrayUnion('carol') }); // unchanged legacy behaviour for others
await updateDoc(doc(alice, 'users', 'alice'), { friends: arrayUnion('bob') }); // the owner may still change their own doc
await updateDoc(doc(bob, 'users', 'carol'), { friends: arrayUnion('bob') }); // no block list on carol
assert.deepEqual((await admin.doc('users/alice').get()).data()?.friends, ['carol', 'bob']);
// a block list that does not name the caller does not get in the way
await admin.doc('blocks/carol').set({ uids: ['zed'], updatedAt: 1 });
await updateDoc(doc(alice, 'users', 'carol'), { friends: arrayUnion('alice') });
await admin.doc('blocks/carol').set({ updatedAt: 1 }); // and one with no uids field
await updateDoc(doc(alice, 'users', 'carol'), { friends: arrayUnion('alice2') });
console.log('ok 3: a blocked person cannot write the blocker\'s friends array');

for (const a of apps) {
  await terminate(getFirestore(a));
  await deleteApp(a);
}
console.log('test_rules_moderation: all passed');
