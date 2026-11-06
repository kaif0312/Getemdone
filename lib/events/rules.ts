// Events: pure rules shared by the server, the WhatsApp bot and the native app (2026-11-07). NO imports, so the native app can
// carry a byte-identical copy (native/src/lib/eventsRules.ts; scripts/tests/test_events.mts fails when the two differ).
//
// Tasks vs events: a TASK is something to complete (checkable). An EVENT happens at a time for a while (not checkable, it
// passes): class, appointment, flight. An event is a `meetings/{id}` doc with kind 'event' (no Meet link, no attendees).
//
// Repeat model: ONE doc with a `repeat` rule, anchored at startAt/endAt (the first occurrence, wall clock in `tz`). Occurrences
// are expanded on demand (lists, the calendar mirror window, reminders); nothing is stored per occurrence except `exceptions`
// (local dates "YYYY-MM-DD" of single occurrences that were cancelled). DST-safe: every occurrence keeps the anchor's wall clock.

export type RepeatFreq = 'daily' | 'weekdays' | 'weekly';
export interface EventRepeat {
  freq: RepeatFreq;
  /** weekly only: weekdays 0 = Sunday .. 6 = Saturday. Empty / missing = the weekday of the first occurrence. */
  days?: number[];
  /** Last day (inclusive), local "YYYY-MM-DD". Missing = repeats until cancelled. */
  until?: string;
}
export interface SeriesLike {
  startAt: string; // ISO UTC, first occurrence
  endAt: string; // ISO UTC
  tz: string;
  repeat?: EventRepeat;
  exceptions?: string[];
}
export interface Occurrence { startMs: number; endMs: number; /** local day of the start, "YYYY-MM-DD" */ date: string }

export const EVENT_DEFAULT_DURATION_MIN = 60;
export const EVENT_MIN_DURATION_MIN = 5;
export const EVENT_MAX_DURATION_MIN = 24 * 60;
const DAY = 86_400_000;

