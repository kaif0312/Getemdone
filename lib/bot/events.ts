// Events over WhatsApp (2026-11-07): "physio today 4:30pm for 1 hour" becomes an EVENT (a timed block with a length, not a
// checkable task), and the reply reads like a set event. The model gets create_event / move_event / cancel_event / list_events;
// clear English phrases never reach the model (eventFast); a timed add_tasks item that the rules call an event is routed here too
// (actions.addItems), so a model slip cannot turn "class 4pm for 45 min" into a task. Rules: lib/events/rules.ts.
import type { FunctionDecl } from './types';
import type { Ctx } from './actions';
import type { EventItem, Meeting } from '@/lib/meetings/types';
import { DEFAULT_MEETING_TZ } from '@/lib/meetings/types';
import { EVENT_DEFAULT_DURATION_MIN, classifyItem, currentOrNext, localDay, localHm, nextStart, normalizeRepeat, weekdayOfDate, type EventRepeat } from '@/lib/events/rules';
import { parseCancelText, parseEventText, parseRepeat } from '@/lib/events/parse';
import { addDays, clip, num, str, time12, validWhen } from './format';
import { localeOf, type Lang } from './i18n';
import { systemFor } from './prompt';

const S = { type: 'STRING' } as const;
const N = { type: 'NUMBER' } as const;

export const EVENT_TOOLS: FunctionDecl[] = [
  {
    name: 'create_event',
    description:
      'Create an EVENT: something that happens at a set time for a while (class, appointment, physio, meeting, flight, dinner, match, lesson). ' +
      'Use it when the message has a start time AND a length ("for 1 hour", "4:30 to 5:30") or an event-like word. ' +
      'NOT for a plain task with a clock time ("call mom 6pm", "gym 6pm"): that is add_tasks.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { ...S, description: "Short title in the user's words, without the date/time/length words" },
        start: { ...S, description: "Start in the user's local zone as YYYY-MM-DDTHH:mm, worked out from the local date and weekday given at the end" },
        duration_min: { ...N, description: 'Length in minutes ("for 1 hour" = 60, "4:30 to 5:30" = 60). Omit when the user gave no length: the app uses 60.' },
        repeat: { ...S, enum: ['daily', 'weekdays', 'weekly'], description: 'Only if it repeats: daily ("every day"), weekdays (Mon-Fri) or weekly ("every Tuesday")' },
        repeat_days: { type: 'ARRAY', items: { ...S, enum: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] }, description: 'With repeat=weekly: the weekdays ("every Tuesday and Thursday" = tue, thu)' },
        repeat_until: { ...S, description: 'Last day, YYYY-MM-DD, only if the user says when it ends' },
        remind_before_min: { ...N, description: 'Only if the user asks for a specific reminder lead ("remind me 1 hour before"). Default is 30 minutes.' },
        notes: S,
        location: S,
      },
      required: ['title', 'start'],
    },
  },
  {
    name: 'move_event',
    description: 'Change the day, time or length of an EXISTING event (ref = its title or part of it). Give start (new local start) and/or duration_min.',
    parameters: {
      type: 'OBJECT',
      properties: {
        ref: S,
        start: { ...S, description: 'New start, YYYY-MM-DDTHH:mm in the user local zone. For "move physio to 5pm" keep the same day.' },
        duration_min: N,
      },
      required: ['ref'],
    },
  },
  {
    name: 'cancel_event',
    description: 'Cancel an EXISTING event (class, appointment, physio...) by its title or part of it. Not for tasks (delete_task).',
    parameters: { type: 'OBJECT', properties: { ref: S }, required: ['ref'] },
  },
  { name: 'list_events', description: "Show the user's upcoming events (\"what's on this week\", \"my events\").", parameters: { type: 'OBJECT', properties: {} } },
];

// ---------- formatting ----------

const meridiem = (hm: string) => (Number(hm.split(':')[0]) >= 12 ? 'PM' : 'AM');
const clock = (hm: string) => time12(hm);

