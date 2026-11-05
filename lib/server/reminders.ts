// Task / event reminders. Called by app/api/cron/nudge on the same 15-min tick as the scheduler.
//
// WHEN a reminder fires (per open task, one per task per fire time):
//   1. task.remindAt (unix ms), set by the bot ("remind me at 5", or a slotted time like "gym 6pm" = remindFor 18:00,
//      remindAt = 18:00 minus REMIND_LEAD_MIN), or
//   2. task.dueDate minus the user's notificationSettings.deadlineMinutesBefore (the app's own setting), when the due
//      time is a real time (the bot stores a date-only deadline as 23:59, which is skipped).
//   A task with remindAt never also fires from dueDate. task.remindSentFor = the fire time already sent (claimed in a
//   transaction first, so a retried tick never double-sends).
//
// WHERE it goes (users/{uid}.reminderChannel): 'auto' (default) = app push if the user has the app (fcmToken or native
// expoPushTokens), else
// WhatsApp; 'app' = push only; 'whatsapp' = WhatsApp only; 'both'. A failed push falls back to WhatsApp when linked.
//
// COST (WhatsApp): inside the 24h window it is a plain interactive message (free). Outside it, the approved template
// `nudge_reminder` is used, but at most NUDGE_MAX_REMINDER_TEMPLATES_PER_USER_DAY (default 2) per person per local day
// and inside the global NUDGE_MAX_TEMPLATES_PER_DAY cap. Anything beyond that is dropped (status skipped_cost), never
// sent as an unplanned paid message. A reply to a template opens the window and the rest of that day is free.
import { FieldValue } from 'firebase-admin/firestore';
import type { Task } from '@/lib/types';
import { adminDb, adminMessaging } from './firebaseAdmin';
import { expoTokensOf, sendExpoPush } from './expoPush';
import { capDate, releaseTemplateSlot, reserveTemplateSlot } from './waCaps';
import { localDate, localTime, DEFAULT_TIMEZONE } from './users';
import * as linksMod from '../wa/links';
import * as sendMod from '../wa/send';
import * as sessionsMod from '../wa/sessions';
import { BUTTON_IDS, type WaLink } from '../wa/types';
import { langOf, t, type Lang } from '../bot/i18n';

export type ReminderChannel = 'auto' | 'app' | 'whatsapp' | 'both';
export const REMINDER_CHANNELS: ReminderChannel[] = ['auto', 'app', 'whatsapp', 'both'];

/** Default minutes before a slotted time ("gym 6pm") that the reminder fires. */
export const REMIND_LEAD_MIN = 15;
/** A reminder whose fire time is older than this is skipped (the cron was down), unless the event is still ahead. */
const STALE_MS = 45 * 60_000;
const MAX_LEAD_MS = 24 * 3_600_000;
const MAX_PER_USER_TICK = 6;

export function maxReminderTemplatesPerUserDay(): number {
  const raw = process.env.NUDGE_MAX_REMINDER_TEMPLATES_PER_USER_DAY;
  const n = Number(raw);
  return raw && Number.isFinite(n) && n >= 0 ? n : 2;
}

export interface Candidate {
  task: Task;
  uid: string;
  /** Fire time (ms). */
  fireAt: number;
  /** The event / deadline the reminder is about (ms). */
  eventAt: number;
}

interface UserPrefs {
  uid: string;
  tz: string;
  channel: ReminderChannel;
  fcmToken?: string;
  /** Native app (Expo) push tokens. */
  expoTokens: string[];
  focus: boolean;
  off: boolean;
  leadMin: number;
  name: string;
}

export type Outcome = 'push' | 'wa_free' | 'wa_template' | 'skipped_cost' | 'skipped_focus' | 'skipped_off' | 'skipped_no_channel' | 'failed';

export interface ReminderCounts {
  considered: number;
  push: number;
  waFree: number;
  waTemplate: number;
  skipped: number;
  errors: number;
}

