// Which tasks become calendar events, and what they look like. PURE: shared by the ICS feed (lib/server/ics.ts) and the
// Google Calendar sync (lib/server/googleCal.ts), so both show exactly the same thing.
//
// A task becomes an event only when it has a real time (a bare "today" task would flood the calendar):
//   1. deferredTo "YYYY-MM-DDTHH:mm" (the bot's slotted time, "gym 6pm") in the user's zone -> a TIMED event (30 min).
//   2. else remindFor (the time a reminder is about) -> a timed event.
//   3. else dueDate with a real time -> a short timed event; dueDate at 23:59 local = a date-only deadline -> ALL-DAY "Due: ..." event.
// Not shown: completed, deleted, recurring templates (their instances are separate tasks), tasks with no time, and
// anything outside the window (yesterday .. +90 days).
import type { Task } from '@/lib/types';
import { zonedToMs } from '../bot/format';

export const EVENT_MINUTES = 30;
export const WINDOW_PAST_DAYS = 1;
export const WINDOW_FUTURE_DAYS = 90;

export interface CalEvent {
  taskId: string;
  title: string;
  /** Unix ms for a timed event; undefined for all-day. */
  startMs?: number;
  endMs?: number;
  /** "YYYY-MM-DD" for an all-day event (end is exclusive, the day after). */
  date?: string;
  notes?: string;
  /** Changes whenever anything shown changes: the sync patches only on a changed hash. */
  hash: string;
}

const DAY = 86_400_000;

/** Task text to show. `e1:` is end-to-end encrypted text the server cannot read. */
export function titleOf(task: Pick<Task, 'text'>): string {
  const t = (task.text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.startsWith('e1:')) return 'Nudge task';
  return t.length > 200 ? t.slice(0, 197) + '...' : t;
}

function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

function localDateOf(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

function localHm(ms: number, tz: string): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  return p;
}

export function eventForTask(task: Task, tz: string): CalEvent | null {
  if (task.completed || task.deleted || task.recurrence) return null;
  const title = titleOf(task);
  const notes = task.notes && !task.notes.startsWith('e1:') ? task.notes.slice(0, 1000) : undefined;
  const make = (e: Omit<CalEvent, 'taskId' | 'title' | 'notes' | 'hash'>): CalEvent => ({
    taskId: task.id, title: e.date ? `Due: ${title}` : title, notes, ...e,
    hash: fnv(JSON.stringify([e.date ? `Due: ${title}` : title, notes ?? '', e.startMs ?? '', e.endMs ?? '', e.date ?? ''])),
  });

  if (task.deferredTo && /T\d{2}:\d{2}$/.test(task.deferredTo)) {
    const ms = zonedToMs(task.deferredTo, tz);
    if (ms != null) return make({ startMs: ms, endMs: ms + EVENT_MINUTES * 60_000 });
  }
  if (task.remindFor) return make({ startMs: task.remindFor, endMs: task.remindFor + EVENT_MINUTES * 60_000 });
  if (task.dueDate) {
    if (localHm(task.dueDate, tz) === '23:59') return make({ date: localDateOf(task.dueDate, tz) });
    return make({ startMs: task.dueDate, endMs: task.dueDate + 15 * 60_000 });
  }
  return null;
}

/** Events for a user's tasks inside the window, soonest first. `now` is unix ms. */
export function eventsForTasks(tasks: Task[], tz: string, now: number): CalEvent[] {
  const from = now - WINDOW_PAST_DAYS * DAY;
  const to = now + WINDOW_FUTURE_DAYS * DAY;
  const fromDate = localDateOf(from, tz);
  const toDate = addDaysStr(localDateOf(now, tz), WINDOW_FUTURE_DAYS);
  const out: CalEvent[] = [];
  for (const t of tasks) {
    const e = eventForTask(t, tz);
    if (!e) continue;
    if (e.date ? e.date < fromDate || e.date > toDate : (e.startMs ?? 0) < from || (e.startMs ?? 0) > to) continue;
    out.push(e);
  }
  const key = (e: CalEvent) => e.startMs ?? Date.parse(e.date + 'T00:00:00Z');
  return out.sort((a, b) => key(a) - key(b) || a.taskId.localeCompare(b.taskId));
}

export { addDaysStr };
