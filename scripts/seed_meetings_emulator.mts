// Seeds 6 meetings for kaif@nudge.test into the emulators (dev only). Needs the Auth + Firestore emulators running and the
// test user from `scripts/test-emulator.sh` / the app sign-up.
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 GCLOUD_PROJECT=getemdone-87679 \
//     npx tsx scripts/seed_meetings_emulator.mts
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Refusing to run without FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST (emulator only).');
}
const app = getApps()[0] ?? initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'getemdone-87679' });
const user = await getAuth(app).getUserByEmail('kaif@nudge.test');
const db = getFirestore(app);

// The web app signs out users that are not on the beta whitelist; make sure the test user is.
await db.collection('betaWhitelist').doc('kaif@nudge.test').set({ email: 'kaif@nudge.test', addedAt: Date.now() }, { merge: true });

const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const base = { ownerUid: user.uid, tz: 'Asia/Kolkata', attendees: [], status: 'scheduled', createdVia: 'app', reminderMinutes: [10], createdAt: iso(now), updatedAt: iso(now) };

const rows: Array<[string, Record<string, unknown>]> = [
  ['live-now', { title: 'Standup with the team', startAt: iso(now - 5 * MIN), endAt: iso(now + 25 * MIN), meetUrl: 'https://meet.google.com/abc-defg-hij', gcalEventId: 'ev1', gcalLink: 'https://calendar.google.com/event?eid=ev1' }],
  ['soon', { title: 'Design review', startAt: iso(now + 8 * MIN), endAt: iso(now + 38 * MIN), meetUrl: 'https://meet.google.com/klm-nopq-rst', createdVia: 'claude-code', gcalLink: 'https://calendar.google.com/event?eid=ev2' }],
  ['later-today', {
    title: 'Sprint planning: Q4 roadmap and hiring', startAt: iso(now + 5 * 3600_000), endAt: iso(now + 6 * 3600_000), createdVia: 'claude-code', notes: 'Bring the roadmap doc.\nDecide on the hiring plan.',
    meetUrl: 'https://meet.google.com/uvw-xyza-bcd', reminderMinutes: [30, 10],
    attendees: [{ name: 'Ada Lovelace', email: 'ada@example.com' }, { name: 'Sam Rivera' }, { email: 'priya@example.com' }, { name: 'Omar Khan', email: 'omar@example.com' }],
  }],
  ['tomorrow', { title: 'Call with the supplier', startAt: iso(now + 26 * 3600_000), endAt: iso(now + 26.75 * 3600_000), createdVia: 'bot', attendees: [{ name: 'Ravi', waId: '919999999999' }] }],
  ['next-week', { title: 'Quarterly check-in', startAt: iso(now + 7 * 24 * 3600_000), endAt: iso(now + 7 * 24 * 3600_000 + 45 * MIN), reminderMinutes: [] }],
  ['cancelled', { title: 'Cancelled: must not show', startAt: iso(now + 3 * 3600_000), endAt: iso(now + 4 * 3600_000), status: 'cancelled' }],
];
for (const [id, r] of rows) {
  await db.collection('meetings').doc(`seed-${id}`).set({ ...base, id: `seed-${id}`, ...r, attendeeUids: [] });
}
console.log(`Seeded ${rows.length} meetings for ${user.email} (${user.uid}).`);
