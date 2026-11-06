/** Events: pure view helpers (no React, no Firebase). The rules live in @/lib/eventsRules (copy of lib/events/rules.ts).
 *  An event = a timed thing with a length (class, appointment): not checkable, it passes. Same behaviour as the WhatsApp bot. */
import type { CreateMeetingRequest, Meeting, UpdateEventRequest } from '@/lib/meetingsTypes';
import { occurrencesBetween, type EventRepeat } from '@/lib/eventsRules';
import { clockAt, dayKeyAt, defaultStart, fmtDuration, safeTz, wallToUtcMs } from '@/features/meetings/view';

export const EVENT_DURATIONS = [30, 45, 60, 90, 120, 180];
export const EVENT_DEFAULT_MIN = 60;
export const EVENT_REMINDER_CHOICES = [
  { min: 0, label: 'At start' }, { min: 10, label: '10 min' }, { min: 30, label: '30 min' }, { min: 60, label: '1 hour' }, { min: 1440, label: '1 day' },
];
export const EVENT_DEFAULT_REMINDERS = [30];
export const WEEKDAYS = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' }, { n: 4, short: 'Thu' }, { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 0, short: 'Sun' },
];
const DAY = 86_400_000;

export interface EventDraft {
  title: string;
  date: string; // YYYY-MM-DD, wall clock in tz
  time: string; // HH:mm
  durationMin: number;
  tz: string;
  notes: string;
  location: string;
  reminderMinutes: number[];
  /** null = does not repeat. */
  repeat: EventRepeat | null;
}

/** Next half hour, 60 minutes, 30-min nudge, no repeat. `date` (never a past day) prefills the day. */
export function newEventDraft(tz: string, date?: string, now = Date.now()): EventDraft {
  const s = defaultStart(tz, now);
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= s.date ? date : s.date;
  return {
    title: '', date: day, time: day !== s.date ? '09:00' : s.time, durationMin: EVENT_DEFAULT_MIN, tz, notes: '', location: '',
    reminderMinutes: EVENT_DEFAULT_REMINDERS, repeat: null,
  };
}

/** The draft of an existing event (its first occurrence), for editing. */
export function draftOf(m: Meeting): EventDraft {
  const tz = safeTz(m.tz);
  const startMs = Date.parse(m.startAt);
  const key = dayKeyAt(startMs, tz);
  const [h, mi] = clockParts(startMs, tz);
  return {
    title: m.title, date: key, time: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
    durationMin: Math.round((Date.parse(m.endAt) - startMs) / 60_000), tz, notes: m.notes ?? '', location: m.location ?? '',
    reminderMinutes: m.reminderMinutes ?? EVENT_DEFAULT_REMINDERS, repeat: m.repeat ?? null,
  };
}
function clockParts(at: number, tz: string): [number, number] {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(at)).split(':');
  return [Number(p[0]), Number(p[1])];
}

export function validateEvent(d: EventDraft, now = Date.now()): string | null {
  if (!d.title.trim()) return 'Give it a title.';
  if (d.title.trim().length > 120) return 'Keep the title under 120 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.time)) return 'Pick a date and a start time.';
  if (!d.repeat && wallToUtcMs(d.date, d.time, d.tz) <= now) return 'That time has passed.';
  if (d.repeat?.freq === 'weekly' && d.repeat.days && d.repeat.days.length === 0) return 'Pick at least one day.';
  return null;
}

export function toEventBody(d: EventDraft): CreateMeetingRequest {
  return {
    title: d.title.trim(),
    start: new Date(wallToUtcMs(d.date, d.time, d.tz)).toISOString(),
    durationMin: d.durationMin,
    tz: d.tz,
    notes: d.notes.trim() || undefined,
    location: d.location.trim() || undefined,
    reminderMinutes: d.reminderMinutes,
    repeat: d.repeat ?? undefined,
    createdVia: 'app',
    kind: 'event',
  };
}

/** Only what changed against `orig`: a title edit never re-anchors a series. */
export function toEventPatch(d: EventDraft, orig: EventDraft): UpdateEventRequest {
  const p: UpdateEventRequest = {};
  if (d.title.trim() !== orig.title) p.title = d.title.trim();
  if (d.date !== orig.date || d.time !== orig.time || d.tz !== orig.tz) { p.start = new Date(wallToUtcMs(d.date, d.time, d.tz)).toISOString(); p.tz = d.tz; }
  if (d.durationMin !== orig.durationMin) p.durationMin = d.durationMin;
  if (d.notes.trim() !== orig.notes.trim()) p.notes = d.notes.trim() || null;
  if (d.location.trim() !== orig.location.trim()) p.location = d.location.trim() || null;
  if (JSON.stringify([...d.reminderMinutes].sort()) !== JSON.stringify([...orig.reminderMinutes].sort())) p.reminderMinutes = d.reminderMinutes;
  if (JSON.stringify(d.repeat) !== JSON.stringify(orig.repeat)) p.repeat = d.repeat;
  return p;
}

export function repeatLabel(r?: EventRepeat | null): string {
  if (!r) return 'Does not repeat';
  if (r.freq === 'daily') return 'Every day';
  if (r.freq === 'weekdays') return 'Every weekday';
  const names = (r.days ?? []).map((n) => WEEKDAYS.find((w) => w.n === n)?.short).filter(Boolean);
  return names.length ? `Every ${names.join(', ')}` : 'Every week';
}

// ---- occurrences ----------------------------------------------------------------------------------------------------

export interface EventOcc { event: Meeting; startMs: number; endMs: number; date: string }

/** Live events' occurrences overlapping [fromMs, toMs), soonest first. Repeats are expanded, cancelled days skipped. */
export function occurrencesOf(events: Meeting[], fromMs: number, toMs: number): EventOcc[] {
  const out: EventOcc[] = [];
  for (const e of events) {
    if (e.kind !== 'event' || e.status !== 'scheduled') continue;
    for (const o of occurrencesBetween({ startAt: e.startAt, endAt: e.endAt, tz: safeTz(e.tz), repeat: e.repeat, exceptions: e.exceptions }, fromMs, toMs, 120)) {
      out.push({ event: e, startMs: o.startMs, endMs: o.endMs, date: o.date });
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs || a.event.id.localeCompare(b.event.id));
}

/** Events happening on a calendar day (a "YYYY-MM-DD" in `zone`), by their start day. */
export function eventsOnDay(events: Meeting[], date: string, zone: string): EventOcc[] {
  const mid = wallToUtcMs(date, '12:00', zone);
  return occurrencesOf(events, mid - DAY, mid + DAY).filter((o) => dayKeyAt(o.startMs, zone) === date);
}

/** Running now or starting within `hours` (the Today block). */
export function soonEvents(events: Meeting[], now: number, hours = 48): EventOcc[] {
  return occurrencesOf(events, now, now + hours * 3_600_000);
}

export const rangeText = (startMs: number, endMs: number, zone: string) => `${clockAt(startMs, zone)} – ${clockAt(endMs, zone)}`;
export const lengthText = (o: Pick<EventOcc, 'startMs' | 'endMs'>) => fmtDuration(Math.round((o.endMs - o.startMs) / 60_000));
