// Deterministic reader for clear English event phrases ("physio today 4:30pm for 1 hour", "4:30-5:30pm", "music class every
// tuesday 6pm for 1h"). PURE. The WhatsApp fast path uses it so the common case needs no model call; anything it cannot read
// confidently returns null and goes to Gemini (create_event tool), which handles other languages and loose phrasing.
import { addDays, classifyItem, normalizeRepeat, weekdayOfDate, type EventRepeat } from './rules';

export interface ParseCtx { today: string; time: string; tz: string }

export interface ParsedEvent {
  title: string;
  /** Local "YYYY-MM-DD". */
  date: string;
  /** Local "HH:mm". */
  time: string;
  /** Minutes; undefined when the text states neither a length nor an end time (the caller applies the default). */
  durationMin?: number;
  durationStated: boolean;
  endStated: boolean;
  repeat?: EventRepeat;
  kind: 'event' | 'task';
}

const WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WD_RE = '(sun(?:day)?|mon(?:day)?|tue(?:sday|s)?|wed(?:nesday)?|thu(?:rsday|rs|r)?|fri(?:day)?|sat(?:urday)?)';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

const wdIndex = (s: string): number => WD.findIndex((w) => w.startsWith(s.slice(0, 3).toLowerCase()));
const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function to24(h: number, ap?: string): number | null {
  if (!ap) return h <= 23 ? h : null;
  if (h < 1 || h > 12) return null;
  const pm = ap.toLowerCase() === 'pm';
  return h === 12 ? (pm ? 12 : 0) : pm ? h + 12 : h;
}

function minutesOf(hm: string): number { const [h, m] = hm.split(':').map(Number); return h * 60 + m; }

/** Remove the first match of `re` from `s` (replaced by a space). */
function cut(s: string, re: RegExp): string { return s.replace(re, ' '); }

