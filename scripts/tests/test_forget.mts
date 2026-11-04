// "delete my data" against the Firestore emulator: session + link gone, tasks and learning rows kept but unlinked.
// Run: FIRESTORE_PORT=8585 bash scripts/test-emulator.sh scripts/tests/test_forget.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { createLinkCode, redeemLinkCode, getLink, updateLink } from '../../lib/wa/links';
import { getSession, saveSession } from '../../lib/wa/sessions';
import { forgetMe } from '../../lib/wa/privacy';
import { logLearning } from '../../lib/server/learning';

const db = adminDb();
const wa = '971500000777';
await db.doc('users/uidF').set({ displayName: 'Fa', friends: [] });
await db.doc('tasks/tf1').set({ userId: 'uidF', text: 'gym', completed: false });
const c = await createLinkCode('uidF', 'Asia/Dubai');
assert.equal((await redeemLinkCode(wa, c.code)).ok, true);
await updateLink(wa, { learnId: 'lid-1', privacyNoticeAt: 5 });
await saveSession(wa, { turns: [{ role: 'user', text: 'hi', at: 1 }], lastList: [], updatedAt: 1 });
await logLearning({ lid: 'lid-1', at: 1, path: 'ai', user: 'hi', bot: 'hello' });
assert.equal((await db.doc('users/uidF').get()).data()!.whatsapp.waId, wa);

await forgetMe(wa);
assert.equal(await getLink(wa), null);
assert.equal((await db.doc(`waSessions/${wa}`).get()).exists, false);
assert.deepEqual((await getSession(wa)).turns, []);
assert.equal((await db.doc('users/uidF').get()).data()!.whatsapp, undefined);
assert.equal((await db.doc('tasks/tf1').get()).exists, true); // tasks stay in the app account
const rows = await db.collection('learningLog').where('lid', '==', 'lid-1').get();
assert.equal(rows.size, 1); // kept, and nothing maps lid-1 to the person any more
assert.equal((await db.collection('waLinks').where('learnId', '==', 'lid-1').get()).size, 0);

await forgetMe(wa); // twice is harmless
console.log('test_forget: ok');
