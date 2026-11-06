/**
 * Meetings API (server: app/api/meetings in the web app; contract: ./meetingsTypes.ts). Bearer = Firebase ID token.
 *   GET    /api/meetings        -> { meetings: Meeting[] }   (upcoming, owned)
 *   POST   /api/meetings        -> Meeting + { calendar }    (flat; a nested { meeting, calendar } is accepted too)
 *   DELETE /api/meetings/<id>   -> cancels (and removes the Google event)
 */
import { auth } from './firebase';
import { API_BASE } from './config';
import type { CalendarStatus, CreateMeetingRequest, Meeting } from './meetingsTypes';

export class MeetingsApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

export async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new MeetingsApiError('unauthorized', 401);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new MeetingsApiError(json.error ?? 'failed', res.status);
    return json as T;
  } catch (e) {
    if (e instanceof MeetingsApiError) throw e;
    throw new MeetingsApiError('network', 0);
  } finally {
    clearTimeout(timer);
  }
}

export const listMeetings = () => call<{ meetings: Meeting[] }>('GET', '/api/meetings').then((r) => r.meetings ?? []);

export async function createMeeting(body: CreateMeetingRequest): Promise<{ meeting: Meeting; calendar: CalendarStatus }> {
  const r = await call<Meeting & { calendar: CalendarStatus; meeting?: Meeting }>('POST', '/api/meetings', body);
  if (r.meeting) return { meeting: r.meeting, calendar: r.calendar };
  const { calendar, ...meeting } = r;
  return { meeting: meeting as Meeting, calendar };
}

export const cancelMeetingApi = (id: string) => call<unknown>('DELETE', `/api/meetings/${encodeURIComponent(id)}`);
