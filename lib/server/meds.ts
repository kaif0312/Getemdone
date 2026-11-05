// Medicine reminders for family (parents): a WhatsApp message in THEIR language with a one-tap "Taken" button, a gentle second
// nudge, and an alert to the family member who set it up when it is still not confirmed.
//
// Data (Admin SDK only; the client rules deny both collections):
//   medPlans/{planId}  { ownerUid, patientWaId, patientName (how the message addresses them, in their script),
//                        ownerLabel (how the owner calls them), lang, tz, meds:[{name, times:["08:00",...]}], active,
//                        notifyTaken, remindAfterMin, escalateAfterMin, createdAt }
//   medDoses/{planId_date_HHmm}  { planId, patientWaId, ownerUid, date, time, dueAt, meds:[names], lang, status
//                        'sent'|'taken'|'missed', sentAt|null, tries, wamid, channel 'free'|'template', remindedAt,
//                        snoozeUntil, snoozeCount, escalatedAt, takenAt }
//
// Flow, driven by the 15-min cron (app/api/cron/nudge -> runMeds): at a dose time the doc is created once (create-once =
// no double send) and the message goes out. Not confirmed after remindAfterMin (30): one reminder. Still not after
// escalateAfterMin (90): status 'missed' and the owner is told (WhatsApp text inside their 24h window, else app push, else
// the utility template nudge_med_alert). A tap on Taken at any later time still records it and tells the owner it was late.
//
// COST: inside the patient's 24h window the message is a free interactive one (Taken / Later buttons); a tap or any reply
// reopens the window for 24h, so with one tap a day the whole day is free. Window closed = template nudge_med_reminder (in
// their language, English fallback), at most NUDGE_MAX_MED_TEMPLATES_PER_DAY (default 6) per patient per day.
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminMessaging } from './firebaseAdmin';
import { localDate, DEFAULT_TIMEZONE } from './users';
import { addDays, validTime, zonedToMs } from '../bot/format';
import { clock12, langOf, t, type Lang } from '../bot/i18n';
import * as linksMod from '../wa/links';
import * as sendMod from '../wa/send';
import { BUTTON_IDS, type WaLink } from '../wa/types';

export interface MedItem { name: string; times: string[] }
export interface MedPlan {
  id: string;
  ownerUid: string;
  patientWaId: string;
  patientName: string;
  ownerLabel: string;
  lang: Lang;
  tz: string;
  meds: MedItem[];
  active: boolean;
  notifyTaken: boolean;
  remindAfterMin: number;
  escalateAfterMin: number;
  createdAt: number;
}
export type DoseStatus = 'sent' | 'taken' | 'missed';
export interface MedDose {
  id: string;
  planId: string;
  patientWaId: string;
  ownerUid: string;
  date: string;
  time: string;
  dueAt: number;
  meds: string[];
  lang: Lang;
  status: DoseStatus;
  sentAt: number | null;
  tries: number;
  wamid?: string;
  channel?: 'free' | 'template';
  remindedAt?: number;
  snoozeUntil?: number;
  snoozeCount?: number;
  escalatedAt?: number;
  takenAt?: number;
  unreachableTold?: boolean;
}

/** A due time is still sent for this long after it (the cron was late or down); after that the dose is skipped. */
const SEND_WINDOW_MS = 3 * 3_600_000;
/** Follow-ups (reminder, missed alert) are tracked this long after the due time. */
const TRACK_MS = 8 * 3_600_000;
const MAX_TRIES = 6;
export const SNOOZE_MIN = 30;
const MAX_SNOOZES = 2;

export function maxMedTemplatesPerDay(): number {
  const raw = process.env.NUDGE_MAX_MED_TEMPLATES_PER_DAY;
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : 6;
}

/** Injectable collaborators so tests can fake the network. */
export const deps = {
  getLink: (wa: string) => linksMod.getLink(wa),
  getLinkByUid: (uid: string) => linksMod.getLinkByUid(uid),
  windowOpen: (last: number, now?: number) => sendMod.windowOpen(last, now),
  sendButtons: (to: string, body: string, buttons: { id: string; title: string }[]) => sendMod.sendButtons(to, body, buttons),
  sendText: (to: string, body: string) => sendMod.sendText(to, body),
  sendTemplateLang: (to: string, name: string, vars: string[], lang: string, opts?: { buttonPayloads?: string[] }) =>
    sendMod.sendTemplateLang(to, name, vars, lang, opts),
  sendPush: async (token: string, title: string, body: string): Promise<boolean> => {
    try {
      await adminMessaging().send({ token, notification: { title, body }, data: { type: 'med', title, body, url: '/' } });
      return true;
    } catch (e) {
      console.error('[meds] push failed', (e as Error).message);
      return false;
    }
  },
};

