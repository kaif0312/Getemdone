/** Date labels and month grids for Progress (all in 'YYYY-MM-DD', Monday-first like the weekly summary). */
import { addDays, dayOfWeek, daysBetween } from '@/lib/dates';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday-first single letters. */
export const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface YearMonth {
  y: number;
  m: number; // 0-11
}

export function ymOf(date: string): YearMonth {
  return { y: Number(date.slice(0, 4)), m: Number(date.slice(5, 7)) - 1 };
}

export function shiftMonth(ym: YearMonth, by: number): YearMonth {
  const t = ym.y * 12 + ym.m + by;
  return { y: Math.floor(t / 12), m: ((t % 12) + 12) % 12 };
}

export function monthLabel(ym: YearMonth): string {
  return `${MONTHS[ym.m]} ${ym.y}`;
}

export function ymKey(ym: YearMonth): string {
  return `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`;
}

/** Rows of 7 cells, Monday first; null pads before the 1st and after the last day. */
export function monthGrid(ym: YearMonth): (string | null)[][] {
  const first = `${ymKey(ym)}-01`;
  const lead = (dayOfWeek(first) + 6) % 7;
  const count = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 0; d < count; d++) cells.push(addDays(first, d));
  while (cells.length % 7) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** "Mon 3 Nov" */
export function dayLabel(date: string): string {
  return `${DOW_SHORT[dayOfWeek(date)]} ${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1].slice(0, 3)}`;
}

/** "Today" / "Yesterday" / "Mon 3 Nov" */
export function relativeDay(date: string, today: string): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return dayLabel(date);
}
