// OWNER: agent "domain". User lookups + timezone helpers (server only).
import type { User } from '@/lib/types';
import { adminDb } from './firebaseAdmin';

export interface UserLite { uid: string; displayName: string; friends: string[]; timezone: string; notificationSettings?: User['notificationSettings']; }

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Raw user document (any field), or null. Server-side helper for the other domain modules. */
export async function getUserRaw(uid: string): Promise<(Partial<User> & { timezone?: string }) | null> {
  const snap = await adminDb().doc(`users/${uid}`).get();
  return snap.exists ? (snap.data() as Partial<User> & { timezone?: string }) : null;
}

/** Load a user; timezone falls back to 'Asia/Kolkata'. */
export async function getUserLite(uid: string): Promise<UserLite | null> {
  const data = await getUserRaw(uid);
  if (!data) return null;
  return {
    uid,
    displayName: data.displayName || 'Friend',
    friends: Array.isArray(data.friends) ? data.friends : [],
    timezone: validZone(data.timezone) ? data.timezone : DEFAULT_TIMEZONE,
    notificationSettings: data.notificationSettings,
  };
}

/** Timezone of a user (fallback Asia/Kolkata). */
export async function getTimezone(uid: string): Promise<string> {
  const data = await getUserRaw(uid);
  return validZone(data?.timezone) ? data!.timezone! : DEFAULT_TIMEZONE;
}

function parts(timezone: string, at: number): Record<string, string> {
  const tz = validZone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(at))) out[p.type] = p.value;
  if (out.hour === '24') out.hour = '00';
  return out;
}

/** "YYYY-MM-DD" for `at` (ms, default now) in an IANA zone. Same format as utils/taskFilter getTodayString. */
export function localDate(timezone: string, at: number = Date.now()): string {
  const p = parts(timezone, at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:mm" local time. */
export function localTime(timezone: string, at: number = Date.now()): string {
  const p = parts(timezone, at);
  return `${p.hour}:${p.minute}`;
}

/** Add `n` days to a "YYYY-MM-DD" string (pure calendar arithmetic, no zone). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from a to b ("YYYY-MM-DD"). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Day of week of "YYYY-MM-DD": 0=Sun .. 6=Sat. */
export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Re-express `at` so that the SERVER-zone wall clock reads the same as the wall clock in `timezone`.
 * utils/taskFilter turns timestamps into dates with the runtime's local zone (browser clock); on Vercel that is UTC.
 * Feeding it shifted timestamps makes it see the user's local dates.
 */
export function shiftToServerWallClock(timezone: string, at: number): number {
  const p = parts(timezone, at);
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, 0).getTime();
}

const COUNTRY_ZONES: [string, string][] = [
  ['91', 'Asia/Kolkata'], ['965', 'Asia/Kuwait'], ['971', 'Asia/Dubai'], ['966', 'Asia/Riyadh'],
  ['974', 'Asia/Qatar'], ['973', 'Asia/Bahrain'], ['968', 'Asia/Muscat'], ['44', 'Europe/London'],
  ['92', 'Asia/Karachi'], ['880', 'Asia/Dhaka'], ['20', 'Africa/Cairo'], ['60', 'Asia/Kuala_Lumpur'],
  ['65', 'Asia/Singapore'], ['61', 'Australia/Sydney'], ['94', 'Asia/Colombo'], ['977', 'Asia/Kathmandu'],
  ['962', 'Asia/Amman'], ['961', 'Asia/Beirut'], ['90', 'Europe/Istanbul'], ['49', 'Europe/Berlin'],
  ['33', 'Europe/Paris'], ['34', 'Europe/Madrid'], ['39', 'Europe/Rome'], ['27', 'Africa/Johannesburg'],
  ['234', 'Africa/Lagos'], ['254', 'Africa/Nairobi'], ['63', 'Asia/Manila'], ['62', 'Asia/Jakarta'],
  ['1', 'America/New_York'],
];

/** Best-guess IANA zone from a wa_id's country code (91 -> Asia/Kolkata, 965 -> Asia/Kuwait, 971 -> Asia/Dubai, ...). */
export function timezoneForWaId(waId: string): string {
  const digits = (waId || '').replace(/\D/g, '');
  // longest country-code prefix wins
  let best: [string, string] | null = null;
  for (const entry of COUNTRY_ZONES) {
    if (digits.startsWith(entry[0]) && (!best || entry[0].length > best[0].length)) best = entry;
  }
  return best ? best[1] : DEFAULT_TIMEZONE;
}
