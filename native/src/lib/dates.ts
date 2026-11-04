/**
 * Date helpers in an explicit IANA time zone.
 * Ported from lib/server/users.ts (localDate/addDays/daysBetween/dayOfWeek). Date strings are 'YYYY-MM-DD'.
 * The bot/server use `users.timezone` (default Asia/Kolkata); the PWA uses the browser's zone. `userZone()` = the
 * profile zone when set, else the device zone, so screens and the bot agree for anyone who linked WhatsApp.
 */

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

export function isValidZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function deviceZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (isValidZone(z)) return z;
  } catch {
    /* ignore */
  }
  return DEFAULT_TIMEZONE;
}

/** The zone to use for "today" for this user. */
export function userZone(profileZone?: string | null): string {
  return isValidZone(profileZone) ? profileZone : deviceZone();
}

function parts(timezone: string, at: number): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: isValidZone(timezone) ? timezone : DEFAULT_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(at))) out[p.type] = p.value;
  if (out.hour === '24') out.hour = '00';
  return out;
}

/** 'YYYY-MM-DD' for `at` (ms, default now) in the zone. */
export function localDate(timezone: string, at: number = Date.now()): string {
  const p = parts(timezone, at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'HH:mm' for `at` in the zone. */
export function localTime(timezone: string, at: number = Date.now()): string {
  const p = parts(timezone, at);
  return `${p.hour}:${p.minute}`;
}

function toUtcDay(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(dateStr: string, n: number): string {
  const t = new Date(toUtcDay(dateStr) + n * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDay(b) - toUtcDay(a)) / 86400000);
}

/** 0=Sun..6=Sat */
export function dayOfWeek(dateStr: string): number {
  return new Date(toUtcDay(dateStr)).getUTCDay();
}

/** Monday of the week containing dateStr. */
export function weekStart(dateStr: string): string {
  return addDays(dateStr, -((dayOfWeek(dateStr) + 6) % 7));
}

/** Last n dates ending at `end` (inclusive), oldest first. */
export function lastNDates(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - (n - 1)));
}
