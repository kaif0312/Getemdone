// Routines: things the user does on a schedule ("take isabgol at night", "stretch", "water the plants"). One generic feature,
// set up from the app (RoutinesSheet) or from WhatsApp ("remind me to take isabgol every night at 10"). At the routine's
// time a WhatsApp message with a one-tap Done / Skip today button goes out; a tap records the day.
//
// Data:
//   routines/{id}     { uid, title, time "HH:mm" (the user's local clock), days number[] (0=Sun..6=Sat; [] = every day),
//                       active, createdAt }                          client-writable by the owner (firestore.rules)
//   routineLogs/{routineId_yyyy-mm-dd}  { routineId, uid, date, title, time, dueAt, status 'sent'|'done'|'skipped',
//                       sentAt|null, tries, wamid, channel 'free'|'template'|'push', remindedAt, doneAt, skippedAt }
//                                                                     the server creates it when it sends; the app may also set
//                                                                     status 'done' (rules validate the shape)
//
// Flow (15-min cron, app/api/cron/nudge -> runRoutines): at the due time the day's log is created once (create-once = no
// double send) and the message goes out. Not answered after REMIND_AFTER_MIN: one gentle second message, only when it is
// free (the 24h window is open) or by app push; never a second paid template. A tap on Done at any later time still counts.
//
// COST: inside the 24h window the message is a free interactive one. Window closed = template nudge_routine (utility), at
// most NUDGE_MAX_ROUTINE_TEMPLATES_PER_USER_DAY (default 3) per person per local day, then dropped (never an unplanned paid
// message). A tap reopens the window, so with one tap a day most days are free.
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminMessaging } from './firebaseAdmin';
import { localDate, DEFAULT_TIMEZONE } from './users';
import { addDays, validTime, zonedToMs } from '../bot/format';
import * as linksMod from '../wa/links';
import * as sendMod from '../wa/send';
import { BUTTON_IDS, type WaLink } from '../wa/types';

export interface Routine {
  id: string;
  uid: string;
  title: string;
  time: string;
  days: number[];
  active: boolean;
  createdAt: number;
}
export type RoutineStatus = 'sent' | 'done' | 'skipped';
export interface RoutineLog {
  id: string;
  routineId: string;
  uid: string;
  date: string;
  title: string;
  time: string;
  dueAt: number;
  status: RoutineStatus;
  sentAt: number | null;
  tries: number;
  wamid?: string;
  channel?: 'free' | 'template' | 'push';
  remindedAt?: number;
  doneAt?: number;
  skippedAt?: number;
}

/** A due time is still sent for this long after it (the cron was late or down); after that the day is skipped. */
const SEND_WINDOW_MS = 2 * 3_600_000;
const MAX_TRIES = 4;
export const REMIND_AFTER_MIN = 45;
/** The follow-up is only tried this long after the first send. */
const REMIND_UNTIL_MS = 4 * 3_600_000;
export const MAX_ROUTINES_PER_USER = 20;

export function maxRoutineTemplatesPerUserDay(): number {
  const raw = process.env.NUDGE_MAX_ROUTINE_TEMPLATES_PER_USER_DAY;
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : 3;
}

/** Injectable collaborators so tests can fake the network. */
export const deps = {
  getLinkByUid: (uid: string) => linksMod.getLinkByUid(uid),
  windowOpen: (last: number, now?: number) => sendMod.windowOpen(last, now),
  sendButtons: (to: string, body: string, buttons: { id: string; title: string }[]) => sendMod.sendButtons(to, body, buttons),
  sendTemplateLang: (to: string, name: string, vars: string[], lang: string, opts?: { buttonPayloads?: string[] }) =>
    sendMod.sendTemplateLang(to, name, vars, lang, opts),
  sendPush: async (token: string, title: string, body: string): Promise<boolean> => {
    try {
      await adminMessaging().send({ token, notification: { title, body }, data: { type: 'routine', title, body, url: '/' } });
      return true;
    } catch (e) {
      console.error('[routines] push failed', (e as Error).message);
      return false;
    }
  },
};

const routinesCol = () => adminDb().collection('routines');
const logsCol = () => adminDb().collection('routineLogs');

// ---------- pure helpers ----------

export const logIdOf = (routineId: string, date: string) => `${routineId}_${date}`;

/** Normalise "10pm", "9:30 am", "22:00" -> "HH:mm" (null if not a time). */
export function parseTime(s: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(String(s).trim());
  if (!m) return null;
  let h = +m[1];
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return validTime(`${h}:${m[2] ?? '00'}`) ?? null;
}

const DAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** "daily" / "weekdays" / "mon, wed" / [1,3] -> sorted unique weekday numbers; [] = every day. */
export function parseDays(v: unknown): number[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : [];
  const out = new Set<number>();
  for (const x of raw) {
    if (typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 6) { out.add(x); continue; }
    const s = String(x).toLowerCase().trim();
    if (/^[0-6]$/.test(s)) { out.add(+s); continue; }
    if (s === 'weekdays' || s === 'weekday') [1, 2, 3, 4, 5].forEach((d) => out.add(d));
    else if (s === 'weekends' || s === 'weekend') [0, 6].forEach((d) => out.add(d));
    else { const i = DAY_NAMES.indexOf(s.slice(0, 3)); if (i >= 0 && /^[a-z]+$/.test(s)) out.add(i); }
  }
  return out.size === 7 ? [] : [...out].sort();
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export const runsOn = (r: Pick<Routine, 'days'>, date: string) => !r.days.length || r.days.includes(weekdayOf(date));

export function daysLabel(days: number[]): string {
  if (!days.length) return 'every day';
  const key = days.join(',');
  if (key === '1,2,3,4,5') return 'weekdays';
  if (key === '0,6') return 'weekends';
  return days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
}

export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

const toRoutine = (id: string, d: FirebaseFirestore.DocumentData): Routine => ({
  id,
  uid: String(d.uid ?? ''),
  title: String(d.title ?? ''),
  time: String(d.time ?? ''),
  days: Array.isArray(d.days) ? d.days.filter((x: unknown) => typeof x === 'number') : [],
  active: d.active !== false,
  createdAt: Number(d.createdAt ?? 0),
});
const toLog = (id: string, d: FirebaseFirestore.DocumentData): RoutineLog => ({ id, ...(d as Omit<RoutineLog, 'id'>) });

// ---------- sending ----------

async function templatesToday(waId: string, day: string): Promise<number> {
  const s = await adminDb().doc(`waReminderCaps/routine_${waId}_${day}`).get();
  return (s.data()?.templates as number | undefined) ?? 0;
}
async function bumpTemplates(waId: string, day: string, by: 1 | -1): Promise<void> {
  await adminDb().doc(`waReminderCaps/routine_${waId}_${day}`).set({ templates: FieldValue.increment(by), updatedAt: Date.now() }, { merge: true });
}

interface Who { link: WaLink | null; fcmToken?: string; tz: string; channel: string }

async function whoIs(uid: string): Promise<Who> {
  const [link, snap] = await Promise.all([deps.getLinkByUid(uid), adminDb().doc(`users/${uid}`).get()]);
  const u = (snap.data() ?? {}) as { fcmToken?: string; timezone?: string; reminderChannel?: string };
  return {
    link: link && !link.muted && !link.care ? link : null,
    fcmToken: typeof u.fcmToken === 'string' && u.fcmToken ? u.fcmToken : undefined,
    tz: link?.timezone || u.timezone || DEFAULT_TIMEZONE,
    channel: u.reminderChannel ?? 'auto',
  };
}

type Sent = { wamid: string; channel: 'free' | 'template' | 'push' } | 'capped' | 'failed' | 'no_channel';

/** Send (or re-send) the routine message. WhatsApp first (the Done button lives there); push when the user chose "app"
 *  or has no WhatsApp. `again` = the follow-up: never a paid template. */
export async function sendRoutine(log: RoutineLog, who: Who, now: number, again = false): Promise<Sent> {
  const wantWa = !!who.link && who.channel !== 'app';
  const wantPush = !!who.fcmToken && (who.channel === 'app' || who.channel === 'both' || !wantWa);
  if (wantWa) {
    const link = who.link!;
    if (deps.windowOpen(link.lastInboundAt, now)) {
      const body = again ? `Still pending: ${log.title} (${clock12(log.time)}). Done?` : `⏰ ${log.title}\n${clock12(log.time)}. Tap when it is done.`;
      const id = await deps.sendButtons(link.waId, body, [
        { id: BUTTON_IDS.routineDone(log.id), title: 'Done ✅' },
        { id: BUTTON_IDS.routineSkip(log.id), title: 'Skip today' },
      ]);
      if (id) return { wamid: id, channel: 'free' };
      // The window was closed in Meta's view after all: fall through to the template.
    }
    if (!again) {
      const day = localDate(who.tz, now);
      if ((await templatesToday(link.waId, day)) < maxRoutineTemplatesPerUserDay()) {
        await bumpTemplates(link.waId, day, 1);
        const id = await deps.sendTemplateLang(link.waId, 'nudge_routine', [log.title, clock12(log.time)], 'en', {
          buttonPayloads: [BUTTON_IDS.routineDone(log.id), BUTTON_IDS.routineSkip(log.id)],
        });
        if (id) return { wamid: id, channel: 'template' };
        await bumpTemplates(link.waId, day, -1);
        if (!wantPush) return 'failed';
      } else if (!wantPush) return 'capped';
    }
  }
  if (wantPush && who.fcmToken) {
    const ok = await deps.sendPush(who.fcmToken, `⏰ ${log.title}`, `${clock12(log.time)}. Open Nudge to mark it done.`);
    if (ok) return { wamid: '', channel: 'push' };
    return 'failed';
  }
  return wantWa ? 'failed' : 'no_channel';
}

// ---------- the cron ----------

export interface RoutineCounts { routines: number; sent: number; reminded: number; failed: number; skipped: number }

export async function runRoutines(now: number): Promise<RoutineCounts> {
  const counts: RoutineCounts = { routines: 0, sent: 0, reminded: 0, failed: 0, skipped: 0 };
  const snap = await routinesCol().where('active', '==', true).get();
  const whoCache = new Map<string, Who>();
  for (const doc of snap.docs) {
    const r = toRoutine(doc.id, doc.data());
    if (!r.uid || !r.title || !validTime(r.time)) continue;
    counts.routines++;
    try {
      let who = whoCache.get(r.uid);
      if (!who) { who = await whoIs(r.uid); whoCache.set(r.uid, who); }
      const today = localDate(who.tz, now);
      for (const date of [addDays(today, -1), today]) {
        if (!runsOn(r, date)) continue;
        const dueAt = zonedToMs(`${date}T${r.time}`, who.tz);
        if (dueAt == null || dueAt > now || now - dueAt > SEND_WINDOW_MS + REMIND_UNTIL_MS) continue;
        const id = logIdOf(r.id, date);
        const ref = logsCol().doc(id);
        const cur = await ref.get();
        let log: RoutineLog;
        if (cur.exists) log = toLog(id, cur.data()!);
        else {
          if (now > dueAt + SEND_WINDOW_MS) continue;
          const base: Omit<RoutineLog, 'id'> = {
            routineId: r.id, uid: r.uid, date, title: r.title, time: r.time, dueAt, status: 'sent', sentAt: null, tries: 0,
          };
          try { await ref.create(base); } catch { continue; } // another tick claimed it
          log = { id, ...base };
        }
        await advance(log, who, now, counts);
      }
    } catch (e) {
      console.error('[routines] failed', r.id, e);
    }
  }
  return counts;
}

async function advance(log: RoutineLog, who: Who, now: number, counts: RoutineCounts): Promise<void> {
  if (log.status !== 'sent') return; // done or skipped (maybe from the app before the message went out)
  const ref = logsCol().doc(log.id);
  if (!log.sentAt) {
    if (log.tries >= MAX_TRIES || now > log.dueAt + SEND_WINDOW_MS) { counts.skipped++; return; }
    const r = await sendRoutine(log, who, now);
    if (typeof r === 'object') {
      await ref.update({ sentAt: now, wamid: r.wamid, channel: r.channel, tries: log.tries + 1 });
      counts.sent++;
    } else {
      await ref.update({ tries: log.tries + 1 });
      if (r === 'capped' || r === 'no_channel') counts.skipped++; else counts.failed++;
    }
    return;
  }
  if (!log.remindedAt && now >= log.sentAt + REMIND_AFTER_MIN * 60_000 && now < log.sentAt + REMIND_UNTIL_MS) {
    const r = await sendRoutine(log, who, now, true);
    await ref.update({ remindedAt: now });
    if (typeof r === 'object') counts.reminded++;
  }
}

// ---------- taps and the app ----------

export type TapResult = { ok: true; title: string; already: boolean; streak: number } | { ok: false };

/** The user taps Done or Skip (WhatsApp button, or the app). Only the owner's own log can be changed. */
export async function setLogStatus(logId: string, uid: string, status: 'done' | 'skipped', now: number): Promise<TapResult> {
  const ref = logsCol().doc(logId);
  const r = await adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const l = toLog(s.id, s.data()!);
    if (l.uid !== uid) return null;
    if (l.status === status) return { l, already: true };
    tx.update(ref, status === 'done' ? { status, doneAt: now } : { status, skippedAt: now });
    return { l, already: false };
  });
  if (!r) return { ok: false };
  return { ok: true, title: r.l.title, already: r.already, streak: status === 'done' ? await streakOf(r.l.routineId, r.l.date) : 0 };
}

