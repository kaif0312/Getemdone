// Browser client for /api/meetings and /api/app/calendar (Bearer = Firebase ID token). Same shape as native meetingsApi.ts.
import { auth } from '@/lib/firebase';
import type { CalendarStatus, Meeting } from '@/lib/meetings/types';
import type { toCreateBody } from './view';

export class MeetingsApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new MeetingsApiError('unauthorized', 401);
  const token = await user.getIdToken();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(path, {
      ...init,
      cache: 'no-store',
      signal: ctl.signal,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new MeetingsApiError(typeof data.error === 'string' ? data.error : 'request_failed', res.status);
    return data as T;
  } catch (e) {
    if (e instanceof MeetingsApiError) throw e;
    throw new MeetingsApiError('network', 0);
  } finally {
    clearTimeout(timer);
  }
}

export async function listMeetings(): Promise<Meeting[]> {
  const r = await call<{ meetings?: Meeting[] }>('/api/meetings');
  return Array.isArray(r.meetings) ? r.meetings : [];
}

export interface CreateResult { meeting: Meeting; calendar: CalendarStatus }
/** Accepts both `{ meeting, calendar }` and a flat Meeting with `calendar` beside its fields. */
export async function createMeeting(body: ReturnType<typeof toCreateBody>): Promise<CreateResult> {
  const r = await call<Record<string, unknown>>('/api/meetings', { method: 'POST', body: JSON.stringify(body) });
  const calendar = (r.calendar as CalendarStatus | undefined) ?? 'not_connected';
  const meeting = (r.meeting && typeof r.meeting === 'object' ? r.meeting : (() => { const { calendar: _c, ...m } = r; return m; })()) as unknown as Meeting;
  return { meeting, calendar };
}

export async function cancelMeeting(id: string): Promise<void> {
  await call(`/api/meetings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export interface CalendarInfo { googleAvailable: boolean; google: { connected: boolean; needsReconnect?: boolean } }
export const getCalendarStatus = () => call<CalendarInfo>('/api/app/calendar');
