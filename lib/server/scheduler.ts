// OWNER: agent "social". Proactive WhatsApp: morning check-in + evening recap, driven by GitHub Actions every 15 min
// through GET/POST /api/cron/nudge. See docs/WHATSAPP_BOT_PLAN.md §5.
//
// Rules: a user is handled in the 15-min slot containing their local checkinTime / recapTime (plus a grace window, see
// SCHEDULE_GRACE_MIN, because GitHub cron ticks run late). waSchedule/{waId_date_kind} is claimed create-once, so a
// kind is sent at most once per local day. Check-in outside the 24h window = template `nudge_checkin` (counted against
// NUDGE_MAX_TEMPLATES_PER_DAY); recap outside the window is skipped (no template, cost control).
import { adminDb } from './firebaseAdmin';
import { capDate, releaseTemplateSlot, reserveTemplateSlot } from './waCaps';
import { friendsActivity } from './social';
import * as usersMod from './users';
import * as tasksMod from './tasks';
import * as linksMod from '../wa/links';
import * as sendMod from '../wa/send';
import { BUTTON_IDS, type WaLink } from '../wa/types';
import { coachOf } from '../bot/coaches';
import { clip as clipLine, weekdayOf } from '../bot/format';
import { langOf, t, type Lang } from '../bot/i18n';
import type { Task } from '../../lib/types';

/** Extra minutes after the slot end during which a missed slot is still sent (idempotent, so safe). */
export const SCHEDULE_GRACE_MIN = 15;
const SLOT_MIN = 15;

export interface ScheduleCounts {
  checked: number;
  checkinFree: number;
  checkinTemplate: number;
  recaps: number;
  stale: number;
  reviews: number;
  parkedAsks: number;
  skipped: number;
  capped: number;
  errors: number;
}

/** Injectable collaborators (real ones by default) so emulator tests can fake time, zones and sends. */
export const deps = {
  listLinks: () => linksMod.listLinks(),
  localDate: (tz: string, at?: number) => usersMod.localDate(tz, at),
  localTime: (tz: string, at?: number) => usersMod.localTime(tz, at),
  windowOpen: (last: number, now?: number) => sendMod.windowOpen(last, now),
  listToday: (uid: string) => tasksMod.listToday(uid),
  daySummary: (uid: string) => tasksMod.daySummary(uid),
  friendsActivity: (uid: string) => friendsActivity(uid),
  sendText: (to: string, text: string) => sendMod.sendText(to, text),
  sendList: (to: string, body: string, label: string, rows: { id: string; title: string; description?: string }[], header?: string) =>
    sendMod.sendList(to, body, label, rows, header),
  sendButtons: (to: string, body: string, buttons: { id: string; title: string }[]) => sendMod.sendButtons(to, body, buttons),
  sendTemplate: (to: string, name: string, vars: string[], opts?: { language?: string; buttonPayloads?: string[] }) =>
    sendMod.sendTemplateFallback(to, name, vars, opts),
  listStale: (uid: string, now: number) => tasksMod.listStale(uid, now),
  weekReview: (uid: string, now: number) => tasksMod.weekReview(uid, now),
  markStaleNudged: (uid: string, ids: string[], now: number) => tasksMod.markStaleNudged(uid, ids, now),
  listParkedDue: (uid: string, now: number) => tasksMod.listParkedDue(uid, now),
  markParkedAsked: (uid: string, id: string, now: number) => tasksMod.markParkedAsked(uid, id, now),
};

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

/** True when `nowLocal` ("HH:mm") lies in the slot containing `target` or in the grace window after it. */
export function inSlot(target: string | null, nowLocal: string, graceMin = SCHEDULE_GRACE_MIN): boolean {
  if (!target) return false;
  const t = toMinutes(target);
  const n = toMinutes(nowLocal);
  if (t == null || n == null) return false;
  const slotStart = Math.floor(t / SLOT_MIN) * SLOT_MIN;
  return n >= slotStart && n < slotStart + SLOT_MIN + graceMin;
}

type Kind = 'checkin' | 'recap' | 'stale' | 'review' | 'parkedask';