/** The log a bare "done" / thumbs-up reply refers to: the user's newest unanswered one. */
export async function openLogFor(uid: string, now: number, tz: string): Promise<RoutineLog | null> {
  const today = localDate(tz, now);
  const logs = await Promise.all([today, addDays(today, -1)].map((d) => logsCol().where('uid', '==', uid).where('date', '==', d).get()));
  const open = logs.flatMap((q) => q.docs.map((d) => toLog(d.id, d.data()))).filter((l) => l.status === 'sent' && l.sentAt);
  return open.sort((a, b) => b.dueAt - a.dueAt)[0] ?? null;
}

/** Consecutive days (ending at `date`, or yesterday if `date` is not done yet) on which the routine was done. Days it does
 *  not run on neither count nor break the streak. Reads at most 60 log docs, by id (no index). */
export async function streakOf(routineId: string, date: string, routine?: Pick<Routine, 'days'>): Promise<number> {
  const dates = Array.from({ length: 60 }, (_, i) => addDays(date, -i));
  const days = routine?.days ?? toRoutine(routineId, (await routinesCol().doc(routineId).get()).data() ?? {}).days;
  const snaps = await adminDb().getAll(...dates.map((d) => logsCol().doc(logIdOf(routineId, d))));
  let n = 0;
  for (let i = 0; i < dates.length; i++) {
    if (!runsOn({ days }, dates[i])) continue;
    const s = snaps[i];
    const done = s.exists && s.data()?.status === 'done';
    if (done) n++;
    else if (i === 0) continue; // today not done yet: the streak so far stands
    else break;
  }
  return n;
}

