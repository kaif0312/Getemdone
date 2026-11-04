// Emulator tests: medicine reminders for family (lib/server/meds.ts). Run via scripts/test-emulator.sh.
//   FIRESTORE_PORT=8485 bash scripts/test-emulator.sh scripts/tests/test_meds.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import {
  addMedication, deps, forwardToOwner, openDosesFor, removeMedication, runMeds, snoozeDose, statusLines, takeDose,
} from '../../lib/server/meds';
import { zonedToMs } from '../../lib/bot/format';

const db = adminDb();
const TZ = 'Asia/Kolkata';
const at = (hhmm: string) => zonedToMs(`2026-11-10T${hhmm}`, TZ)!;
const min = (n: number) => n * 60_000;
const sfx = String(Date.now());

// ---- fakes
const buttons: { to: string; body: string; ids: string[]; titles: string[] }[] = [];
const texts: { to: string; body: string }[] = [];
const templates: { to: string; name: string; vars: string[]; lang: string; payloads?: string[] }[] = [];
const pushes: { token: string; body: string }[] = [];
let templateOk = true;
deps.sendButtons = async (to, body, bs) => { buttons.push({ to, body, ids: bs.map((b) => b.id), titles: bs.map((b) => b.title) }); return 'wamid.B' + buttons.length; };
deps.sendText = async (to, body) => { texts.push({ to, body }); return 'wamid.T'; };
deps.sendTemplateLang = async (to, name, vars, lang, opts) => { templates.push({ to, name, vars, lang, payloads: opts?.buttonPayloads }); return templateOk ? 'wamid.TPL' + templates.length : null; };
deps.sendPush = async (token, _t, body) => { pushes.push({ token, body }); return true; };
const reset = () => { buttons.length = 0; texts.length = 0; templates.length = 0; pushes.length = 0; templateOk = true; };

// ---- people: an owner (window open) and two parents (one window closed, one open)
const owner = 'own_' + sfx, ownerWa = '9710' + sfx.slice(-7);
const amma = '9199' + sfx.slice(-8), umma = '9198' + sfx.slice(-8);
const NOW0 = at('07:00');
await db.doc(`users/${owner}`).set({ displayName: 'Kaif', friends: [], timezone: TZ });
const link = (waId: string, uid: string, last: number, extra: Record<string, unknown> = {}) =>
  db.doc(`waLinks/${waId}`).set({ waId, uid, linkedAt: 1, lastInboundAt: last, timezone: TZ, checkinTime: null, recapTime: null, friendAlerts: false, muted: false, ...extra });
await link(ownerWa, owner, at('23:00') - min(60 * 24) + min(60 * 20)); // refreshed below per scenario
await link(amma, 'u_amma_' + sfx, 0, { care: true, lang: 'ml', langManual: true }); // window closed
await link(umma, 'u_umma_' + sfx, at('06:30'), { care: true, lang: 'hi', langManual: true }); // window open
const ownerWindowOpen = (now: number) => db.doc(`waLinks/${ownerWa}`).update({ lastInboundAt: now - min(5) });
await ownerWindowOpen(NOW0);

const planBase = { ownerUid: owner, tz: TZ, active: true, notifyTaken: true, remindAfterMin: 30, escalateAfterMin: 90, createdAt: 1 };
await db.doc(`medPlans/p_amma_${sfx}`).set({ ...planBase, patientWaId: amma, patientName: 'അമ്മ', ownerLabel: 'Amma', lang: 'ml', meds: [{ name: 'BP ഗുളിക', times: ['08:00', '21:00'] }, { name: 'Thyroid', times: ['08:00'] }] });
const pid = `p_amma_${sfx}`;
const doseId = (time: string) => `${pid}_2026-11-10_${time}`;
const dose = async (id: string) => (await db.doc(`medDoses/${id}`).get()).data();

// ---- 1. nothing before the time; at 08:02 ONE template (window closed), grouped, in Malayalam, with the two payloads
let c = await runMeds(at('07:59'));
assert.equal(c.sent, 0);
reset();
await ownerWindowOpen(at('08:02'));
c = await runMeds(at('08:02'));
assert.equal(c.sent, 1);
assert.equal(templates.length, 1);
assert.equal(templates[0].name, 'nudge_med_reminder');
assert.equal(templates[0].lang, 'ml');
assert.deepEqual(templates[0].vars, ['അമ്മ', 'BP ഗുളിക, Thyroid', '8:00 AM']);
assert.deepEqual(templates[0].payloads, [`med:taken:${doseId('0800')}`, `med:later:${doseId('0800')}`]);
assert.equal(buttons.length, 0);
const d = (await dose(doseId("0800")))!;
assert.equal(d.status, 'sent');
assert.ok(d.sentAt);
assert.equal(d.channel, 'template');

// ---- 2. a second tick does not send it again
reset();
c = await runMeds(at('08:03'));
assert.equal(c.sent, 0);
assert.equal(templates.length + buttons.length, 0);