/** Local time of the daily "this has been sitting" nudge and of the Sunday review (env overrides, "HH:mm"). */
export const staleTime = () => process.env.NUDGE_STALE_TIME || '13:00';
export const reviewTime = () => process.env.NUDGE_REVIEW_TIME || '17:00';
const DAY_MS = 86_400_000;

function schedRef(link: WaLink, date: string, kind: Kind) {
  return adminDb().doc(`waSchedule/${link.waId}_${date}_${kind}`);
}

/** Create-once claim. False if this (waId, date, kind) was already claimed. */
async function claim(link: WaLink, date: string, kind: Kind, now: number): Promise<boolean> {
  try {
    await schedRef(link, date, kind).create({ waId: link.waId, uid: link.uid, date, kind, status: 'claimed', createdAt: now });
    return true;
  } catch {
    return false;
  }
}

async function mark(link: WaLink, date: string, kind: Kind, status: string): Promise<void> {
  await schedRef(link, date, kind).set({ status, updatedAt: Date.now() }, { merge: true });
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function taskLabel(task: Task, lang: Lang = 'en'): string {
  return !task.text || task.text.startsWith('e1:') ? t(lang, 'aTask') : task.text;
}

async function friendsLine(link: WaLink): Promise<string> {
  if (!link.friendAlerts) return '';
  try {
    const acts = await deps.friendsActivity(link.uid);
    const streaks = acts.filter((a) => a.streak > 0).sort((a, b) => b.streak - a.streak).slice(0, 3);
    if (!streaks.length) return '';
    return 'Friends: ' + streaks.map((a) => `${a.displayName} ${a.streak}-day streak`).join(', ');
  } catch {
    return '';
  }
}

async function userName(uid: string): Promise<string> {
  const s = await adminDb().doc(`users/${uid}`).get();
  return ((s.data() as { displayName?: string } | undefined)?.displayName || '').trim() || 'there';
}

async function sendCheckin(link: WaLink, now: number, counts: ScheduleCounts, date: string): Promise<void> {
  const lang = langOf(link);
  const [tasks, name] = await Promise.all([deps.listToday(link.uid), userName(link.uid)]);
  const open = tasks.filter((t) => !t.completed);
  if (deps.windowOpen(link.lastInboundAt, now)) {
    const friends = await friendsLine(link);
    if (open.length) {
      const body = clip(
        (lang === 'en' ? coachOf(link.coach).morning(name, open.length) : t(lang, 'morning', { name, n: open.length })) +
          (friends ? `\n\n${friends}` : ''),
        1000,
      );
      const rows = open.slice(0, 10).map((task) => ({ id: BUTTON_IDS.focus(task.id), title: clip(taskLabel(task, lang), 24) }));
      await deps.sendList(link.waId, body, t(lang, 'pickFocus'), rows);
    } else {
      const body = clip((lang === 'en' ? coachOf(link.coach).morningEmpty(name) : t(lang, 'morningEmpty', { name })) + (friends ? `\n\n${friends}` : ''), 1000);
      await deps.sendButtons(link.waId, body, [
        { id: BUTTON_IDS.checkinStart, title: t(lang, 'btnPlan') },
        { id: BUTTON_IDS.checkinSkip, title: t(lang, 'btnSkip') },
      ]);
    }
    counts.checkinFree++;
    return;
  }
  const day = capDate(now);
  if (!(await reserveTemplateSlot(day))) {
    counts.capped++;
    await mark(link, date, 'checkin', 'capped');
    return;
  }
  try {
    await deps.sendTemplate(link.waId, 'nudge_checkin', [name, String(open.length)], {
      language: lang,
      buttonPayloads: [BUTTON_IDS.checkinStart, BUTTON_IDS.checkinSkip],
    });
  } catch (e) {
    await releaseTemplateSlot(day);
    throw e;
  }
  counts.checkinTemplate++;
}

async function sendRecap(link: WaLink, counts: ScheduleCounts): Promise<boolean> {
  const s = await deps.daySummary(link.uid);
  if (!s.done.length && !s.open.length) return false;
  const lang = langOf(link);
  const lines = [lang === 'en' ? coachOf(link.coach).recap(s.done.length, s.open.length) : t(lang, 'recapHead', { done: s.done.length, open: s.open.length })];
  if (s.done.length) lines.push((lang === 'en' ? 'Done:' : t(lang, 'recapDone')) + '\n' + s.done.slice(0, 5).map((task) => `- ${clip(taskLabel(task, lang), 60)}`).join('\n'));
  if (s.open.length) lines.push((lang === 'en' ? 'Open:' : t(lang, 'recapOpen')) + '\n' + s.open.slice(0, 5).map((task) => `- ${clip(taskLabel(task, lang), 60)}`).join('\n'));
  lines.push(lang === 'en'
    ? `Streak: ${s.streak} day${s.streak === 1 ? '' : 's'}` + (s.fitnessStreak ? `, fitness streak ${s.fitnessStreak}` : '')
    : t(lang, 'recapStreak', { n: s.streak }));
  await deps.sendText(link.waId, clip(lines.join('\n\n'), 3500));
  counts.recaps++;
  return true;
}

/**
 * Daily, free-window only (no template, no cost): the oldest task that has sat untouched, with three taps. Asks for the
 * very first small step (GTD "next action"), or lets the user move or drop it. Returns the status stored on the claim.
 */
async function sendStale(link: WaLink, now: number, counts: ScheduleCounts): Promise<string> {
  if (!deps.windowOpen(link.lastInboundAt, now)) return 'skipped_window_closed';
  const stale = await deps.listStale(link.uid, now);
  if (!stale.length) return 'skipped_empty';
  const t = stale[0];
  const days = Math.max(1, Math.floor((now - t.createdAt) / DAY_MS));
  await deps.sendButtons(
    link.waId,
    clip(`🧹 *${clipLine(taskLabel(t), 120)}* has been on your list for ${days} days.\n\nWhat is the very first small step? Or park it for someday, or let it go.`, 1000),
    [
      { id: BUTTON_IDS.step(t.id), title: 'Next step ✍️' },
      { id: BUTTON_IDS.park(t.id), title: 'Someday 💤' },
      { id: BUTTON_IDS.del(t.id), title: 'Drop it 🗑' },
    ],
  );
  await deps.markStaleNudged(link.uid, [t.id], now);
  counts.stale++;
  return 'sent';
}

/**
 * Once a year per parked task (Sundays, after the review, free window only): "still want this?". The question is stamped
 * when it is sent, so a user who ignores it is asked again in a year, not next week.
 */
async function sendParkedAsk(link: WaLink, now: number, counts: ScheduleCounts): Promise<string> {
  if (!deps.windowOpen(link.lastInboundAt, now)) return 'skipped_window_closed';
  const due = await deps.listParkedDue(link.uid, now);
  if (!due.length) return 'skipped_empty';
  const t = due[0];
  const since = Math.max(t.parkedAt ?? 0, t.parkedAskedAt ?? 0);
  const months = Math.max(12, Math.round((now - (t.parkedAt ?? since)) / (30.4 * DAY_MS)));
  await deps.sendButtons(
    link.waId,
    clip(`💤 You parked *${clipLine(taskLabel(t), 120)}* ${months >= 24 ? `${Math.round(months / 12)} years` : 'a year'} ago. Still want it?`, 1000),
    [
      { id: BUTTON_IDS.unpark(t.id), title: 'Do it today' },
      { id: BUTTON_IDS.keep(t.id), title: 'Keep parked' },
      { id: BUTTON_IDS.del(t.id), title: 'Drop it 🗑' },
    ],
  );
  await deps.markParkedAsked(link.uid, t.id, now);
  counts.parkedAsks++;
  return 'sent';
}

/** Sunday, free-window only: the week in three numbers, then the oldest untouched tasks as a list (tap one: Done / Tomorrow / Delete). */
async function sendReview(link: WaLink, now: number, counts: ScheduleCounts): Promise<string> {
  if (!deps.windowOpen(link.lastInboundAt, now)) return 'skipped_window_closed';
  const r = await deps.weekReview(link.uid, now);
  if (!r.done && !r.open) return 'skipped_empty';
  const head = `*Your week* 🗓\n✅ ${r.done} done · 📋 ${r.open} open${r.staleTotal ? ` · 🕸 ${r.staleTotal} untouched for 7+ days` : ''}${r.parked ? ` · 💤 ${r.parked} parked` : ''}`;
  if (!r.stale.length) {
    await deps.sendText(link.waId, `${head}\n\nNothing is going stale. Have a good week ✨`);
  } else {
    const rows = r.stale.slice(0, 10).map((t) => ({
      id: BUTTON_IDS.review(t.id),
      title: clip(taskLabel(t), 24),
      description: `${Math.max(1, Math.floor((now - t.createdAt) / DAY_MS))} days old`,
    }));
    await deps.sendList(link.waId, clip(`${head}\n\nDo it, park it for someday or drop it. Tap one:`, 1000), 'Review', rows);
    await deps.markStaleNudged(link.uid, r.stale.slice(0, 10).map((t) => t.id), now);
  }
  counts.reviews++;
  return 'sent';
}

async function handleLink(link: WaLink, now: number, counts: ScheduleCounts): Promise<void> {
  if (link.muted) return;
  const tz = link.timezone || 'Asia/Kolkata';
  const nowLocal = deps.localTime(tz, now);
  const date = deps.localDate(tz, now);

  if (inSlot(link.checkinTime, nowLocal) && (await claim(link, date, 'checkin', now))) {
    try {
      await sendCheckin(link, now, counts, date);
      const snap = await schedRef(link, date, 'checkin').get();
      if (snap.data()?.status === 'claimed') await mark(link, date, 'checkin', 'sent');
    } catch (e) {
      await schedRef(link, date, 'checkin').delete(); // retry on the next tick inside the grace window
      throw e;
    }
  }

  if (link.reviews !== false && !link.onboarding) {
    const sunday = weekdayOf(date) === 'Sunday';
    const jobs: { kind: Kind; at: string; run: typeof sendStale }[] = sunday
      ? [{ kind: 'review', at: reviewTime(), run: sendReview }, { kind: 'parkedask', at: reviewTime(), run: sendParkedAsk }]
      : [{ kind: 'stale', at: staleTime(), run: sendStale }];
    for (const j of jobs) {
      if (!inSlot(j.at, nowLocal) || !(await claim(link, date, j.kind, now))) continue;
      try {
        const status = await j.run(link, now, counts);
        await mark(link, date, j.kind, status);
        if (status !== 'sent') counts.skipped++;
      } catch (e) {
        await schedRef(link, date, j.kind).delete(); // retry on the next tick inside the grace window
        throw e;
      }
    }
  }

  if (inSlot(link.recapTime, nowLocal) && (await claim(link, date, 'recap', now))) {
    if (!deps.windowOpen(link.lastInboundAt, now)) {
      counts.skipped++;
      await mark(link, date, 'recap', 'skipped_window_closed');
      return;
    }
    try {
      const sent = await sendRecap(link, counts);
      await mark(link, date, 'recap', sent ? 'sent' : 'skipped_empty');
      if (!sent) counts.skipped++;
    } catch (e) {
      await schedRef(link, date, 'recap').delete();
      throw e;
    }
  }
}

export async function runSchedule(now: number): Promise<ScheduleCounts> {
  const counts: ScheduleCounts = { checked: 0, checkinFree: 0, checkinTemplate: 0, recaps: 0, stale: 0, reviews: 0, parkedAsks: 0, skipped: 0, capped: 0, errors: 0 };
  const links = await deps.listLinks();
  for (let i = 0; i < links.length; i += 10) {
    await Promise.all(
      links.slice(i, i + 10).map(async (link) => {
        counts.checked++;
        try {
          await handleLink(link, now, counts);
        } catch (e) {
          counts.errors++;
          console.error('[scheduler] failed for', link.waId, e);
        }
      }),
    );
  }
  return counts;
}