// ---------- the user's side (bot tools, scripts) ----------

export async function listRoutines(uid: string): Promise<Routine[]> {
  const q = await routinesCol().where('uid', '==', uid).get();
  return q.docs.map((d) => toRoutine(d.id, d.data())).filter((r) => r.active).sort((a, b) => a.time.localeCompare(b.time));
}

export type RoutineEdit =
  | { ok: true; routine: Routine; created?: boolean }
  | { ok: false; reason: 'no_title' | 'bad_time' | 'too_many' | 'not_found' | 'ambiguous'; names?: string[] };

const normTitle = (s: string) => s.trim().replace(/\s+/g, ' ').slice(0, 60);

/** Create a routine, or (same title) change the time / days of the existing one. */
export async function upsertRoutine(uid: string, a: { title: string; time: string; days?: unknown }): Promise<RoutineEdit> {
  const title = normTitle(a.title ?? '');
  if (!title) return { ok: false, reason: 'no_title' };
  const time = parseTime(a.time ?? '');
  if (!time) return { ok: false, reason: 'bad_time' };
  const days = parseDays(a.days);
  const all = await listRoutines(uid);
  const same = all.find((r) => r.title.toLowerCase() === title.toLowerCase());
  if (same) {
    await routinesCol().doc(same.id).update({ time, days });
    return { ok: true, routine: { ...same, time, days } };
  }
  if (all.length >= MAX_ROUTINES_PER_USER) return { ok: false, reason: 'too_many' };
  const ref = routinesCol().doc();
  const routine: Routine = { id: ref.id, uid, title, time, days, active: true, createdAt: Date.now() };
  const { id: _id, ...data } = routine;
  await ref.set(data);
  return { ok: true, routine, created: true };
}

export function findRoutine(all: Routine[], q: string): { hit: Routine } | { names: string[]; none: boolean } {
  const s = q.trim().toLowerCase();
  if (!s && all.length === 1) return { hit: all[0] };
  const exact = all.find((r) => r.title.toLowerCase() === s);
  if (exact) return { hit: exact };
  const part = all.filter((r) => s && (r.title.toLowerCase().includes(s) || s.includes(r.title.toLowerCase())));
  if (part.length === 1) return { hit: part[0] };
  return { names: (part.length ? part : all).map((r) => r.title), none: !part.length && !all.length };
}

export async function updateRoutine(uid: string, ref: string, patch: { time?: string; days?: unknown; pause?: boolean }): Promise<RoutineEdit> {
  const all = await listRoutines(uid);
  const f = findRoutine(all, ref);
  if (!('hit' in f)) return { ok: false, reason: f.none ? 'not_found' : 'ambiguous', names: f.names };
  const upd: Record<string, unknown> = {};
  if (patch.time !== undefined) {
    const t = parseTime(patch.time);
    if (!t) return { ok: false, reason: 'bad_time' };
    upd.time = t;
  }
  if (patch.days !== undefined) upd.days = parseDays(patch.days);
  if (patch.pause) upd.active = false;
  if (Object.keys(upd).length) await routinesCol().doc(f.hit.id).update(upd);
  return { ok: true, routine: { ...f.hit, ...(upd as Partial<Routine>) } };
}

