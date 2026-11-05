/**
 * Calendar sync API (server: app/api/app/calendar/route.ts in the web app, docs/CALENDAR.md). Bearer = Firebase ID token.
 *   GET  -> CalendarStatus
 *   POST { action: 'feed.create'|'feed.rotate'|'feed.remove'|'google.sync'|'google.disconnect' } -> CalendarStatus
 *   POST { action: 'google.start' } -> { url }   open it in the browser; it ends on nudge://me/calendar?connected=1
 */
import { auth } from './firebase';
import { API_BASE } from './config';

export interface CalendarStatus {
  feed: { url: string; webcalUrl: string } | null;
  google: { connected: boolean; email?: string; lastSyncAt?: number; error?: string; needsReconnect?: boolean };
  googleAvailable: boolean;
}

export type CalendarAction = 'feed.create' | 'feed.rotate' | 'feed.remove' | 'google.sync' | 'google.disconnect';

export class CalendarApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function call<T>(method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new CalendarApiError('unauthorized', 401);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000); // a sync can touch Google up to 60 times
  try {
    const res = await fetch(`${API_BASE}/api/app/calendar`, {
      method,
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new CalendarApiError(json.error ?? 'failed', res.status);
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export const getCalendarStatus = () => call<CalendarStatus>('GET');
export const calendarAction = (action: CalendarAction) => call<CalendarStatus>('POST', { action });
export const startGoogleConnect = () => call<{ url: string }>('POST', { action: 'google.start' }).then((r) => r.url);

/** "Add by URL" link that opens Google Calendar's subscribe dialog in the browser (works on Android and iOS). */
export const googleSubscribeUrl = (webcalUrl: string) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