// ---- 3. the parent whose window is open gets free buttons in HER language
await db.doc(`medPlans/p_umma_${sfx}`).set({ ...planBase, patientWaId: umma, patientName: 'अम्मी', ownerLabel: 'Umma', lang: 'hi', meds: [{ name: 'Sugar tablet', times: ['08:00'] }] });
reset();
c = await runMeds(at('08:05'));
assert.equal(c.sent, 1);
assert.equal(templates.length, 0);
assert.equal(buttons.length, 1);
assert.equal(buttons[0].to, umma);
assert.match(buttons[0].body, /अम्मी, दवा लेने का समय हो गया/);
assert.deepEqual(buttons[0].titles, ['ले ली ✅', 'बाद में ⏰']);
assert.deepEqual(buttons[0].ids, [`med:taken:p_umma_${sfx}_2026-11-10_0800`, `med:later:p_umma_${sfx}_2026-11-10_0800`]);

// ---- 4. the Taken tap: recorded, owner told (notifyTaken), a wrong sender is refused, a second tap is harmless
reset();
const wrong = await takeDose(doseId('0800'), '9100000000', at('08:10'));
assert.equal(wrong.ok, false);
const taken = await takeDose(`p_umma_${sfx}_2026-11-10_0800`, umma, at('08:10'));
assert.ok(taken.ok && !taken.already && taken.lang === 'hi');
await new Promise((r) => setTimeout(r, 50));
assert.equal(texts.length, 1);
assert.equal(texts[0].to, ownerWa);
assert.match(texts[0].body, /✅ Umma took Sugar tablet \(8:00 AM\)/);
const again = await takeDose(`p_umma_${sfx}_2026-11-10_0800`, umma, at('08:11'));
assert.ok(again.ok && again.already);
assert.equal(texts.length, 1, 'no second note to the owner');
assert.equal((await dose(`p_umma_${sfx}_2026-11-10_0800`))!.status, 'taken');

// ---- 5. Amma does not answer: one gentle reminder at +30, then the owner is told at +90
reset();
c = await runMeds(at('08:20'));
assert.equal(c.reminded, 0, 'too early');
c = await runMeds(at('08:33'));
assert.equal(c.reminded, 1);
assert.equal(templates.length, 1, 'window still closed: template again');
assert.ok((await dose(doseId('0800')))!.remindedAt);
reset();
c = await runMeds(at('08:50'));
assert.equal(c.reminded, 0, 'only one reminder');
assert.equal(c.missed, 0);
await ownerWindowOpen(at('09:33'));
c = await runMeds(at('09:33'));
assert.equal(c.missed, 1);
assert.equal((await dose(doseId('0800')))!.status, 'missed');
assert.equal(texts.length, 1);
assert.match(texts[0].body, /⚠️ Amma has not confirmed BP ഗുളിക, Thyroid \(due 8:00 AM\)/);
reset();
c = await runMeds(at('09:50'));
assert.equal(c.missed + c.reminded + c.sent, 0, 'nothing more after the alert');

// ---- 6. a late tap still counts and tells the owner it was late
const late = await takeDose(doseId('0800'), amma, at('10:05'));
assert.ok(late.ok && late.name === 'അമ്മ');
await new Promise((r) => setTimeout(r, 50));
assert.match(texts.at(-1)!.body, /confirmed late/);
assert.equal((await dose(doseId('0800')))!.status, 'taken');

// ---- 7. "Later": silent until 30 min pass, then asked again; at most two snoozes
reset();
c = await runMeds(at('21:01'));
assert.equal(c.sent, 1);
const evening = doseId('2100');
const sn = await snoozeDose(evening, amma, at('21:05'));
assert.ok(sn.ok);
reset();
c = await runMeds(at('21:20'));
assert.equal(templates.length + buttons.length, 0, 'snoozed');
c = await runMeds(at('21:36'));
assert.equal(c.reminded, 1);
assert.equal(templates.length, 1);
assert.equal((await dose(evening))!.snoozeUntil, undefined);
await snoozeDose(evening, amma, at('21:40'));
await snoozeDose(evening, amma, at('21:41'));
assert.equal((await dose(evening))!.snoozeCount, 2);
assert.equal((await snoozeDose(evening, '9100000000', at('21:42'))).ok, false);

// ---- 8. open doses and the "taken" reply
const open = await openDosesFor(amma, at('21:45'));
assert.equal(open[0].id, evening, 'newest first');
assert.ok(open.every((x) => x.status !== 'taken'));
assert.ok((await takeDose(evening, amma, at('21:46'))).ok, 'a plain "kazhichu" reply confirms the newest open dose');