/** Injectable collaborators so the emulator test can fake time and the network. */
export const deps = {
  sendPush: async (token: string, title: string, body: string, taskId: string): Promise<'ok' | 'dead' | 'error'> => {
    try {
      await adminMessaging().send({
        token,
        notification: { title, body },
        data: { type: 'reminder', taskId, title, body, url: '/' },
        webpush: {
          notification: { title, body, icon: '/icon.svg', badge: '/icon.svg', tag: `reminder-${taskId}`, requireInteraction: false },
          fcmOptions: { link: '/' },
        },
      });
      return 'ok';
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') return 'dead';
      console.error('[reminders] push failed', code, (e as Error).message);
      return 'error';
    }
  },
  /** Native app push: 'ok' if at least one device accepted it, 'dead' if every token was unregistered. */
  sendExpo: async (uid: string, title: string, body: string, taskId: string): Promise<'ok' | 'dead' | 'error'> => {
    const r = await sendExpoPush(uid, { title, body, data: { type: 'task', taskId } });
    if (r.sent > 0) return 'ok';
    return r.dead.length > 0 && r.errors === 0 ? 'dead' : 'error';
  },
  getLinkByUid: (uid: string) => linksMod.getLinkByUid(uid),
  windowOpen: (last: number, now?: number) => sendMod.windowOpen(last, now),
  sendButtons: (to: string, body: string, buttons: { id: string; title: string }[]) => sendMod.sendButtons(to, body, buttons),
  sendTemplate: (to: string, name: string, vars: string[], opts?: { language?: string }) => sendMod.sendTemplateFallback(to, name, vars, opts),
  getSession: (waId: string) => sessionsMod.getSession(waId),
  saveSession: (waId: string, s: Awaited<ReturnType<typeof sessionsMod.getSession>>) => sessionsMod.saveSession(waId, s),
};

const tasksCol = () => adminDb().collection('tasks');

function toTask(id: string, data: FirebaseFirestore.DocumentData): Task {
  return { id, ...(data as Omit<Task, 'id'>) };
}

function taskLabel(task: Task, lang: Lang = 'en'): string {
  return !task.text || task.text.startsWith('e1:') ? t(lang, 'aTask') : task.text; // e1: = encrypted by the app, never readable here
}

function clipOne(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length <= n ? one : one.slice(0, n - 1) + '…';
}

