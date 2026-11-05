// COPY of lib/calendar/events.ts (the WhatsApp calendar images). Keep both in step: same mapping of tasks to days. Only the imports and the parkedAt skip in eventsInRange differ (add that skip to the server copy once Someday is on main).
// Pure calendar model: tasks -> events on days, and the month / week grids. No Firestore, no I/O, so tests and the
// renderer share it. All dates are "YYYY-MM-DD" in the USER's zone; weeks start on Monday.
import type { Task } from '@/lib/types';
import { dateMatchesRecurrence } from '@/lib/recurrence';

export type CalKind = 'task' | 'deadline' | 'reminder';

export interface CalEvent {
  id: string;
  text: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" in the user's zone; absent = all day. */
  time?: string;
  done: boolean;
  kind: CalKind;
  recurring?: boolean;
}

export interface CalDay {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  /** 0 = Monday ... 6 = Sunday */
  dow: number;
  events: CalEvent[];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Monday ... 6 = Sunday. */
export function dowMon(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: string, n: number): string {
  const [y, m] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-01`;
}

export function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function weekStart(date: string): string {
  return addDays(date, -dowMon(date));
}

const zoneFmt = new Map<string, Intl.DateTimeFormat>();
function zonedParts(tz: string, at: number): { date: string; time: string } {
  let f = zoneFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    zoneFmt.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Every event that falls in [from, to] (inclusive), plus how many open tasks have no date at all.
 *  - deferredTo ("YYYY-MM-DD" or "...THH:mm")   -> a task on that day (with its time, if any)
 *  - dueDate                                    -> a deadline on its day; folded into the task when both land on one day
 *  - recurrence                                 -> one event per matching day in range (done = in completedDates)
 *  - completed with no date                     -> sits on the day it was completed
 */
export function eventsInRange(tasks: Task[], tz: string, from: string, to: string): { events: CalEvent[]; undated: number } {
  const events: CalEvent[] = [];
  let undated = 0;

  for (const t of tasks) {
    if (t.deleted || t.parkedAt) continue; // parked (Someday) tasks are off the calendar, like Today
    const text = (t.text || '').trim();
    if (!text) continue;

    if (t.recurrence) {
      const r = t.recurrence;
      const time = typeof t.deferredTo === 'string' && t.deferredTo.length > 10 ? t.deferredTo.slice(11, 16) : undefined;
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (r.skippedDates?.includes(d)) continue;
        if (!dateMatchesRecurrence(r, d)) continue;
        events.push({ id: t.id, text, date: d, time, done: !!r.completedDates?.includes(d), kind: 'task', recurring: true });
      }
      continue;
    }

    const due = t.dueDate ? zonedParts(tz, t.dueDate) : null;
    let placed = false;

    if (t.deferredTo && DATE_RE.test(t.deferredTo)) {
      const date = t.deferredTo.slice(0, 10);
      const time = t.deferredTo.length > 10 ? t.deferredTo.slice(11, 16) : undefined;
      if (date >= from && date <= to) {
        events.push({ id: t.id, text, date, time: time ?? (due && due.date === date ? due.time : undefined), done: t.completed, kind: due && due.date === date ? 'deadline' : 'task' });
      }
      placed = true;
      if (due && due.date !== date && due.date >= from && due.date <= to) {
        events.push({ id: t.id, text, date: due.date, time: due.time, done: t.completed, kind: 'deadline' });
      }
    } else if (due) {
      if (due.date >= from && due.date <= to) {
        events.push({ id: t.id, text, date: due.date, time: due.time, done: t.completed, kind: 'deadline' });
      }
      placed = true;
    } else if (t.completed && t.completedAt) {
      const c = zonedParts(tz, t.completedAt);
      if (c.date >= from && c.date <= to) events.push({ id: t.id, text, date: c.date, done: true, kind: 'task' });
      placed = true;
    }

    // A reminder with no other date is still an appointment on the calendar.
    if (!placed && t.remindAt) {
      const r = zonedParts(tz, t.remindFor ?? t.remindAt);
      if (r.date >= from && r.date <= to) events.push({ id: t.id, text, date: r.date, time: r.time, done: t.completed, kind: 'reminder' });
      placed = true;
    }
    if (!placed && !t.completed) undated++;
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || Number(a.done) - Number(b.done));
  return { events, undated };
}

export interface MonthModel {
  /** First of the month, "YYYY-MM-01" */
  month: string;
  title: string;
  weeks: CalDay[][];
  total: number;
  done: number;
  busiest?: { date: string; count: number };
  undated: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_NAMES = MONTHS;
export const DOW_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function buildMonth(tasks: Task[], tz: string, today: string, offset = 0): MonthModel {
  const month = addMonths(monthStart(today), offset);
  const gridFrom = weekStart(month);
  const last = addDays(month, daysInMonth(month) - 1);
  const gridTo = addDays(weekStart(last), 6);
  const { events, undated } = eventsInRange(tasks, tz, gridFrom, gridTo);

  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e);

  const weeks: CalDay[][] = [];
  let total = 0, done = 0;
  let busiest: MonthModel['busiest'];
  for (let ws = gridFrom; ws <= gridTo; ws = addDays(ws, 7)) {
    const row: CalDay[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(ws, i);
      const evs = byDay.get(date) ?? [];
      const inMonth = date.slice(0, 7) === month.slice(0, 7);
      if (inMonth) {
        total += evs.length;
        done += evs.filter((e) => e.done).length;
        if (evs.length && (!busiest || evs.length > busiest.count)) busiest = { date, count: evs.length };
      }
      row.push({ date, inMonth, isToday: date === today, isPast: date < today, dow: i, events: evs });
    }
    weeks.push(row);
  }
  const [y, m] = month.split('-').map(Number);
  return { month, title: `${MONTHS[m - 1]} ${y}`, weeks, total, done, busiest, undated };
}

export interface WeekModel {
  from: string;
  to: string;
  title: string;
  days: CalDay[];
  total: number;
  done: number;
  undated: number;
}

export function buildWeek(tasks: Task[], tz: string, today: string, offset = 0): WeekModel {
  const from = addDays(weekStart(today), offset * 7);
  const to = addDays(from, 6);
  const { events, undated } = eventsInRange(tasks, tz, from, to);
  const days: CalDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(from, i);
    days.push({ date, inMonth: true, isToday: date === today, isPast: date < today, dow: i, events: events.filter((e) => e.date === date) });
  }
  const [, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const short = (m: number) => MONTHS[m - 1].slice(0, 3);
  const title = fm === tm ? `${short(fm)} ${fd} – ${td}, ${ty}` : `${short(fm)} ${fd} – ${short(tm)} ${td}, ${ty}`;
  return { from, to, title, days, total: events.length, done: events.filter((e) => e.done).length, undated };
}

/** A short text version of the same data: the caption under the image, and the fallback when rendering fails. */
export function agendaText(days: CalDay[], today: string, maxDays = 7, maxPerDay = 4): string {
  const label = (d: string) => {
    const [, m, dd] = d.split('-').map(Number);
    const n = d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : DOW_SHORT[dowMon(d)];
    return `${n} ${dd} ${MONTHS[m - 1].slice(0, 3)}`;
  };
  const t12 = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}${m ? ':' + pad(m) : ''}${h < 12 ? 'am' : 'pm'}`;
  };
  const out: string[] = [];
  for (const day of days) {
    if (!day.events.length) continue;
    if (out.length >= maxDays * 99) break;
    const items = day.events.slice(0, maxPerDay).map((e) =>
      `${e.done ? '✅' : e.kind === 'deadline' ? '🏁' : '•'} ${e.time ? t12(e.time) + ' ' : ''}${e.text.length > 40 ? e.text.slice(0, 39) + '…' : e.text}`);
    const more = day.events.length - maxPerDay;
    out.push(`*${label(day.date)}*\n${items.join('\n')}${more > 0 ? `\n+${more} more` : ''}`);
    if (out.length >= maxDays) break;
  }
  return out.join('\n\n');
}
