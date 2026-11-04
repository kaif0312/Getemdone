// Set up daily WhatsApp medicine reminders for a family member (parents) who will only ever receive them.
//   node scripts/med_plan.mjs --owner 971501234567 --patient 919876543210 --name "അമ്മ" --label "Amma" --lang ml \
//        --meds "BP tablet@08:00,21:00; Thyroid@06:30" [--tz Asia/Kolkata] [--no-notify-taken] [--dry]
//
//   --owner    the family member's own WhatsApp number (already linked to Nudge): gets "took it" notes and "not confirmed" alerts
//   --patient  the parent's WhatsApp number (digits, with country code)
//   --name     how the reminder addresses the parent, in THEIR script (e.g. "അമ്മ", "उम्मी"); shown at the start of the message
//   --label    how the owner refers to them in the alerts ("Amma"); defaults to --name
//   --lang     en | hi | ur | ml (language of the reminders and replies to the parent)
//   --meds     "Name@HH:mm,HH:mm; Name2@HH:mm" 24 h times, local to --tz (default Asia/Kolkata)
// Uses ~/.secrets/nudge/firebase-sa.json (PRODUCTION Firestore). Idempotent: running it again for the same owner + patient
// replaces the medicine list. The parent is created as a "care" contact: no to-do bot, no morning check-in, no recap.
// IMPORTANT: the first reminder can only be a template until the parent has written to the Nudge number once (24 h window).
// Ask them to send "hi" to the Nudge number first, or make sure the nudge_med_reminder template is approved (create_wa_templates.mjs).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const die = (m) => { console.error(m); process.exit(1); };

const owner = val('--owner');
const patient = val('--patient');
const name = val('--name');
const label = val('--label') || name;
const lang = val('--lang') || 'ml';
const tz = val('--tz') || 'Asia/Kolkata';
const medsArg = val('--meds');
const dry = flag('--dry');
if (!/^\d{8,15}$/.test(owner ?? '') || !/^\d{8,15}$/.test(patient ?? '')) die('--owner and --patient must be digits with country code');
if (!name || !medsArg) die('usage: node scripts/med_plan.mjs --owner <wa> --patient <wa> --name "<greeting name>" [--label "<name for the owner>"] --lang ml --meds "BP tablet@08:00,21:00; Thyroid@06:30"');
if (!['en', 'hi', 'ur', 'ml'].includes(lang)) die('--lang must be en, hi, ur or ml');
try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { die('bad --tz'); }

const meds = medsArg.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
  const [medName, times] = part.split('@');
  const ts = (times ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!medName?.trim() || !ts.length || ts.some((x) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(x))) die(`bad medicine "${part}" (want Name@HH:mm,HH:mm)`);
  return { name: medName.trim(), times: [...new Set(ts.map((x) => x.padStart(5, '0')))].sort() };
});

const sa = JSON.parse(readFileSync(join(homedir(), '.secrets', 'nudge', 'firebase-sa.json'), 'utf8'));
initializeApp({ credential: cert(sa), projectId: sa.project_id });
const db = getFirestore();

const ownerLink = await db.doc(`waLinks/${owner}`).get();
if (!ownerLink.exists) die(`owner ${owner} is not linked to Nudge yet`);
const ownerUid = ownerLink.data().uid;

const planId = `${ownerUid.slice(0, 8)}_${patient}`;
const plan = {
  ownerUid, patientWaId: patient, patientName: name, ownerLabel: label, lang, tz, meds, active: true,
  notifyTaken: !flag('--no-notify-taken'), remindAfterMin: 30, escalateAfterMin: 90,
};
console.log(JSON.stringify({ planId, ...plan }, null, 2));
if (dry) { console.log('# dry run: nothing written'); process.exit(0); }

const now = Date.now();
const existing = await db.doc(`waLinks/${patient}`).get();
if (existing.exists && !existing.data().care) die(`${patient} is already a normal Nudge user; not turning them into a care contact`);
if (!existing.exists) {
  const user = await getAuth().createUser({ displayName: label });
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let friendCode = '';
  for (let i = 0; i < 6; i++) friendCode += chars[randomInt(chars.length)];
  await db.doc(`users/${user.uid}`).set(
    { id: user.uid, displayName: label, friendCode, friends: [], createdAt: now, timezone: tz, whatsapp: { waId: patient, linkedAt: now } },
    { merge: true },
  );
  await db.doc(`waLinks/${patient}`).set({
    waId: patient, uid: user.uid, linkedAt: now, lastInboundAt: 0, timezone: tz, checkinTime: null, recapTime: null,
    friendAlerts: false, muted: false, care: true, lang, langManual: true,
  });
  console.log(`created care contact ${label} (${patient})`);
} else {
  await db.doc(`waLinks/${patient}`).update({ lang, langManual: true, timezone: tz });
  console.log(`care contact ${patient} already exists, updated language`);
}
const ref = db.doc(`medPlans/${planId}`);
const had = (await ref.get()).exists;
await ref.set({ ...plan, ...(had ? {} : { createdAt: now }) }, { merge: true });
console.log(`${had ? 'updated' : 'created'} medPlans/${planId}`);