// ---------- wall clock <-> instants ----------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function parts(at: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number } {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    fmtCache.set(tz, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(at))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: p.hour === '24' ? 0 : +p.hour, mi: +p.minute };
}
const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of an instant, "YYYY-MM-DD". */
export function localDay(at: number, tz: string): string {
  const p = parts(at, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}
/** Local clock of an instant, "HH:mm" (24 h). */
export function localHm(at: number, tz: string): string {
  const p = parts(at, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
}
/** "YYYY-MM-DD" + "HH:mm" read as a wall clock in `tz` -> UTC ms (two passes settle DST edges). */
export function wallToMs(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const want = Date.UTC(y, mo - 1, d, h, mi);
  const off = (at: number) => { const p = parts(at, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - at; };
  let at = want - off(want);
  at = want - off(at);
  return at;
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** 0 = Sunday .. 6 = Saturday for a "YYYY-MM-DD". */
export function weekdayOfDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ---------- repeat ----------

/** Clean a repeat rule from untrusted input; undefined = no repeat (or unusable). */
export function normalizeRepeat(r: unknown): EventRepeat | undefined {
  if (!r || typeof r !== 'object') return undefined;
  const o = r as Record<string, unknown>;
  if (o.freq !== 'daily' && o.freq !== 'weekdays' && o.freq !== 'weekly') return undefined;
  const out: EventRepeat = { freq: o.freq };
  if (o.freq === 'weekly' && Array.isArray(o.days)) {
    const days = [...new Set(o.days.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
    if (days.length) out.days = days;
  }
  if (typeof o.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.until)) out.until = o.until;
  return out;
}

function matches(repeat: EventRepeat, date: string, anchorDay: number): boolean {
  const wd = weekdayOfDate(date);
  if (repeat.freq === 'daily') return true;
  if (repeat.freq === 'weekdays') return wd >= 1 && wd <= 5;
  const days = repeat.days?.length ? repeat.days : [anchorDay];
  return days.includes(wd);
}

/**
 * Occurrences that overlap [fromMs, toMs): end > fromMs and start < toMs. Soonest first. A one-off gives its single slot.
 * `limit` caps the result (daily events over a long window).
 */
export function occurrencesBetween(ev: SeriesLike, fromMs: number, toMs: number, limit = 400): Occurrence[] {
  const startMs = Date.parse(ev.startAt);
  const durMs = Date.parse(ev.endAt) - startMs;
  const skip = new Set(ev.exceptions ?? []);
  const out: Occurrence[] = [];
  if (!ev.repeat) {
    const date = localDay(startMs, ev.tz);
    if (!skip.has(date) && startMs + durMs > fromMs && startMs < toMs) out.push({ startMs, endMs: startMs + durMs, date });
    return out;
  }
  const anchorDate = localDay(startMs, ev.tz);
  const hm = localHm(startMs, ev.tz);
  const anchorWd = weekdayOfDate(anchorDate);
  let day = localDay(Math.max(fromMs - durMs - DAY, startMs - DAY), ev.tz);
  if (day < anchorDate) day = anchorDate;
  const last = localDay(toMs, ev.tz);
  for (let i = 0; i < 1000 && day <= last && out.length < limit; i++, day = addDays(day, 1)) {
    if (ev.repeat.until && day > ev.repeat.until) break;
    if (skip.has(day) || !matches(ev.repeat, day, anchorWd)) continue;
    const s = wallToMs(day, hm, ev.tz);
    if (s + durMs > fromMs && s < toMs) out.push({ startMs: s, endMs: s + durMs, date: day });
  }
  return out;
}

/** The occurrence happening now or next (end > now). null when the series is over / the one-off has passed. */
export function currentOrNext(ev: SeriesLike, now: number): Occurrence | null {
  return occurrencesBetween(ev, now, now + 400 * DAY, 1)[0] ?? null;
}
/** The first occurrence that STARTS after `now` (what a reminder is about). */
export function nextStart(ev: SeriesLike, now: number): Occurrence | null {
  return occurrencesBetween(ev, now + 1, now + 400 * DAY, 3).find((o) => o.startMs > now) ?? null;
}

/**
 * A new series starts on its first matching day: "music class every tuesday 6pm" typed on a Sunday anchors on Tuesday, and one
 * typed after 6pm on a Tuesday anchors on next Tuesday. One-offs are returned unchanged. null = the series never occurs.
 */
export function alignSeries(ev: SeriesLike, notBefore: number): { startAt: string; endAt: string } | null {
  if (!ev.repeat) return { startAt: ev.startAt, endAt: ev.endAt };
  const from = Math.max(Date.parse(ev.startAt), notBefore);
  const first = occurrencesBetween(ev, from, from + 400 * DAY, 4).find((o) => o.startMs >= from);
  return first ? { startAt: new Date(first.startMs).toISOString(), endAt: new Date(first.endMs).toISOString() } : null;
}

// ---------- reminders ----------

/** Default nudge: 30 min before; if that moment has passed, 10 min before; else none. */
export function defaultReminderMinutes(startMs: number, now: number): number[] {
  if (startMs - 30 * 60_000 > now + 5_000) return [30];
  if (startMs - 10 * 60_000 > now + 5_000) return [10];
  return [];
}

// ---------- task vs event ----------

/** Words that make a timed item an EVENT even without a stated length. "call", "gym", "pay" are tasks and are NOT here. */
const EVENTISH = new RegExp(
  '\\b(class(?:es)?|lessons?|appointments?|appt|physio(?:therapy)?|therapy|meetings?|sessions?|flight|train|dinner|lunch|breakfast|brunch|match|game|' +
  'practice|training|exam|interview|concert|movie|film|party|wedding|workshop|webinar|seminar|lecture|stand-?up|sync|rehearsal|' +
  'check-?up|dentist|doctor|dr|consultation|haircut|salon|massage|tuition|coaching|recital|ceremony|funeral|graduation|trip|tour|conference|' +
  'yoga|pilates|zumba|karate|dance|swimming|football|cricket|badminton|tennis|basketball|volleyball|date night|playdate|pickup|drop-?off|surgery|vaccination|vaccine|clinic)\\b',
  'i',
);

export function isEventish(title: string): boolean {
  return EVENTISH.test(title);
}

/**
 * Task or event? Event when there is an explicit START TIME and (a stated length, an end time, or an event-ish noun).
 * A bare "call mom 6pm" or "gym 6pm" stays a task; a repeat alone does not make an event ("gym every day 6pm" is a habit).
 */
export function classifyItem(i: { title: string; hasTime: boolean; durationStated?: boolean; endStated?: boolean }): 'event' | 'task' {
  if (!i.hasTime) return 'task';
  return i.durationStated || i.endStated || isEventish(i.title) ? 'event' : 'task';
}
