// Google REST for the meeting-notes feature (Drive read + Calendar insert) as ibrahim@iskaria.com. Server-only, pure
// apart from the injected fetch, so tests never touch the network.
// Env: ISK_CLIENT_ID, ISK_CLIENT_SECRET, ISK_REFRESH_TOKEN (scopes drive.readonly + calendar.events, from the PUBLISHED
// "Iskaria" OAuth app, so the refresh token does not expire after 7 days). No token = the feature is a silent no-op.
import { createHash } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const CAL = 'https://www.googleapis.com/calendar/v3';

export interface DriveNote { id: string; name: string; createdTime: string }

export interface CalendarEventInput {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm; missing = all-day */
  time?: string;
  notes?: string;
  timeZone: string;
  /** Stable key (draft doc id + index): the Calendar event id is derived from it, so a retry cannot duplicate. */
  key: string;
}

export type CalendarResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'api_disabled' | 'error'; message: string };

export interface GoogleApi {
  listNotes(): Promise<DriveNote[]>;
  /** Plain text of a Doc, or null when the export failed (retry later). */
  exportText(id: string): Promise<string | null>;
  createEvent(ev: CalendarEventInput): Promise<CalendarResult>;
}

export interface GoogleCfg { clientId: string; clientSecret: string; refreshToken: string }

export function cfgFromEnv(env: Record<string, string | undefined> = process.env): GoogleCfg | null {
  const clientId = env.ISK_CLIENT_ID, clientSecret = env.ISK_CLIENT_SECRET, refreshToken = env.ISK_REFRESH_TOKEN;
  return clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : null;
}

/** Parse a Drive `files.list` body into notes (ignores malformed rows). */
export function parseNotesList(json: unknown): DriveNote[] {
  const files = (json as { files?: unknown })?.files;
  if (!Array.isArray(files)) return [];
  const out: DriveNote[] = [];
  for (const f of files) {
    const o = f as { id?: unknown; name?: unknown; createdTime?: unknown };
    if (typeof o?.id === 'string' && o.id && typeof o.name === 'string') {
      out.push({ id: o.id, name: o.name, createdTime: typeof o.createdTime === 'string' ? o.createdTime : '' });
    }
  }
  return out;
}

/** Calendar event ids are base32hex (0-9a-v), 5-1024 chars: a sha1 hex digest qualifies. */
export function eventIdFor(key: string): string {
  return createHash('sha1').update(key).digest('hex');
}

function addOneDay(date: string): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** All-day when there is no time; else a one-hour event in `timeZone` (wall-clock strings, so no offset maths). */
export function eventBody(ev: CalendarEventInput) {
  let start: Record<string, string>, end: Record<string, string>;
  if (ev.time) {
    const [h, m] = ev.time.split(':').map(Number);
    const endH = h + 1;
    const endDate = endH >= 24 ? addOneDay(ev.date) : ev.date;
    const hh = String(endH % 24).padStart(2, '0');
    start = { dateTime: `${ev.date}T${ev.time}:00`, timeZone: ev.timeZone };
    end = { dateTime: `${endDate}T${hh}:${String(m).padStart(2, '0')}:00`, timeZone: ev.timeZone };
  } else {
    start = { date: ev.date };
    end = { date: addOneDay(ev.date) };
  }
  return {
    id: eventIdFor(ev.key),
    summary: ev.title,
    ...(ev.notes ? { description: ev.notes } : {}),
    start,
    end,
    reminders: { useDefault: true },
    // No attendees on purpose: nobody is emailed.
  };
}

/** The Calendar API is off in the GCP project (a one-time console switch), as opposed to a transient failure. */
export function isApiDisabled(status: number, body: string): boolean {
  return status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used in project/i.test(body);
}

export function makeGoogle(cfg: GoogleCfg, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): GoogleApi {
  let cached: { token: string; exp: number } | null = null;
  async function token(): Promise<string> {
    if (cached && cached.exp > now() + 60_000) return cached.token;
    const res = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken, grant_type: 'refresh_token',
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !j.access_token) throw new Error(`google token refresh failed (${res.status} ${j.error ?? ''})`);
    cached = { token: j.access_token, exp: now() + (j.expires_in ?? 3600) * 1000 };
    return cached.token;
  }
  const auth = async () => ({ authorization: `Bearer ${await token()}` });

  return {
    async listNotes() {
      const q = "mimeType='application/vnd.google-apps.document' and name contains 'Notes by Gemini' and trashed=false";
      const res = await fetchImpl(
        `${DRIVE}/files?${new URLSearchParams({ q, orderBy: 'createdTime desc', pageSize: '30', fields: 'files(id,name,createdTime)' })}`,
        { headers: await auth() },
      );
      if (!res.ok) throw new Error(`drive list failed (${res.status})`);
      return parseNotesList(await res.json());
    },
    async exportText(id) {
      try {
        const res = await fetchImpl(`${DRIVE}/files/${encodeURIComponent(id)}/export?mimeType=text/plain`, { headers: await auth() });
        return res.ok ? await res.text() : null;
      } catch {
        return null;
      }
    },
    async createEvent(ev) {
      try {
        const res = await fetchImpl(`${CAL}/calendars/primary/events`, {
          method: 'POST',
          headers: { ...(await auth()), 'content-type': 'application/json' },
          body: JSON.stringify(eventBody(ev)),
        });
        const text = await res.text();
        const id = eventIdFor(ev.key);
        if (res.ok) return { ok: true, id };
        if (res.status === 409) return { ok: true, id }; // same id already exists: an earlier try created it
        if (isApiDisabled(res.status, text)) return { ok: false, reason: 'api_disabled', message: text.slice(0, 300) };
        return { ok: false, reason: 'error', message: `calendar ${res.status}` };
      } catch (e) {
        return { ok: false, reason: 'error', message: (e as Error).message };
      }
    },
  };
}
