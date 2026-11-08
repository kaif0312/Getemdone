// Create a routine for a user without the app: node scripts/add_routine.mjs <uid> "<title>" <HH:mm> [days: mon,wed | weekdays | weekends]
// Example (the owner's isabgol): node scripts/add_routine.mjs <uid> "Take isabgol" 22:00
// Uses ~/.secrets/nudge/firebase-sa.json (PRODUCTION Firestore). Same title again = changes its time/days (like the bot).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const [uid, title, time, daysArg] = process.argv.slice(2);
if (!uid || !title || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time ?? '')) {
  console.error('usage: node scripts/add_routine.mjs <uid> "<title>" <HH:mm> [mon,wed|weekdays|weekends]');
  process.exit(1);
}
const NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const days = new Set();
for (const x of (daysArg ?? '').toLowerCase().split(/[\s,]+/).filter(Boolean)) {
  if (x === 'weekdays') [1, 2, 3, 4, 5].forEach((d) => days.add(d));
  else if (x === 'weekends') [0, 6].forEach((d) => days.add(d));
  else if (NAMES.includes(x.slice(0, 3))) days.add(NAMES.indexOf(x.slice(0, 3)));
  else { console.error(`unknown day: ${x}`); process.exit(1); }
}
const sa = JSON.parse(readFileSync(join(homedir(), '.secrets', 'nudge', 'firebase-sa.json'), 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();
const [h, m] = time.split(':');
const hhmm = `${h.padStart(2, '0')}:${m}`;
const dayList = days.size === 7 ? [] : [...days].sort();
const same = (await db.collection('routines').where('uid', '==', uid).get()).docs.find(
  (d) => d.data().active !== false && String(d.data().title).toLowerCase() === title.trim().toLowerCase(),
);
if (same) {
  await same.ref.update({ time: hhmm, days: dayList });
  console.log(`updated ${same.id}: ${title} ${hhmm} days=${JSON.stringify(dayList)}`);
} else {
  const ref = db.collection('routines').doc();
  await ref.set({ uid, title: title.trim().slice(0, 60), time: hhmm, days: dayList, active: true, createdAt: Date.now() });
  console.log(`created ${ref.id}: ${title} ${hhmm} days=${JSON.stringify(dayList)}`);
}