// ---- 9. delivery fails: retried each tick, the owner is told after the second failed try
await db.doc(`medPlans/p_fail_${sfx}`).set({ ...planBase, patientWaId: '9197' + sfx.slice(-8), patientName: 'Dad', ownerLabel: 'Dad', lang: 'en', meds: [{ name: 'Statin', times: ['22:00'] }] });
await link('9197' + sfx.slice(-8), 'u_fail_' + sfx, 0, { care: true, lang: 'en' });
reset();
templateOk = false;
await ownerWindowOpen(at('22:03'));
c = await runMeds(at('22:01'));
assert.equal(c.failed, 1);
assert.equal(texts.length, 0);
c = await runMeds(at('22:16'));
assert.equal(c.failed, 1);
assert.equal(texts.length, 1);
assert.match(texts[0].body, /couldn't reach Dad on WhatsApp for Statin/);
c = await runMeds(at('22:31'));
assert.equal(texts.length, 1, 'told once');
templateOk = true;
c = await runMeds(at('22:46'));
assert.equal(c.sent, 1, 'delivered as soon as it can');
assert.ok((await dose(`p_fail_${sfx}_2026-11-10_2200`))!.sentAt);

// ---- 10. templates per patient per day are capped
process.env.NUDGE_MAX_MED_TEMPLATES_PER_DAY = '1';
await db.doc(`medPlans/p_cap_${sfx}`).set({ ...planBase, patientWaId: '9196' + sfx.slice(-8), patientName: 'Cap', ownerLabel: 'Cap', lang: 'en', meds: [{ name: 'A', times: ['11:00'] }, { name: 'B', times: ['12:00'] }] });
await link('9196' + sfx.slice(-8), 'u_cap_' + sfx, 0, { care: true, lang: 'en' });
reset();
c = await runMeds(at('11:01'));
assert.equal(templates.length, 1);
c = await runMeds(at('12:01'));
assert.equal(templates.length, 1, 'the second template of the day is capped');
assert.equal(c.failed, 1);
delete process.env.NUDGE_MAX_MED_TEMPLATES_PER_DAY;

// ---- 11. the owner manages the list from the bot
const added = await addMedication(owner, 'amma', 'Vitamin D', ['9pm', '8:30']);
assert.ok(added.ok);
assert.deepEqual(added.ok && added.med.times, ['08:30', '21:00']);
const merged = await addMedication(owner, 'Amma', 'vitamin d', ['07:00']);
assert.deepEqual(merged.ok && merged.med.times, ['07:00', '08:30', '21:00'], 'same medicine: times merge');
const noone = await addMedication(owner, 'Grandpa', 'X', ['08:00']);
assert.ok(!noone.ok && noone.reason === 'no_person' && noone.names.includes('Amma'));
const notime = await addMedication(owner, 'Amma', 'X', ['whenever']);
assert.ok(!notime.ok && notime.reason === 'no_times');
const gone = await removeMedication(owner, 'Amma', 'vitamin');
assert.ok(gone.ok);
assert.ok(!(await removeMedication(owner, 'Amma', 'nothing like this')).ok);

// ---- 12. /meds status for the owner, in their language
const lines = await statusLines(owner, at('21:50'), 'en', TZ);
assert.equal(lines[0], '*Medicines today* 💊');
assert.ok(lines.includes('*Amma*'));
assert.ok(lines.some((l) => l.startsWith('8:00 AM') && l.includes('✅ taken')), lines.join('|'));
assert.ok(lines.some((l) => l.startsWith('9:00 PM') && l.includes('✅ taken')), lines.join('|'));
assert.equal((await statusLines('nobody', at('21:50'), 'ml', TZ))[0].includes('മരുന്ന്'), true);

// ---- 13. what the parent writes is passed on
reset();
await forwardToOwner(amma, { text: 'തലവേദനയുണ്ട്' }, at('21:51'));
assert.equal(texts.length, 1);
assert.match(texts[0].body, /💬 Amma wrote: "തലവേദനയുണ്ട്"/);
await forwardToOwner(amma, { media: true }, at('21:52'));
assert.match(texts[1].body, /voice note or photo/);

// ---- 14. owner window closed: app push first, then (missed only) the alert template
reset();
await db.doc(`waLinks/${ownerWa}`).update({ lastInboundAt: 0 });
await db.doc(`users/${owner}`).update({ fcmToken: 'tok_owner' });
await forwardToOwner(amma, { text: 'hello' }, at('21:53'));
assert.equal(pushes.length, 1);
assert.equal(texts.length, 0);
await db.doc(`users/${owner}`).update({ fcmToken: '' });
await db.doc(`medPlans/p_late_${sfx}`).set({ ...planBase, patientWaId: umma, patientName: 'अम्मी', ownerLabel: 'Umma', lang: 'hi', meds: [{ name: 'Night tablet', times: ['23:00'] }] });
reset();
await runMeds(at('23:01'));
await runMeds(at('23:34')); // reminder
await runMeds(at('00:32') + min(24 * 60)); // +91 min after 23:01 sent: missed
assert.ok(templates.some((x) => x.name === 'nudge_med_alert'), 'urgent alert falls back to the template');

console.log('test_meds: all passed');