/** "4:30–5:30 PM" (shared AM/PM written once) or "11:30 AM–12:30 PM". */
export function rangeLabel(startHm: string, endHm: string): string {
  const a = clock(startHm);
  const b = clock(endHm);
  return meridiem(startHm) === meridiem(endHm) ? `${a.replace(/ [AP]M$/, '')}–${b}` : `${a}–${b}`;
}

export function dayWord(lang: Lang, date: string, today: string, t: (k: 'today' | 'tomorrow') => string): string {
  if (date === today) return t('today');
  if (date === addDays(today, 1)) return t('tomorrow');
  return new Date(date + 'T12:00:00Z').toLocaleDateString(localeOf(lang), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function repeatLabel(ctx: Ctx, r: EventRepeat): string {
  if (r.freq === 'daily') return ctx.t('evEveryDay');
  if (r.freq === 'weekdays') return ctx.t('evEveryWeekday');
  const days = r.days?.length ? r.days : [];
  const names = days.map((d) => new Date(Date.UTC(2026, 10, 1 + d, 12)).toLocaleDateString(localeOf(ctx.lang), { weekday: 'long', timeZone: 'UTC' }));
  return ctx.t('evEveryDays', { days: names.join(', ') || '…' });
}

/** The first reminder moment that is still ahead, as a clock label in the event's zone; null = none will fire. */
export function nudgeLabel(ev: Meeting, now: number): string | null {
  const next = nextStart(ev, now);
  if (!next) return null;
  const fires = ev.reminderMinutes.map((m) => next.startMs - m * 60_000).filter((f) => f > now + 5_000).sort((a, b) => a - b);
  return fires.length ? clock(localHm(fires[0], ev.tz)) : null;
}

const shortName = (title: string) => clip(title, 24).toLowerCase();

/** The reply for a set event: "📅 *Physio* — today, 4:30–5:30 PM" + the nudge line and how to cancel. */
export function formatEventSet(ctx: Ctx, ev: Meeting, now: number): string {
  const first = currentOrNext(ev, now) ?? { startMs: Date.parse(ev.startAt), endMs: Date.parse(ev.endAt) };
  const range = rangeLabel(localHm(first.startMs, ev.tz), localHm(first.endMs, ev.tz));
  const wordDay = (ms: number) => dayWord(ctx.lang, localDay(ms, ev.tz), ctx.today, (k) => ctx.t(k));
  const nudge = nudgeLabel(ev, now);
  const name = shortName(ev.title);
  const tail = nudge ? ctx.t('evNudge', { at: nudge, name }) : ctx.t('evNoNudge', { name });
  if (ev.repeat) {
    return [
      ctx.t('evSet', { title: ev.title, when: repeatLabel(ctx, ev.repeat), range }),
      ctx.t('evNext', { when: wordDay(first.startMs), range }),
      tail,
    ].join('\n');
  }
  return [ctx.t('evSet', { title: ev.title, when: wordDay(first.startMs), range }), tail].join('\n');
}

export function formatEventList(ctx: Ctx, items: EventItem[]): string {
  if (!items.length) return ctx.t('evListNone');
  const rows = items.map((it, i) => {
    const s = Date.parse(it.next!.startAt);
    const range = rangeLabel(localHm(s, it.tz), localHm(Date.parse(it.next!.endAt), it.tz));
    const day = dayWord(ctx.lang, localDay(s, it.tz), ctx.today, (k) => ctx.t(k));
    return `${i + 1}. *${it.title}* · ${day} ${range}${it.repeat ? ` · ${repeatLabel(ctx, it.repeat)}` : ''}`;
  });
  return [ctx.t('evListHead'), ...rows].join('\n');
}

// ---------- creating ----------

export interface EventDraft {
  title: string;
  /** Local "YYYY-MM-DD" + "HH:mm". */
  date: string;
  time: string;
  durationMin?: number;
  repeat?: EventRepeat;
  notes?: string;
  location?: string;
  remindBeforeMin?: number;
}

const WD_NAMES: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** Model args of create_event -> a draft, or null when the title / start cannot be used. */
export function draftFromArgs(a: Record<string, unknown>): EventDraft | null {
  const title = str(a.title);
  const start = validWhen(a.start);
  if (!title || !start || !start.includes('T')) return null;
  const [date, time] = start.split('T');
  const dur = num(a.duration_min);
  const freq = str(a.repeat);
  const days = (Array.isArray(a.repeat_days) ? a.repeat_days : []).map((d) => WD_NAMES[String(d).toLowerCase().slice(0, 3)]).filter((d) => d !== undefined);
  const until = str(a.repeat_until);
  const repeat = freq ? normalizeRepeat({ freq, ...(days.length ? { days } : {}), ...(until ? { until } : {}) }) : undefined;
  const before = num(a.remind_before_min);
  return {
    title: title.slice(0, 200), date, time,
    ...(dur && dur >= 5 && dur <= 1440 ? { durationMin: Math.round(dur) } : {}),
    ...(repeat ? { repeat } : {}),
    ...(str(a.notes) ? { notes: str(a.notes)!.slice(0, 2000) } : {}),
    ...(str(a.location) ? { location: str(a.location)!.slice(0, 200) } : {}),
    ...(before != null && before >= 0 && before <= 7 * 1440 ? { remindBeforeMin: Math.round(before) } : {}),
  };
}

/**
 * A timed add_tasks item that the rules call an event ("class 4pm for 45 min", "physio 4:30pm today") -> a draft. null = stays a task.
 * Parked, already-done, deadline-only and unreadable-repeat items always stay tasks.
 */
export function draftFromItem(it: { text: string; when?: string; durationMin?: number; recurrenceText?: string; alreadyDone?: boolean; parked?: boolean; dueDate?: number }): EventDraft | null {
  if (it.alreadyDone || it.parked || !it.when?.includes('T')) return null;
  const [date, time] = it.when.split('T');
  let repeat: EventRepeat | undefined;
  if (it.recurrenceText) {
    repeat = parseRepeat(it.recurrenceText).repeat;
    if (!repeat) return null; // "every 2 weeks" and the like stay a repeating TASK
  }
  if (classifyItem({ title: it.text, hasTime: true, durationStated: !!it.durationMin }) !== 'event') return null;
  return { title: it.text.trim().slice(0, 200), date, time, ...(it.durationMin ? { durationMin: it.durationMin } : {}), ...(repeat ? { repeat } : {}) };
}

/** Create the event and return the reply lines. Never throws: failures are reported in the user's language. */
export async function createEventFromDraft(ctx: Ctx, draft: EventDraft): Promise<string[]> {
  const ev = ctx.d.events;
  if (!ev) return [ctx.t('evUnavailable')];
  const tz = ctx.tz || DEFAULT_MEETING_TZ;
  const now = ctx.d.now();
  try {
    const { event } = await ev.create(ctx.uid, {
      title: draft.title,
      start: `${draft.date} ${draft.time}`,
      tz,
      durationMin: draft.durationMin ?? EVENT_DEFAULT_DURATION_MIN,
      ...(draft.repeat ? { repeat: draft.repeat } : {}),
      ...(draft.notes ? { notes: draft.notes } : {}),
      ...(draft.location ? { location: draft.location } : {}),
      ...(draft.remindBeforeMin !== undefined ? { reminderMinutes: draft.remindBeforeMin > 0 ? [draft.remindBeforeMin] : [] } : {}),
      createdVia: 'bot',
    }, now);
    return [formatEventSet(ctx, event, now)];
  } catch (e) {
    if (ev.isBadRequest(e) && /past/.test((e as Error).message)) return [ctx.t('evPast')];
    console.error('[bot] create event failed', (e as Error).message);
    return [ctx.t('evFailed')];
  }
}

// ---------- finding, cancelling, moving ----------

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Events whose title matches `ref`: exact, else contains, else the ref contains the title. Soonest first. */
export function matchEvents(items: EventItem[], ref: string): EventItem[] {
  const r = norm(ref);
  if (!r) return [];
  const exact = items.filter((i) => norm(i.title) === r);
  if (exact.length) return exact;
  const part = items.filter((i) => { const t = norm(i.title); return t.includes(r) || (t.length >= 3 && r.includes(t)); });
  return part;
}

type Found = { it: EventItem } | { lines: string[] };

async function find(ctx: Ctx, ref: string): Promise<Found> {
  const ev = ctx.d.events;
  if (!ev) return { lines: [ctx.t('evUnavailable')] };
  const items = await ev.listUpcoming(ctx.uid, 50, ctx.d.now());
  const hits = matchEvents(items, ref);
  if (!hits.length) return { lines: [ctx.t('evNotFound', { name: clip(ref, 40) })] };
  if (hits.length > 1) {
    const list = hits.slice(0, 4).map((h) => `*${h.title}* (${dayWord(ctx.lang, localDay(Date.parse(h.next!.startAt), h.tz), ctx.today, (k) => ctx.t(k))} ${clock(localHm(Date.parse(h.next!.startAt), h.tz))})`).join(', ');
    return { lines: [ctx.t('evWhich', { list })] };
  }
  return { it: hits[0] };
}

export async function cancelEventByRef(ctx: Ctx, ref: string): Promise<string[]> {
  const f = await find(ctx, ref);
  if ('lines' in f) return f.lines;
  const ev = ctx.d.events!;
  try {
    const r = await ev.cancel(ctx.uid, f.it.id, {}, ctx.d.now());
    if (!r) return [ctx.t('evNotFound', { name: clip(ref, 40) })];
    const s = Date.parse(f.it.next!.startAt);
    const when = `${dayWord(ctx.lang, localDay(s, f.it.tz), ctx.today, (k) => ctx.t(k))}, ${rangeLabel(localHm(s, f.it.tz), localHm(Date.parse(f.it.next!.endAt), f.it.tz))}`;
    return [f.it.repeat ? ctx.t('evCancelledSeries', { title: f.it.title, rule: repeatLabel(ctx, f.it.repeat) }) : ctx.t('evCancelled', { title: f.it.title, when })];
  } catch (e) {
    console.error('[bot] cancel event failed', (e as Error).message);
    return [ctx.t('evFailed')];
  }
}

export async function moveEventByRef(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  const ref = str(a.ref) ?? '';
  const f = await find(ctx, ref);
  if ('lines' in f) return f.lines;
  const it = f.it;
  const tz = it.tz;
  const start = validWhen(a.start);
  const dur = num(a.duration_min);
  const patch: { start?: string; durationMin?: number } = {};
  if (start?.includes('T')) {
    const [date, time] = start.split('T');
    if (it.repeat) {
      // A series keeps its days: only the time of day moves (the date part of the request is ignored).
      if (date !== localDay(Date.parse(it.next!.startAt), tz) && weekdayOfDate(date) !== weekdayOfDate(localDay(Date.parse(it.next!.startAt), tz))) return [ctx.t('evSeriesMove')];
      patch.start = `${localDay(Date.parse(it.startAt), tz)} ${time}`;
    } else patch.start = `${date} ${time}`;
  }
  if (dur && dur >= 5 && dur <= 1440) patch.durationMin = Math.round(dur);
  if (!patch.start && !patch.durationMin) return [ctx.t('evFailed')];
  try {
    const moved = await ctx.d.events!.update(ctx.uid, it.id, patch, ctx.d.now());
    if (!moved) return [ctx.t('evNotFound', { name: clip(ref, 40) })];
    const o = currentOrNext(moved, ctx.d.now()) ?? { startMs: Date.parse(moved.startAt), endMs: Date.parse(moved.endAt) };
    const when = dayWord(ctx.lang, localDay(o.startMs, moved.tz), ctx.today, (k) => ctx.t(k));
    return [ctx.t('evMoved', { title: moved.title, when, range: rangeLabel(localHm(o.startMs, moved.tz), localHm(o.endMs, moved.tz)) })];
  } catch (e) {
    if (ctx.d.events!.isBadRequest(e) && /past/.test((e as Error).message)) return [ctx.t('evPast')];
    console.error('[bot] move event failed', (e as Error).message);
    return [ctx.t('evFailed')];
  }
}

export async function listEventsText(ctx: Ctx): Promise<string> {
  const ev = ctx.d.events;
  if (!ev) return ctx.t('evUnavailable');
  return formatEventList(ctx, await ev.listUpcoming(ctx.uid, 8, ctx.d.now()));
}

export const EVENT_USAGE = 'Set an event like this: /event physio today 4:30pm for 1 hour (or every tuesday 6pm for repeats). /events lists them.';

/** "/event <text>": always an EVENT (a stated length or the default hour). Reads plain English first, then asks the model. */
export async function addEventCommand(ctx: Ctx, text: string): Promise<void> {
  if (!ctx.d.events) { await ctx.text(ctx.t('evUnavailable')); return; }
  if (!text.trim()) { await ctx.text(await listEventsText(ctx)); return; }
  let draft: EventDraft | null = null;
  const p = parseEventText(text, { today: ctx.today, time: ctx.time, tz: ctx.tz });
  if (p) draft = { title: p.title, date: p.date, time: p.time, ...(p.durationMin ? { durationMin: p.durationMin } : {}), ...(p.repeat ? { repeat: p.repeat } : {}) };
  if (!draft) {
    try {
      const weekday = new Date(ctx.today + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      const res = await ctx.d.gemini({
        system: systemFor(ctx.link.coach),
        user: [{ text: `The user sent the /event command. Call create_event with the title, start (in their zone) and only what the text states. Call nothing else.

Event text:
${text}

Local date ${ctx.today} (${weekday}), local time ${ctx.time}, zone ${ctx.tz}.` }],
        tools: EVENT_TOOLS.filter((t) => t.name === 'create_event'),
      });
      const call = res.calls.find((c) => c.name === 'create_event');
      if (call) draft = draftFromArgs(call.args ?? {});
    } catch (e) {
      console.error('[bot] /event parse failed', (e as Error).message);
    }
  }
  if (!draft) { await ctx.text(`I could not read a title and a time from that.\n${EVENT_USAGE}`); return; }
  await ctx.text((await createEventFromDraft(ctx, draft)).join('\n'));
}

// ---------- the no-model fast path ----------

/**
 * Plain English "physio today 4:30pm for 1 hour" / "cancel physio" with no model call. Returns true when it handled the message.
 * Anything it is not sure about (a list, another language, an unknown title for cancel) returns false and goes to Gemini.
 */
export async function eventFast(ctx: Ctx, text: string | undefined): Promise<boolean> {
  if (!ctx.d.events || !text || text.includes('?')) return false;
  const cancelRef = parseCancelText(text);
  if (cancelRef) {
    const items = await ctx.d.events.listUpcoming(ctx.uid, 50, ctx.d.now());
    if (!matchEvents(items, cancelRef).length) return false; // maybe a task or a meeting: the model decides
    await ctx.text((await cancelEventByRef(ctx, cancelRef)).join('\n'));
    return true;
  }
  const p = parseEventText(text, { today: ctx.today, time: ctx.time, tz: ctx.tz });
  if (!p || p.kind !== 'event') return false;
  await ctx.text((await createEventFromDraft(ctx, { title: p.title, date: p.date, time: p.time, ...(p.durationMin ? { durationMin: p.durationMin } : {}), ...(p.repeat ? { repeat: p.repeat } : {}) })).join('\n'));
  return true;
}
