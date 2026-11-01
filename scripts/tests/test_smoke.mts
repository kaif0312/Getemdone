import { adminDb } from '../../lib/server/firebaseAdmin';
const db = adminDb();
await db.doc('smoke/a').set({ ok: 1 });
const s = await db.doc('smoke/a').get();
if (s.data()?.ok !== 1) throw new Error('smoke failed');
console.log('SMOKE OK');