const plansCol = () => adminDb().collection('medPlans');
const dosesCol = () => adminDb().collection('medDoses');

// ---------- pure helpers ----------

export const joinNames = (names: string[]) => names.join(', ');
export const doseIdOf = (planId: string, date: string, time: string) => `${planId}_${date}_${time.replace(':', '')}`;

/** Normalise "8am", "8:30 pm", "20:00" -> "HH:mm" (null if not a time). */
export function parseTime(s: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = +m[1];
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return validTime(`${h}:${m[2] ?? '00'}`) ?? null;
}

export interface DoseGroup { date: string; time: string; dueAt: number; names: string[] }

/** Every dose time of the plan that has come due on today's or yesterday's local date (yesterday: a 23:30 dose is still
 *  being followed up after midnight). Groups medicines sharing a time into one message. */
export function groupsFor(plan: Pick<MedPlan, 'meds' | 'tz'>, now: number, includeFuture = false): DoseGroup[] {
  const today = localDate(plan.tz, now);
  const out = new Map<string, DoseGroup>();
  for (const date of [addDays(today, -1), today]) {
    for (const med of plan.meds) {
      for (const time of med.times) {
        const dueAt = zonedToMs(`${date}T${time}`, plan.tz);
        if (dueAt == null) continue;
        if (!includeFuture && (dueAt > now || now - dueAt > TRACK_MS)) continue;
        const key = `${date}_${time}`;
        const g = out.get(key) ?? { date, time, dueAt, names: [] };
        if (!g.names.includes(med.name)) g.names.push(med.name);
        out.set(key, g);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.dueAt - b.dueAt);
}

const toPlan = (id: string, d: FirebaseFirestore.DocumentData): MedPlan => ({ id, ...(d as Omit<MedPlan, 'id'>) });
const toDose = (id: string, d: FirebaseFirestore.DocumentData): MedDose => ({ id, ...(d as Omit<MedDose, 'id'>) });

// ---------- sending ----------

async function templatesToday(waId: string, day: string): Promise<number> {
  const s = await adminDb().doc(`waReminderCaps/med_${waId}_${day}`).get();
  return (s.data()?.templates as number | undefined) ?? 0;
}
async function bumpTemplates(waId: string, day: string, by: 1 | -1): Promise<void> {
  await adminDb().doc(`waReminderCaps/med_${waId}_${day}`).set({ templates: FieldValue.increment(by), updatedAt: Date.now() }, { merge: true });
}

/** Send (or re-send) the medicine message. Returns how it went out, or why not. */
export async function sendDose(plan: MedPlan, dose: MedDose, kind: 'first' | 'reminder', now: number): Promise<{ wamid: string; channel: 'free' | 'template' } | 'capped' | 'failed'> {
  const lang = dose.lang;
  const meds = joinNames(dose.meds);
  const link = await deps.getLink(plan.patientWaId);
  if (link && deps.windowOpen(link.lastInboundAt, now)) {
    const body = t(lang, kind === 'first' ? 'medDue' : 'medRemind', { name: plan.patientName, meds });
    const id = await deps.sendButtons(plan.patientWaId, body, [
      { id: BUTTON_IDS.medTaken(dose.id), title: t(lang, 'btnTaken') },
      { id: BUTTON_IDS.medLater(dose.id), title: t(lang, 'btnLater') },
    ]);
    if (id) return { wamid: id, channel: 'free' };
    // The window was closed in Meta's view after all: fall through to the template.
  }
  const day = localDate(plan.tz, now);
  if ((await templatesToday(plan.patientWaId, day)) >= maxMedTemplatesPerDay()) return 'capped';
  await bumpTemplates(plan.patientWaId, day, 1);
  const id = await deps.sendTemplateLang(plan.patientWaId, 'nudge_med_reminder', [plan.patientName, meds, clock12(dose.time)], lang, {
    buttonPayloads: [BUTTON_IDS.medTaken(dose.id), BUTTON_IDS.medLater(dose.id)],
  });
  if (!id) {
    await bumpTemplates(plan.patientWaId, day, -1);
    return 'failed';
  }
  return { wamid: id, channel: 'template' };
}

/** Tell the family member (owner). Free text inside their window, else app push, else (urgent only) the alert template. */
export async function notifyOwner(plan: MedPlan, text: string, now: number, alert?: { meds: string; time: string }): Promise<boolean> {
  const link: WaLink | null = await deps.getLinkByUid(plan.ownerUid);
  if (link && !link.muted && deps.windowOpen(link.lastInboundAt, now) && (await deps.sendText(link.waId, text))) return true;
  const u = (await adminDb().doc(`users/${plan.ownerUid}`).get()).data() as { fcmToken?: string } | undefined;
  if (u?.fcmToken && (await deps.sendPush(u.fcmToken, '💊 Nudge', text))) return true;
  if (alert && link && !link.muted) {
    return !!(await deps.sendTemplateLang(link.waId, 'nudge_med_alert', [plan.ownerLabel, alert.meds, clock12(alert.time)], langOf(link)));
  }
  return false;
}

const ownerLang = async (plan: MedPlan): Promise<Lang> => langOf(await deps.getLinkByUid(plan.ownerUid));

// ---------- the cron ----------

export interface MedCounts { plans: number; sent: number; reminded: number; missed: number; failed: number; skipped: number }

async function advance(plan: MedPlan, dose: MedDose, now: number, counts: MedCounts): Promise<void> {
  const ref = dosesCol().doc(dose.id);
  if (dose.status === 'taken') return;

  // Not delivered yet (first attempt, or the earlier ones failed).
  if (!dose.sentAt) {
    if (dose.tries >= MAX_TRIES || now > dose.dueAt + SEND_WINDOW_MS) { counts.skipped++; return; }
    const r = await sendDose(plan, dose, 'first', now);
    if (typeof r === 'object') {
      await ref.update({ sentAt: now, wamid: r.wamid, channel: r.channel, tries: dose.tries + 1 });
      counts.sent++;
    } else {
      counts.failed++;
      const upd: Record<string, unknown> = { tries: dose.tries + 1 };
      if (dose.tries + 1 >= 2 && !dose.unreachableTold) {
        upd.unreachableTold = true;
        const lang = await ownerLang(plan);
        await notifyOwner(plan, t(lang, 'ownUnreachable', { name: plan.ownerLabel, meds: joinNames(dose.meds), time: clock12(dose.time) }), now);
      }
      await ref.update(upd);
    }
    return;
  }
  if (dose.status === 'missed') return;

  // "Later": ask again once the snooze is over.
  if (dose.snoozeUntil) {
    if (now >= dose.snoozeUntil) {
      const r = await sendDose(plan, dose, 'reminder', now);
      if (typeof r === 'object') {
        await ref.update({ snoozeUntil: FieldValue.delete(), remindedAt: now, wamid: r.wamid });
        counts.reminded++;
      }
    }
    return;
  }
  // One gentle reminder.
  if (!dose.remindedAt && now >= dose.sentAt + plan.remindAfterMin * 60_000) {
    const r = await sendDose(plan, dose, 'reminder', now);
    await ref.update({ remindedAt: now, ...(typeof r === 'object' ? { wamid: r.wamid } : {}) });
    if (typeof r === 'object') counts.reminded++;
    return;
  }
  // Still nothing: tell the family member.
  if (!dose.escalatedAt && now >= dose.sentAt + plan.escalateAfterMin * 60_000) {
    await ref.update({ status: 'missed', escalatedAt: now });
    const lang = await ownerLang(plan);
    const meds = joinNames(dose.meds);
    await notifyOwner(plan, t(lang, 'ownMissed', { name: plan.ownerLabel, meds, time: clock12(dose.time) }), now, { meds, time: dose.time });
    counts.missed++;
  }
}

export async function runMeds(now: number): Promise<MedCounts> {
  const counts: MedCounts = { plans: 0, sent: 0, reminded: 0, missed: 0, failed: 0, skipped: 0 };
  const snap = await plansCol().where('active', '==', true).get();
  for (const doc of snap.docs) {
    const plan = toPlan(doc.id, doc.data());
    counts.plans++;
    try {
      for (const g of groupsFor(plan, now)) {
        const id = doseIdOf(plan.id, g.date, g.time);
        const ref = dosesCol().doc(id);
        const cur = await ref.get();
        let dose: MedDose;
        if (cur.exists) dose = toDose(id, cur.data()!);
        else {
          if (now > g.dueAt + SEND_WINDOW_MS) continue;
          const base: Omit<MedDose, 'id'> = {
            planId: plan.id, patientWaId: plan.patientWaId, ownerUid: plan.ownerUid, date: g.date, time: g.time, dueAt: g.dueAt,
            meds: g.names, lang: plan.lang, status: 'sent', sentAt: null, tries: 0,
          };
          try { await ref.create(base); } catch { continue; } // another tick claimed it
          dose = { id, ...base };
        }
        await advance(plan, dose, now, counts);
      }
    } catch (e) {
      console.error('[meds] plan failed', plan.id, e);
    }
  }
  return counts;
}

// ---------- taps and replies from the patient ----------

/** Doses of this patient that were sent and are not confirmed (newest first): what a "taken" tap or reply refers to. */
export async function openDosesFor(waId: string, now: number): Promise<MedDose[]> {
  const plans = (await plansCol().where('patientWaId', '==', waId).get()).docs.map((d) => toPlan(d.id, d.data())).filter((p) => p.active);
  const refs = plans.flatMap((p) => groupsFor(p, now).map((g) => dosesCol().doc(doseIdOf(p.id, g.date, g.time))));
  if (!refs.length) return [];
  const snaps = await adminDb().getAll(...refs);
  return snaps.filter((s) => s.exists).map((s) => toDose(s.id, s.data()!))
    .filter((d) => d.sentAt && (d.status === 'sent' || d.status === 'missed'))
    .sort((a, b) => b.dueAt - a.dueAt);
}

export type TakeResult = { ok: true; name: string; lang: Lang; already: boolean } | { ok: false };

/** The patient confirms. Records it, tells the family member (always when late, else when notifyTaken). */
export async function takeDose(doseId: string, waId: string, now: number): Promise<TakeResult> {
  const ref = dosesCol().doc(doseId);
  const r = await adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const d = toDose(s.id, s.data()!);
    if (d.patientWaId !== waId) return null;
    if (d.status === 'taken') return { d, already: true, late: false };
    tx.update(ref, { status: 'taken', takenAt: now, snoozeUntil: FieldValue.delete() });
    return { d, already: false, late: d.status === 'missed' };
  });
  if (!r) return { ok: false };
  const plan = (await plansCol().doc(r.d.planId).get()).data() as Omit<MedPlan, 'id'> | undefined;
  if (!plan) return { ok: false };
  const p = toPlan(r.d.planId, plan);
  if (!r.already && (r.late || p.notifyTaken)) {
    const lang = await ownerLang(p);
    const text = t(lang, r.late ? 'ownTakenLate' : 'ownTaken', { name: p.ownerLabel, meds: joinNames(r.d.meds), time: clock12(r.d.time) });
    notifyOwner(p, text, now).catch((e) => console.error('[meds] owner notice failed', e));
  }
  return { ok: true, name: p.patientName, lang: r.d.lang, already: r.already };
}

