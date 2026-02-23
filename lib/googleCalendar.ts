/**
 * Google Calendar API helpers
 * Uses Google Identity Services (gis) for OAuth - load script: https://accounts.google.com/gsi/client
 */

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

export const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token: string; expires_in?: number }) => void;
          }) => { requestAccessToken: (options?: { prompt?: string }) => void };
        };
      };
    };
  }
}

export interface TokenClientConfig {
  clientId: string;
  onToken: (accessToken: string, expiresIn?: number) => void;
}

export function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
    return new Promise((resolve) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        const check = setInterval(() => {
          if (window.google?.accounts?.oauth2) {
            clearInterval(check);
            resolve();
          }
        }, 50);
      }
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
}

export function requestCalendarAccessToken(config: TokenClientConfig): void {
  const { clientId, onToken } = config;
  if (!window.google?.accounts?.oauth2) {
    console.error('Google Identity Services not loaded');
    return;
  }
  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_CALENDAR_SCOPES,
    callback: (response) => {
      onToken(response.access_token, response.expires_in);
    },
  });
  client.requestAccessToken({ prompt: 'consent' });
}

export interface CalendarListResponse {
  items: Array<{
    id: string;
    summary: string;
    primary?: boolean;
    backgroundColor?: string;
    foregroundColor?: string;
  }>;
}

export async function fetchCalendarList(accessToken: string): Promise<CalendarListResponse> {
  const res = await fetch(`${GOOGLE_CALENDAR_API_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch calendar list');
  return res.json();
}

export interface CalendarEventItem {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
  htmlLink?: string;
}

export interface EventsResponse {
  items?: CalendarEventItem[];
}

export async function fetchEvents(
  accessToken: string,
  calendarIds: string[],
  timeMin: string,
  timeMax: string
): Promise<(CalendarEventItem & { calendarId?: string })[]> {
  const all: (CalendarEventItem & { calendarId?: string })[] = [];
  for (const calId of calendarIds) {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
    });
    const res = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) continue;
    const data: EventsResponse = await res.json();
    if (data.items) {
      all.push(...data.items.map((item) => ({ ...item, calendarId: calId })));
    }
  }
  return all.sort((a, b) => {
    const aStart = a.start?.dateTime || a.start?.date || '';
    const bStart = b.start?.dateTime || b.start?.date || '';
    return aStart.localeCompare(bStart);
  });
}

export async function createEvent(
  accessToken: string,
  calendarId: string,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
  }
): Promise<CalendarEventItem> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    let msg = 'Failed to create event';
    try {
      const parsed = JSON.parse(errText);
      msg = parsed?.error?.message || parsed?.message || errText || msg;
    } catch {
      msg = errText || msg;
    }
    if (/insufficient|403|authentication scope/i.test(msg)) {
      msg = 'Insufficient permissions. Disconnect and reconnect Google Calendar in Settings → Integrations.';
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<{
    summary: string;
    description: string;
    location: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
  }>
): Promise<CalendarEventItem> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    let msg = 'Failed to update event';
    try {
      const parsed = JSON.parse(errText);
      msg = parsed?.error?.message || parsed?.message || errText || msg;
    } catch {
      msg = errText || msg;
    }
    if (/insufficient|403|authentication scope/i.test(msg)) {
      msg = 'Insufficient permissions. Disconnect and reconnect Google Calendar in Settings → Integrations.';
    }
    throw new Error(msg);
  }
  return res.json();
}

export async function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const res = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok && res.status !== 204) {
    const errText = await res.text();
    let msg = 'Failed to delete event';
    try {
      const parsed = JSON.parse(errText);
      msg = parsed?.error?.message || parsed?.message || errText || msg;
    } catch {
      msg = errText || msg;
    }
    if (/insufficient|403|permission|forbidden/i.test(msg)) {
      msg = 'Insufficient permissions. Disconnect and reconnect Google Calendar in Settings → Integrations.';
    }
    throw new Error(msg);
  }
}
