// Add a friend to the Nudge WhatsApp bot without the web app: creates a Firebase Auth user + users/{uid} + waLinks/{waId}.
// Their first WhatsApp message starts the setup chat (name, city/timezone, check-in times, goal).
// Usage: node scripts/add_friend.mjs "<Name>" <number with country code, digits only> [IANA timezone]
// Example: node scripts/add_friend.mjs "Hassan" 821072080320 Asia/Seoul
// Uses ~/.secrets/nudge/firebase-sa.json (PRODUCTION Firestore). Idempotent: an already linked number is left alone.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const [name, waId, tz = 'Asia/Kolkata'] = process.argv.slice(2);
if (!name || !/^\d{8,15}$/.test(waId ?? '')) {
  console.error('usage: node scripts/add_friend.mjs "<Name>" <digits with country code> [IANA timezone]');
  process.exit(1);
}
new Intl.DateTimeFormat('en-US', { timeZone: tz }); // throws on a bad zone

const sa = JSON.parse(readFileSync(join(homedir(), '.secrets', 'nudge', 'firebase-sa.json'), 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const existing = await db.doc(`waLinks/${waId}`).get();
if (existing.exists) {
  console.log(`already linked: ${waId} -> uid ${existing.data().uid}`);
  process.exit(0);
}

const user = await getAuth().createUser({ displayName: name });
const uid = user.uid;
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let friendCode = '';
for (let i = 0; i < 6; i++) friendCode += chars[randomInt(chars.length)];
const now = Date.now();

await db.doc(`users/${uid}`).set(
  { id: uid, displayName: name, friendCode, friends: [], createdAt: now, timezone: tz, whatsapp: { waId, linkedAt: now } },
  { merge: true },
);
await db.doc(`waLinks/${waId}`).set({
  waId, uid, linkedAt: now, lastInboundAt: now, timezone: tz,
  checkinTime: '08:00', recapTime: '21:00', friendAlerts: true, muted: false,
  onboarding: { step: 'welcome' }, // their first message starts the WhatsApp setup chat (lib/bot/onboarding.ts); needs that code deployed
});
console.log(`added ${name}: waId ${waId}, uid ${uid}, tz ${tz}`);
process.exit(0);
