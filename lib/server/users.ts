// OWNER: agent "domain". User lookups + timezone helpers (server only).
import type { User } from '@/lib/types';

export interface UserLite { uid: string; displayName: string; friends: string[]; timezone: string; notificationSettings?: User['notificationSettings']; }

/** Load a user; timezone falls back to 'Asia/Kolkata'. */
export async function getUserLite(uid: string): Promise<UserLite | null> { throw new Error('TODO ' + uid); }
/** "YYYY-MM-DD" for `at` (ms, default now) in an IANA zone. Same format as utils/taskFilter getTodayString. */
export function localDate(timezone: string, at: number = Date.now()): string { throw new Error('TODO ' + timezone + at); }
/** "HH:mm" local time. */
export function localTime(timezone: string, at: number = Date.now()): string { throw new Error('TODO ' + timezone + at); }
/** Best-guess IANA zone from a wa_id's country code (91 -> Asia/Kolkata, 965 -> Asia/Kuwait, 971 -> Asia/Dubai, ...). */
export function timezoneForWaId(waId: string): string { throw new Error('TODO ' + waId); }