export async function removeRoutine(uid: string, ref: string): Promise<RoutineEdit> {
  return updateRoutine(uid, ref, { pause: true });
}

/** "/routines": each routine with when it runs, today's state and the streak. */
export async function statusLines(uid: string, now: number, tz: string): Promise<string[]> {
  const all = await listRoutines(uid);
  if (!all.length) return [];
  const today = localDate(tz, now);
  const snaps = await adminDb().getAll(...all.map((r) => logsCol().doc(logIdOf(r.id, today))));
  const streaks = await Promise.all(all.map((r) => streakOf(r.id, today, r)));
  return all.map((r, i) => {
    const st = snaps[i].exists ? (snaps[i].data()?.status as RoutineStatus) : null;
    const state = !runsOn(r, today) ? 'not today' : st === 'done' ? 'done ✅' : st === 'skipped' ? 'skipped' : st === 'sent' ? 'waiting for you' : 'later';
    return `*${r.title}* · ${clock12(r.time)} · ${daysLabel(r.days)}\n${state}${streaks[i] ? ` · 🔥 ${streaks[i]}` : ''}`;
  });
}

// ---------- the app (app/api/routines) ----------

export interface RoutineView extends Routine {
  /** Today's state for this routine ('none' = not due yet or not a day it runs). */
  today: RoutineStatus | 'none';
  runsToday: boolean;
  streak: number;
}

export async function routinesView(uid: string, now: number, tz: string): Promise<RoutineView[]> {
  const all = await listRoutines(uid);
  if (!all.length) return [];
  const today = localDate(tz, now);
  const [snaps, streaks] = await Promise.all([
    adminDb().getAll(...all.map((r) => logsCol().doc(logIdOf(r.id, today)))),
    Promise.all(all.map((r) => streakOf(r.id, today, r))),
  ]);
  return all.map((r, i) => ({
    ...r,
    today: snaps[i].exists ? ((snaps[i].data()?.status as RoutineStatus) ?? 'none') : 'none',
    runsToday: runsOn(r, today),
    streak: streaks[i],
  }));
}

/** Change a routine by id (title, time, days). */
export async function editRoutine(uid: string, id: string, patch: { title?: string; time?: string; days?: unknown }): Promise<RoutineEdit> {
  const ref = routinesCol().doc(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.uid !== uid || snap.data()?.active === false) return { ok: false, reason: 'not_found' };
  const cur = toRoutine(id, snap.data()!);
  const upd: Record<string, unknown> = {};
  if (patch.title !== undefined) { const t = normTitle(patch.title); if (!t) return { ok: false, reason: 'no_title' }; upd.title = t; }
  if (patch.time !== undefined) { const t = parseTime(patch.time); if (!t) return { ok: false, reason: 'bad_time' }; upd.time = t; }
  if (patch.days !== undefined) upd.days = parseDays(patch.days);
  if (Object.keys(upd).length) await ref.update(upd);
  return { ok: true, routine: { ...cur, ...(upd as Partial<Routine>) } };
}

/** Mark today's occurrence done / skipped from the app, creating the day's log when the reminder has not gone out yet
 *  (a day marked here never gets the reminder: advance() only sends 'sent' logs without a sentAt). */
export async function markToday(uid: string, routineId: string, status: 'done' | 'skipped', now: number, tz: string): Promise<TapResult> {
  const snap = await routinesCol().doc(routineId).get();
  if (!snap.exists || snap.data()?.uid !== uid) return { ok: false };
  const r = toRoutine(routineId, snap.data()!);
  const date = localDate(tz, now);
  const id = logIdOf(routineId, date);
  const dueAt = zonedToMs(`${date}T${r.time}`, tz) ?? now;
  try {
    await logsCol().doc(id).create({ routineId, uid, date, title: r.title, time: r.time, dueAt, status: 'sent', sentAt: null, tries: 0, channel: 'app' });
  } catch { /* exists already */ }
  return setLogStatus(id, uid, status, now);
}

/** Stop a routine by id (the row stays, inactive, so its logs and streak history remain). */
export async function deactivateRoutine(uid: string, id: string): Promise<boolean> {
  const ref = routinesCol().doc(id);
  const s = await ref.get();
  if (!s.exists || s.data()?.uid !== uid) return false;
  await ref.update({ active: false });
  return true;
}