function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`;
}

/** "in 15 min" / "in 2 h" / "now" for the push / message. */
export function untilLabel(eventAt: number, now: number, lang: Lang = 'en'): string {
  const min = Math.round((eventAt - now) / 60_000);
  if (min <= 1) return lang === 'en' ? 'now' : t(lang, 'untilNow');
  if (min < 90) return t(lang, 'untilMin', { n: min });
  return t(lang, 'untilHr', { n: Math.round(min / 60) });
}

/** The pure part: which fire time (if any) applies to this task right now. */
export function fireFor(
  t: Task,
  now: number,
  leadMin: number,
  tz: string,
): { fireAt: number; eventAt: number } | null {
  if (t.completed || t.deleted || t.recurrence) return null;
  if (t.remindAt) {
    const eventAt = t.remindFor ?? t.remindAt;
    if (t.remindAt > now) return null;
    if (now - t.remindAt > STALE_MS && eventAt < now) return null;
    return { fireAt: t.remindAt, eventAt };
  }
  if (t.dueDate) {
    // Date-only deadlines are stored as 23:59 local: no clock time to remind about.
    if (localTime(tz, t.dueDate) === '23:59') return null;
    const fireAt = t.dueDate - leadMin * 60_000;
    if (fireAt > now || t.dueDate <= now) return null;
    return { fireAt, eventAt: t.dueDate };
  }
  return null;
}

async function loadPrefs(uid: string, cache: Map<string, UserPrefs>): Promise<UserPrefs> {
  const hit = cache.get(uid);
  if (hit) return hit;
  const snap = await adminDb().doc(`users/${uid}`).get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const ns = (d.notificationSettings ?? {}) as { deadlineReminders?: boolean; deadlineMinutesBefore?: number };
  const ch = d.reminderChannel as ReminderChannel;
  const tz = typeof d.timezone === 'string' && d.timezone ? d.timezone : DEFAULT_TIMEZONE;
  const prefs: UserPrefs = {
    uid,
    tz,
    channel: REMINDER_CHANNELS.includes(ch) ? ch : 'auto',
    fcmToken: typeof d.fcmToken === 'string' && d.fcmToken ? d.fcmToken : undefined,
    expoTokens: expoTokensOf(d),
    focus: d.focusModeActive === true,
    off: ns.deadlineReminders === false,
    leadMin: typeof ns.deadlineMinutesBefore === 'number' && ns.deadlineMinutesBefore > 0 ? ns.deadlineMinutesBefore : 60,
    name: typeof d.displayName === 'string' ? d.displayName : '',
  };
  cache.set(uid, prefs);
  return prefs;
}

/** Claim (task, fireAt) exactly once. False if it was already sent / claimed. */
async function claim(taskId: string, fireAt: number): Promise<boolean> {
  const ref = tasksCol().doc(taskId);
  return adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const d = s.data();
    if (!d || d.completed === true || d.deleted === true) return false;
    if (d.remindSentFor === fireAt) return false;
    tx.update(ref, { remindSentFor: fireAt });
    return true;
  });
}

async function userDayTemplateCount(waId: string, day: string): Promise<number> {
  const s = await adminDb().doc(`waReminderCaps/${waId}_${day}`).get();
  return (s.data()?.templates as number | undefined) ?? 0;
}
async function bumpUserDayTemplate(waId: string, day: string, by: 1 | -1): Promise<void> {
  await adminDb().doc(`waReminderCaps/${waId}_${day}`).set({ templates: FieldValue.increment(by), updatedAt: Date.now() }, { merge: true });
}

async function viaWhatsApp(c: Candidate, link: WaLink, prefs: UserPrefs, now: number): Promise<Outcome> {
  const lang = langOf(link);
  const label = clipOne(taskLabel(c.task, lang), 60);
  const at = time12(localTime(prefs.tz, c.eventAt));
  const eventToday = localDate(prefs.tz, c.eventAt) === localDate(prefs.tz, now);
  if (deps.windowOpen(link.lastInboundAt, now)) {
    const when = eventToday ? at : `${localDate(prefs.tz, c.eventAt)} ${at}`;
    const until = untilLabel(c.eventAt, now, lang);
    const id = await deps.sendButtons(link.waId, `⏰ ${label}\n${until === 'now' ? 'Now' : until} (${when})`, [
      { id: BUTTON_IDS.done(c.task.id), title: t(lang, 'btnDone') },
      { id: BUTTON_IDS.tomorrow(c.task.id), title: t(lang, 'btnTomorrow') },
    ]);
    if (id) return 'wa_free';
    // The window was closed in Meta's view after all (131047): fall through to the template path.
  }
  // Window closed: one paid template, within the per-user and global caps. The template text says "today".
  if (!eventToday) return 'skipped_cost';
  const day = localDate(prefs.tz, now);
  if ((await userDayTemplateCount(link.waId, day)) >= maxReminderTemplatesPerUserDay()) return 'skipped_cost';
  const gday = capDate(now);
  if (!(await reserveTemplateSlot(gday))) return 'skipped_cost';
  await bumpUserDayTemplate(link.waId, day, 1);
  const id = await deps.sendTemplate(link.waId, 'nudge_reminder', [label, at], { language: lang });
  if (!id) {
    await releaseTemplateSlot(gday);
    await bumpUserDayTemplate(link.waId, day, -1);
    return 'failed';
  }
  // So the "done" / "later" reply resolves to this task.
  try {
    const s = await deps.getSession(link.waId);
    await deps.saveSession(link.waId, { ...s, lastList: [c.task.id], updatedAt: now });
  } catch (e) {
    console.error('[reminders] session update failed', e);
  }
  return 'wa_template';
}

async function deliver(c: Candidate, prefs: UserPrefs, now: number): Promise<Outcome> {
  if (prefs.off) return 'skipped_off';
  const link = await deps.getLinkByUid(c.uid);
  const waOk = !!link && !link.muted;
  const hasApp = !!prefs.fcmToken || prefs.expoTokens.length > 0;
  const wantPush = prefs.channel === 'app' || prefs.channel === 'both' || (prefs.channel === 'auto' && hasApp);
  const wantWa = prefs.channel === 'whatsapp' || prefs.channel === 'both' || (prefs.channel === 'auto' && !hasApp);

  let result: Outcome | null = null;
  let pushFailed = false;
  if (wantPush) {
    if (!hasApp) pushFailed = true;
    else if (prefs.focus) result = 'skipped_focus';
    else {
      const pl = langOf(link);
      const label = taskLabel(c.task, pl);
      const when = untilLabel(c.eventAt, now, pl);
      const isNow = Math.round((c.eventAt - now) / 60_000) <= 1;
      const title = `⏰ ${clipOne(label, 80)}`;
      const body = `${isNow ? t(pl, 'pushStartsNow') : t(pl, 'pushStarts', { when })} (${time12(localTime(prefs.tz, c.eventAt))})`;
      // Same title/body to every app the user has: the PWA (FCM) and the native app (Expo).
      const rs: ('ok' | 'dead' | 'error')[] = [];
      if (prefs.fcmToken) rs.push(await deps.sendPush(prefs.fcmToken, title, body, c.task.id));
      if (prefs.expoTokens.length) rs.push(await deps.sendExpo(c.uid, title, body, c.task.id));
      if (rs.includes('ok')) result = 'push';
      else pushFailed = true;
    }
  }
  // WhatsApp when asked for it, or as the fallback for a push that could not be delivered (and the user is linked).
  if ((wantWa || (pushFailed && prefs.channel === 'auto')) && waOk) {
    const w = await viaWhatsApp(c, link!, prefs, now);
    if (result !== 'push' && (result === null || w === 'wa_free' || w === 'wa_template')) result = w;
  }
  return result ?? 'skipped_no_channel';
}

/** Tasks that may fire right now. Two single-field range queries (no composite index needed). */
export async function findCandidates(now: number, prefsCache: Map<string, UserPrefs> = new Map()): Promise<Candidate[]> {
  const [byRemind, byDue] = await Promise.all([
    tasksCol().where('remindAt', '>', now - 6 * 3_600_000).where('remindAt', '<=', now).get(),
    tasksCol().where('dueDate', '>', now).where('dueDate', '<=', now + MAX_LEAD_MS).get(),
  ]);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const doc of [...byRemind.docs, ...byDue.docs]) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    const t = toTask(doc.id, doc.data());
    if (!t.userId) continue;
    const prefs = await loadPrefs(t.userId, prefsCache);
    const f = fireFor(t, now, prefs.leadMin, prefs.tz);
    if (!f || t.remindSentFor === f.fireAt) continue;
    out.push({ task: t, uid: t.userId, ...f });
  }
  return out;
}

export async function runReminders(now: number): Promise<ReminderCounts> {
  const counts: ReminderCounts = { considered: 0, push: 0, waFree: 0, waTemplate: 0, skipped: 0, errors: 0 };
  const prefsCache = new Map<string, UserPrefs>();
  const cands = await findCandidates(now, prefsCache);
  const perUser = new Map<string, number>();
  for (const c of cands.sort((a, b) => a.fireAt - b.fireAt)) {
    counts.considered++;
    const n = (perUser.get(c.uid) ?? 0) + 1;
    perUser.set(c.uid, n);
    if (n > MAX_PER_USER_TICK) { counts.skipped++; continue; }
    try {
      const out = await sendClaimed(c, prefsCache, now);
      if (out === null) continue;
      if (out === 'push') counts.push++;
      else if (out === 'wa_free') counts.waFree++;
      else if (out === 'wa_template') counts.waTemplate++;
      else if (out === 'failed') counts.errors++;
      else counts.skipped++;
    } catch (e) {
      counts.errors++;
      console.error('[reminders] failed for task', c.task.id, e);
    }
  }
  return counts;
}

/** Claim, deliver, and release the claim on a failed send (so the next tick or retry tries again). null = already sent. */
async function sendClaimed(c: Candidate, prefsCache: Map<string, UserPrefs>, now: number): Promise<Outcome | null> {
  if (!(await claim(c.task.id, c.fireAt))) return null;
  let out: Outcome;
  try {
    out = await deliver(c, await loadPrefs(c.uid, prefsCache), now);
  } catch (e) {
    await tasksCol().doc(c.task.id).update({ remindSentFor: FieldValue.delete() });
    throw e;
  }
  if (out === 'failed') await tasksCol().doc(c.task.id).update({ remindSentFor: FieldValue.delete() });
  return out;
}

/** The exact-time path (QStash -> /api/reminders/fire). 'stale' = the reminder was changed, completed or removed since. */
export async function fireOne(taskId: string, fireAt: number, now: number): Promise<Outcome | 'stale' | 'duplicate'> {
  const snap = await tasksCol().doc(taskId).get();
  if (!snap.exists) return 'stale';
  const task = toTask(snap.id, snap.data()!);
  if (!task.userId) return 'stale';
  const cache = new Map<string, UserPrefs>();
  const prefs = await loadPrefs(task.userId, cache);
  const f = fireFor(task, now, prefs.leadMin, prefs.tz);
  if (!f || f.fireAt !== fireAt) return 'stale';
  const out = await sendClaimed({ task, uid: task.userId, ...f }, cache, now);
  if (out === null) return 'duplicate';
  if (out === 'failed') throw new Error('delivery failed'); // 500 -> QStash retries
  return out;
}

/** users/{uid}.reminderChannel, set from the bot ("remind me on WhatsApp") or the app. */
export async function setReminderChannel(uid: string, channel: ReminderChannel): Promise<void> {
  await adminDb().doc(`users/${uid}`).set({ reminderChannel: channel }, { merge: true });
}