/** "Later": ask again in SNOOZE_MIN minutes (at most twice per dose). */
export async function snoozeDose(doseId: string, waId: string, now: number): Promise<{ ok: boolean; lang: Lang }> {
  const ref = dosesCol().doc(doseId);
  return adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return { ok: false, lang: 'en' as Lang };
    const d = toDose(s.id, s.data()!);
    if (d.patientWaId !== waId || d.status !== 'sent') return { ok: false, lang: d.lang };
    if ((d.snoozeCount ?? 0) >= MAX_SNOOZES) return { ok: true, lang: d.lang }; // no further snooze; the normal follow-up continues
    tx.update(ref, { snoozeUntil: now + SNOOZE_MIN * 60_000, snoozeCount: (d.snoozeCount ?? 0) + 1 });
    return { ok: true, lang: d.lang };
  });
}

/** What the patient wrote that is not a confirmation: pass it to the family member. */
export async function forwardToOwner(waId: string, what: { text?: string; media?: boolean }, now: number): Promise<void> {
  const plans = (await plansCol().where('patientWaId', '==', waId).get()).docs.map((d) => toPlan(d.id, d.data())).filter((p) => p.active);
  for (const p of plans) {
    const lang = await ownerLang(p);
    const text = what.media
      ? t(lang, 'ownMedia', { name: p.ownerLabel })
      : t(lang, 'ownNote', { name: p.ownerLabel, text: (what.text ?? '').slice(0, 500) });
    await notifyOwner(p, text, now);
  }
}