export function parseRepeat(text: string): { repeat?: EventRepeat; rest: string } {
  const rest = text;
  let m = new RegExp(`\\bevery\\s+(?:other\\s+)?${WD_RE}((?:\\s*(?:,|and|&)\\s*${WD_RE})*)`, 'i').exec(rest);
  if (m) {
    const days = new Set<number>([wdIndex(m[1])]);
    for (const x of (m[2] ?? '').matchAll(new RegExp(WD_RE, 'gi'))) days.add(wdIndex(x[1]));
    return { repeat: normalizeRepeat({ freq: 'weekly', days: [...days] }), rest: cut(rest, new RegExp(m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
  }
  m = /\b(every\s*week\s*days?|every\s+weekday|weekdays|on weekdays|mon(?:day)?\s*(?:-|to|through)\s*fri(?:day)?)\b/i.exec(rest);
  if (m) return { repeat: { freq: 'weekdays' }, rest: cut(rest, /\b(every\s*week\s*days?|every\s+weekday|on weekdays|weekdays|mon(?:day)?\s*(?:-|to|through)\s*fri(?:day)?)\b/i) };
  m = /\b(every\s*day|everyday|daily|each day)\b/i.exec(rest);
  if (m) return { repeat: { freq: 'daily' }, rest: cut(rest, /\b(every\s*day|everyday|daily|each day)\b/i) };
  m = /\b(every\s*week|weekly)\b/i.exec(rest);
  if (m) return { repeat: { freq: 'weekly' }, rest: cut(rest, /\b(every\s*week|weekly)\b/i) };
  return { rest };
}

interface Clock { start: string; end?: string; rest: string }

export function parseClock(text: string): Clock | null {
  // Range: "4:30-5:30pm", "4 to 5 pm", "from 10am till 11:30am", "11 - 1pm"
  const range = /(?:\bfrom\s+|\bat\s+|@\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to|till|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text)
    ?? /(?:\bfrom\s+|\bat\s+|@\s*)?\b(\d{1,2}):(\d{2})\s*(am|pm)?\s*(?:-|–|—|to|till|until)\s*(\d{1,2}):(\d{2})\s*(am|pm)?\b/i.exec(text);
  if (range) {
    const h1 = +range[1], m1 = +(range[2] ?? 0), h2 = +range[4], m2 = +(range[5] ?? 0);
    const ap1 = range[3], ap2 = range[6];
    if (m1 < 60 && m2 < 60) {
      const end = to24(h2, ap2);
      let start = to24(h1, ap1 ?? ap2);
      // "11 to 1pm": the end's am/pm would put the start after the end, so the start is the morning one.
      if (!ap1 && start != null && end != null && ap2 && start * 60 + m1 >= end * 60 + m2 && h1 !== 12) start = to24(h1, ap2.toLowerCase() === 'pm' ? 'am' : 'pm');
      if (start != null && end != null && h1 <= 24 && h2 <= 24) {
        return { start: hhmm(start, m1), end: hhmm(end, m2), rest: cut(text, new RegExp(range[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
      }
    }
  }
  // "4:30pm", "6 pm", "at 6pm", "18:30", "at noon"
  const one = /(?:\b(?:at|from|starting|starts|@)\s*)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(text)
    ?? /(?:\b(?:at|from|starting|starts|@)\s*)?\b([01]?\d|2[0-3]):([0-5]\d)\b()/.exec(text);
  if (one) {
    const h = to24(+one[1], one[3] || undefined);
    const m = +(one[2] ?? 0);
    if (h != null && m < 60) return { start: hhmm(h, m), rest: cut(text, new RegExp(one[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
  }
  const noon = /(?:\b(?:at|around)\s*)?\bnoon\b/i.exec(text);
  if (noon) return { start: '12:00', rest: cut(text, /(?:\b(?:at|around)\s*)?\bnoon\b/i) };
  return null;
}

/** "for 1 hour", "for 45 min", "1.5 hours", "1 hour 30 min", "for an hour", "half an hour". Minutes, or null. */
export function parseDuration(text: string): { min: number; rest: string } | null {
  let rest = text;
  let total = 0;
  let found = false;
  if (/\b(?:for\s+)?half an? hour\b/i.test(rest)) { total += 30; found = true; rest = cut(rest, /\b(?:for\s+)?half an? hour\b/i); }
  const an = /\b(?:for\s+)?an? (?:hour|hr)\b/i;
  if (an.test(rest)) { total += 60; found = true; rest = cut(rest, an); }
  const re = /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*[- ]?\s*(hours?|hrs?|h|minutes?|mins?|m)\b(?!\s*(?:am|pm))/gi;
  let m: RegExpExecArray | null;
  const spans: string[] = [];
  while ((m = re.exec(rest))) {
    const n = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    total += unit.startsWith('h') ? n * 60 : n;
    found = true;
    spans.push(m[0]);
  }
  for (const s of spans) rest = rest.replace(s, ' ');
  if (!found || total <= 0 || total > 24 * 60) return null;
  return { min: Math.round(total), rest };
}

export function parseDate(text: string, ctx: ParseCtx): { date: string | null; rest: string } {
  let rest = text;
  const take = (re: RegExp): RegExpExecArray | null => { const m = re.exec(rest); if (m) rest = cut(rest, re); return m; };
  if (take(/\b(?:the\s+)?day after tomorrow\b/i)) return { date: addDays(ctx.today, 2), rest };
  if (take(/\b(?:tomorrow|tmrw|tmr)\b/i)) return { date: addDays(ctx.today, 1), rest };
  if (take(/\b(?:today|tonight|this evening)\b/i)) return { date: ctx.today, rest };
  const next = new RegExp(`\\b(next|this|on)\\s+${WD_RE}\\b`, 'i');
  let m = take(next);
  let force: string | undefined;
  if (!m) { m = take(new RegExp(`\\b${WD_RE}\\b`, 'i')); }
  else force = m[1].toLowerCase();
  if (m) {
    const wd = wdIndex(force ? m[2] : m[1]);
    const todayWd = weekdayOfDate(ctx.today);
    let delta = (wd - todayWd + 7) % 7;
    if (force === 'next' && delta === 0) delta = 7;
    return { date: addDays(ctx.today, delta), rest };
  }
  const dm = take(new RegExp(`\\b(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`, 'i')) ?? null;
  const md = dm ? null : take(new RegExp(`\\b(?:on\\s+)?${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'));
  const pick = dm ? { day: +dm[1], mon: dm[2] } : md ? { day: +md[2], mon: md[1] } : null;
  if (pick) {
    const mi = MONTHS.findIndex((x) => pick.mon.toLowerCase().startsWith(x));
    let y = +ctx.today.slice(0, 4);
    const mk = (yy: number) => `${yy}-${String(mi + 1).padStart(2, '0')}-${String(pick.day).padStart(2, '0')}`;
    if (pick.day < 1 || pick.day > 31 || mi < 0) return { date: null, rest };
    if (mk(y) < ctx.today) y++;
    return { date: mk(y), rest };
  }
  const iso = take(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return { date: iso[1], rest };
  return { date: null, rest };
}

/** A message that starts like this is an instruction or a question about something else, not "<what> <when>". */
const COMMAND_START = /^(?:please\s+)?(?:move|change|reschedule|postpone|push|shift|cancel|delete|remove|drop|remind|what|when|where|how|can|could|do|did|is|are|will|should|i|we|you|why|who|show|list|tell|snooze)\b/i;

const FILLER = /\b(?:set|add|book|schedule|put|create|make|please|pls|remind me (?:about|of|to)|the event|an event|event|in my (?:calendar|schedule)|on my calendar|starting from|starting|starts|from|at|on|for|every|each|and|to|till|until|@)\b/gi;

function cleanTitle(s: string): string {
  const t = s.replace(/[,;:()]/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—.!?]+|[\s\-–—.!?]+$/g, '').trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "gym 6pm, call mom": more than one comma-separated piece carries its own title words, so it is a list, not one item. */
function listsSeveral(raw: string, ctx: ParseCtx): boolean {
  const segs = raw.split(/\s*,\s*/).filter(Boolean);
  if (segs.length < 2) return false;
  let titles = 0;
  for (const seg of segs) {
    const c = parseClock(parseRepeat(seg).rest);
    const d = parseDate(parseDuration(c ? c.rest : parseRepeat(seg).rest)?.rest ?? (c ? c.rest : parseRepeat(seg).rest), ctx);
    if (cleanTitle(d.rest)) titles++;
  }
  return titles > 1;
}

/**
 * Read one item. Returns null unless there is a clear title AND a clear clock time. `kind` says event or task by the rules in
 * rules.ts (the caller decides what to do with a 'task'). A message listing several things is not read here.
 */
export function parseEventText(text: string, ctx: ParseCtx): ParsedEvent | null {
  if (/[\n;]/.test(text.trim())) return null; // several lines = several items
  const raw = text.replace(/\s+/g, ' ').trim();
  if (!raw || raw.length > 200) return null;
  if (/\b(remind me|reminder)\b/i.test(raw) && !/\bfor\b/i.test(raw)) return null; // reminders are their own thing
  if (listsSeveral(raw, ctx)) return null;
  const rep = parseRepeat(raw);
  const clock = parseClock(rep.rest);
  if (!clock) return null;
  const dur = clock.end ? null : parseDuration(clock.rest);
  const afterDur = dur ? dur.rest : clock.rest;
  const dt = parseDate(afterDur, ctx);
  const title = cleanTitle(dt.rest);
  if (!title || /^\d+$/.test(title)) return null;
  // Only "<what> <when>" is read here. A sentence (a command, a question, a second time, a long ramble) goes to the model.
  if (COMMAND_START.test(dt.rest.trim()) || title.split(' ').length > 7 || /\d\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/i.test(title)) return null;
  let date = dt.date;
  if (!date) date = ctx.today;
  let durationMin = dur?.min;
  let endStated = false;
  if (clock.end) {
    let d = minutesOf(clock.end) - minutesOf(clock.start);
    if (d <= 0) d += 24 * 60;
    durationMin = d;
    endStated = true;
  }
  const durationStated = !!dur;
  const kind = classifyItem({ title, hasTime: true, durationStated, endStated });
  return { title, date, time: clock.start, ...(durationMin ? { durationMin } : {}), durationStated, endStated, ...(rep.repeat ? { repeat: rep.repeat } : {}), kind };
}

/** "cancel physio", "cancel my physio session", "cancel the event physio" -> "physio". null = not a cancel phrase. */
export function parseCancelText(text: string): string | null {
  const m = /^\s*(?:please\s+)?cancel\s+(?:my\s+|the\s+)?(?:event\s+)?(?:called\s+)?(.{2,60}?)\s*[.!]?\s*$/i.exec(text);
  if (!m) return null;
  const ref = m[1].replace(/\b(event|session)$/i, '').trim() || m[1].trim();
  if (/^[\d\s,#-]+$/.test(ref)) return null; // "cancel 2" / "delete 1,3" are list numbers
  return ref;
}
