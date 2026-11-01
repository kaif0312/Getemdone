// Pure helpers: dates in a user's zone, text clipping, message formatting.
import type { Task } from '@/lib/types';

export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, Math.max(0, n - 1)).trimEnd() + '…';
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): string {
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

function tzOffsetMs(ts: number, tz: string): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(ts))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" in `tz` -> unix ms. Date-only means end of that day (23:59). null if malformed. */
export function zonedToMs(s: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59);
  if (Number.isNaN(guess)) return null;
  let t = guess - tzOffsetMs(guess, tz);
  const off2 = tzOffsetMs(t, tz);
  t = guess - off2;
  return t;
}

export function validWhen(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  return /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(t) ? t : undefined;
}

export function validTime(s: unknown): string | undefined {
  if (typeof s !== 'string') return undefined;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return undefined;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Short human label for a task's schedule: "6:00 PM", "Fri 7 Nov", "" for plain today. */
export function whenLabel(deferredTo: string | undefined, today: string): string {
  if (!deferredTo) return '';
  const [date, time] = deferredTo.split('T');
  const parts: string[] = [];
  if (date && date !== today) {
    if (date === addDays(today, 1)) parts.push('tomorrow');
    else {
      const d = new Date(date + 'T12:00:00Z');
      parts.push(d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }));
    }
  }
  if (time) parts.push(time12(time));
  return parts.join(' ');
}

export function taskLine(n: number, t: Task, today: string): string {
  const w = whenLabel(t.deferredTo, today);
  return `${n}. ${t.text}${w ? ` (${w})` : ''}`;
}

export function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

export function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}