// ---------- the family member's side (bot commands / tools) ----------

export async function plansOf(ownerUid: string): Promise<MedPlan[]> {
  const q = await plansCol().where('ownerUid', '==', ownerUid).get();
  return q.docs.map((d) => toPlan(d.id, d.data())).filter((p) => p.active);
}

function findPlan(plans: MedPlan[], person?: string): MedPlan | null {
  if (!person) return plans.length === 1 ? plans[0] : null;
  const q = person.trim().toLowerCase();
  return plans.find((p) => p.ownerLabel.toLowerCase() === q || p.patientName.toLowerCase() === q)
    ?? plans.find((p) => p.ownerLabel.toLowerCase().includes(q) || q.includes(p.ownerLabel.toLowerCase()))
    ?? null;
}

export type EditResult =
  | { ok: true; plan: MedPlan; med: MedItem }
  | { ok: false; reason: 'no_person' | 'no_med' | 'no_times'; names: string[] };

/** Add a medicine (or more times for an existing one) to someone who is already set up. */
export async function addMedication(ownerUid: string, person: string | undefined, medName: string, times: string[]): Promise<EditResult> {
  const plans = await plansOf(ownerUid);
  const names = plans.map((p) => p.ownerLabel);
  const plan = findPlan(plans, person);
  if (!plan) return { ok: false, reason: 'no_person', names };
  const ts = [...new Set(times.map((x) => parseTime(String(x))).filter((x): x is string => !!x))].sort();
  if (!ts.length) return { ok: false, reason: 'no_times', names };
  const name = medName.trim().slice(0, 60);
  const meds = [...plan.meds];
  const i = meds.findIndex((m) => m.name.toLowerCase() === name.toLowerCase());
  const med: MedItem = i >= 0 ? { name: meds[i].name, times: [...new Set([...meds[i].times, ...ts])].sort() } : { name, times: ts };
  if (i >= 0) meds[i] = med; else meds.push(med);
  await plansCol().doc(plan.id).update({ meds });
  return { ok: true, plan: { ...plan, meds }, med };
}

export async function removeMedication(ownerUid: string, person: string | undefined, medName: string): Promise<EditResult> {
  const plans = await plansOf(ownerUid);
  const names = plans.map((p) => p.ownerLabel);
  const plan = findPlan(plans, person);
  if (!plan) return { ok: false, reason: 'no_person', names };
  const q = medName.trim().toLowerCase();
  const med = plan.meds.find((m) => m.name.toLowerCase() === q) ?? plan.meds.find((m) => m.name.toLowerCase().includes(q));
  if (!med) return { ok: false, reason: 'no_med', names };
  const meds = plan.meds.filter((m) => m !== med);
  await plansCol().doc(plan.id).update({ meds, ...(meds.length ? {} : { active: false }) });
  return { ok: true, plan: { ...plan, meds }, med };
}

/** "/meds": today's doses for everyone the owner looks after, with their state. */
export async function statusLines(ownerUid: string, now: number, lang: Lang, tz: string): Promise<string[]> {
  const plans = await plansOf(ownerUid);
  if (!plans.length) return [t(lang, 'medsNone')];
  const lines = [t(lang, 'medsHead')];
  for (const p of plans) {
    const today = localDate(p.tz || tz || DEFAULT_TIMEZONE, now);
    const groups = groupsFor(p, now, true).filter((g) => g.date === today);
    const snaps = groups.length ? await adminDb().getAll(...groups.map((g) => dosesCol().doc(doseIdOf(p.id, g.date, g.time)))) : [];
    lines.push(`*${p.ownerLabel}*`);
    groups.forEach((g, i) => {
      const d = snaps[i].exists ? toDose(snaps[i].id, snaps[i].data()!) : null;
      const at = d?.takenAt ? clock12(new Intl.DateTimeFormat('en-GB', { timeZone: p.tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d.takenAt))) : '';
      const state = d?.status === 'taken' ? t(lang, 'medsTaken', { at })
        : d?.status === 'missed' ? t(lang, 'medsMissed')
        : d?.sentAt ? t(lang, 'medsWaiting')
        : t(lang, 'medsLater');
      lines.push(`${clock12(g.time)} ${joinNames(g.names)}: ${state}`);
    });
    if (!groups.length) lines.push('-');
  }
  return lines;
}
