// Meetings (2026-11-06): a Google Calendar event with a Meet link on the OWNER's calendar, a Firestore doc the PWA / native app /
// bot can show, and reminders through the existing machinery. Contract: lib/meetings/types.ts. Docs: AGENTS.md "Meetings".
//
// Reminders: for each `reminderMinutes` value one reminder-only task (tag `meeting`, private) is created with remindAt = start -
// minutes, via addTasks -> scheduleFire (QStash exact time) and the 15-min cron safety net, so delivery (push for app users,
// WhatsApp for the rest, caps, focus mode) is exactly lib/server/reminders.ts. cancelMeeting deletes those tasks.
//
// Google: env GCAL_CLIENT_ID / GCAL_CLIENT_SECRET / GCAL_REFRESH_TOKEN (scope calendar.events), minted once with
// scripts/mint_gcal_token.mjs. Missing or failing = the meeting is still saved and reminded, meetUrl empty, calendar != 'ok'.
import { randomUUID } from 'node:crypto';
import { adminDb } from './firebaseAdmin';
import { addTasks, deleteTask } from './tasks';
import { localTime } from './users';
import { cancelAttendees, inviteAttendees } from './meetingInvites';
import {
  DEFAULT_DURATION_MIN, DEFAULT_MEETING_TZ, DEFAULT_REMINDER_MINUTES,
  type CalendarStatus, type CreateMeetingRequest, type Meeting, type MeetingAttendee,
} from '../meetings/types';

const col = () => adminDb().collection('meetings');
const GCAL = 'https://www.googleapis.com/calendar/v3';

// ---------- pure helpers ----------

export class BadRequest extends Error {}

function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** Offset (ms) of `tz` from UTC at instant `at`. */
function tzOffsetMs(tz: string, at: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(at)).reduce<Record<string, number>>((a, x) => (x.type === 'literal' ? a : { ...a, [x.type]: Number(x.value) }), {});
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

/** "2026-11-07T23:00:00+05:30" / "...Z" -> ms; "2026-11-07 23:00" (or with T) -> ms reading the wall clock in `tz`. */
export function parseStart(start: string, tz: string): number {
  const s = (start || '').trim();
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s) && /\d{2}:\d{2}/.test(s)) {
    const ms = Date.parse(s);
    if (Number.isNaN(ms)) throw new BadRequest('bad start');
    return ms;
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) throw new BadRequest('start must be ISO with offset, or "YYYY-MM-DD HH:mm"');
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let ms = wall - tzOffsetMs(tz, wall);
  ms = wall - tzOffsetMs(tz, ms); // second pass settles DST edges
  return ms;
}

export interface Normalized {
  title: string; startMs: number; endMs: number; tz: string; attendees: MeetingAttendee[]; notes?: string;
  reminderMinutes: number[]; createdVia: Meeting['createdVia'];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeRequest(b: Partial<CreateMeetingRequest>, now: number = Date.now()): Normalized {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > 200) throw new BadRequest('title required (max 200)');
  const tz = typeof b.tz === 'string' && b.tz ? b.tz : DEFAULT_MEETING_TZ;
  if (!validTz(tz)) throw new BadRequest('bad tz');
  if (typeof b.start !== 'string') throw new BadRequest('start required');
  const startMs = parseStart(b.start, tz);
  const dur = b.durationMin === undefined ? DEFAULT_DURATION_MIN : Number(b.durationMin);
  if (!Number.isFinite(dur) || dur < 5 || dur > 24 * 60) throw new BadRequest('durationMin must be 5..1440');
  if (startMs < now - 60_000) throw new BadRequest('start is in the past');
  if (!['claude-code', 'bot', 'app'].includes(b.createdVia as string)) throw new BadRequest('bad createdVia');
  const attendees = (Array.isArray(b.attendees) ? b.attendees : []).slice(0, 50).map((a) => {
    const o: MeetingAttendee = {};
    if (typeof a?.name === 'string' && a.name.trim()) o.name = a.name.trim().slice(0, 100);
    if (typeof a?.email === 'string' && a.email.trim()) {
      if (!EMAIL.test(a.email.trim())) throw new BadRequest(`bad attendee email: ${a.email}`);
      o.email = a.email.trim();
    }
    if (typeof a?.uid === 'string' && a.uid) o.uid = a.uid;
    if ((typeof a?.waId === 'string' && a.waId) || typeof a?.waId === 'number') {
      const digits = String(a.waId).replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 15) throw new BadRequest(`bad attendee phone number: ${a.waId}`);
      o.waId = digits;
    }
    if (!o.name && !o.email && !o.uid && !o.waId) throw new BadRequest('attendee needs a name, email, uid or waId');
    return o;
  });
  const rm = b.reminderMinutes === undefined ? DEFAULT_REMINDER_MINUTES : b.reminderMinutes;
  if (!Array.isArray(rm) || rm.length > 5 || rm.some((n) => !Number.isFinite(n) || n < 1 || n > 7 * 1440)) throw new BadRequest('bad reminderMinutes');
  return {
    title, startMs, endMs: startMs + dur * 60_000, tz, attendees,
    ...(typeof b.notes === 'string' && b.notes.trim() ? { notes: b.notes.trim().slice(0, 2000) } : {}),
    reminderMinutes: [...new Set(rm.map(Math.round))].sort((a, b) => b - a), createdVia: b.createdVia as Meeting['createdVia'],
  };
}

function time12(tz: string, at: number): string {
  const [h, m] = localTime(tz, at).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "Meeting with Shamly at 11:00 PM https://meet.google.com/abc-defg-hij" (the Meet link is dropped when there is none). */
export function reminderText(title: string, tz: string, startMs: number, meetUrl?: string): string {
  return `${title} at ${time12(tz, startMs)}${meetUrl ? ` ${meetUrl}` : ''}`;
}

/** Fire times (ms) still ahead of `now`; a reminder whose moment has passed is dropped. */
export function reminderFireTimes(startMs: number, minutes: number[], now: number): { minutes: number; fireAt: number }[] {
  return minutes.map((m) => ({ minutes: m, fireAt: startMs - m * 60_000 })).filter((r) => r.fireAt > now + 5_000);
}

export function calendarBody(n: Normalized, requestId: string): Record<string, unknown> {
  return {
    summary: n.title,
    ...(n.notes ? { description: n.notes } : {}),
    start: { dateTime: new Date(n.startMs).toISOString(), timeZone: n.tz },
    end: { dateTime: new Date(n.endMs).toISOString(), timeZone: n.tz },
    attendees: n.attendees.filter((a) => a.email).map((a) => ({ email: a.email, ...(a.name ? { displayName: a.name } : {}) })),
    conferenceData: { createRequest: { requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    reminders: { useDefault: true },
  };
}

// ---------- Google Calendar (owner credentials from env) ----------

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export const gcalDeps = { fetch: ((u, i) => fetch(u, i)) as Fetch };

export const gcalConfigured = (): boolean => !!(process.env.GCAL_CLIENT_ID && process.env.GCAL_CLIENT_SECRET && process.env.GCAL_REFRESH_TOKEN);

async function accessToken(): Promise<string> {
  const res = await gcalDeps.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GCAL_CLIENT_ID!, client_secret: process.env.GCAL_CLIENT_SECRET!,
      refresh_token: process.env.GCAL_REFRESH_TOKEN!, grant_type: 'refresh_token',
    }).toString(),
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!j.access_token) throw new Error(`gcal_token_${j.error || res.status}`);
  return j.access_token;
}

interface GEvent { id?: string; htmlLink?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] } }

export function meetUrlOf(e: GEvent): string | undefined {
  return e.hangoutLink || e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || undefined;
}

async function createGcalEvent(n: Normalized): Promise<{ status: CalendarStatus; eventId?: string; link?: string; meetUrl?: string }> {
  if (!gcalConfigured()) return { status: 'not_connected' };
  try {
    const token = await accessToken();
    const res = await gcalDeps.fetch(`${GCAL}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(calendarBody(n, randomUUID())),
    });
    if (!res.ok) { console.error('[meetings] gcal insert failed', res.status, (await res.text().catch(() => '')).slice(0, 300)); return { status: 'error' }; }
    const e = (await res.json()) as GEvent;
    return { status: 'ok', eventId: e.id, link: e.htmlLink, meetUrl: meetUrlOf(e) };
  } catch (e) {
    console.error('[meetings] gcal insert threw', (e as Error).message);
    return { status: (e as Error).message.startsWith('gcal_token_') ? 'not_connected' : 'error' };
  }
}

async function deleteGcalEvent(eventId: string): Promise<CalendarStatus> {
  if (!gcalConfigured()) return 'not_connected';
  try {
    const token = await accessToken();
    const res = await gcalDeps.fetch(`${GCAL}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    return res.ok || res.status === 404 || res.status === 410 ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

// ---------- store ----------

type MeetingDoc = Meeting & { attendeeUids: string[]; reminderTaskIds: string[] };

const publicOf = (d: FirebaseFirestore.DocumentData): Meeting => {
  const { attendeeUids: _a, reminderTaskIds: _r, ...m } = d as MeetingDoc; // eslint-disable-line @typescript-eslint/no-unused-vars
  return m;
};

export async function createMeeting(ownerUid: string, req: Partial<CreateMeetingRequest>, now: number = Date.now()): Promise<{ meeting: Meeting; calendar: CalendarStatus }> {
  const n = normalizeRequest(req, now);
  const cal = await createGcalEvent(n);
  const ref = col().doc();
  const iso = new Date(now).toISOString();
  const meeting: Meeting = {
    id: ref.id, ownerUid, title: n.title, startAt: new Date(n.startMs).toISOString(), endAt: new Date(n.endMs).toISOString(), tz: n.tz,
    attendees: n.attendees,
    ...(cal.meetUrl ? { meetUrl: cal.meetUrl } : {}), ...(cal.eventId ? { gcalEventId: cal.eventId } : {}), ...(cal.link ? { gcalLink: cal.link } : {}),
    ...(n.notes ? { notes: n.notes } : {}),
    status: 'scheduled', createdVia: n.createdVia, reminderMinutes: n.reminderMinutes, createdAt: iso, updatedAt: iso,
  };
  // Reminder-only tasks first, so the doc records them (cancel removes them). A failure here must not lose the meeting.
  let reminderTaskIds: string[] = [];
  try {
    const fires = reminderFireTimes(n.startMs, n.reminderMinutes, now);
    if (fires.length) {
      const text = reminderText(n.title, n.tz, n.startMs, cal.meetUrl);
      const tasks = await addTasks(ownerUid, fires.map((f) => ({ text, remindAt: f.fireAt, remindFor: n.startMs, visibility: 'private' as const, tags: ['meeting'] })));
      reminderTaskIds = tasks.map((t) => t.id);
    }
  } catch (e) {
    console.error('[meetings] reminders failed', (e as Error).message);
  }
  const doc: MeetingDoc = { ...meeting, attendeeUids: n.attendees.map((a) => a.uid).filter((u): u is string => !!u), reminderTaskIds };
  await ref.set(doc);
  await inviteAttendees(meeting); // WhatsApp invites; never throws
  return { meeting, calendar: cal.status };
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const s = await col().doc(id).get();
  return s.exists ? publicOf(s.data()!) : null;
}

/** Scheduled meetings of `uid` that have not ended, soonest first. Index: ownerUid + startAt (firestore.indexes.json). */
export async function listUpcomingMeetings(uid: string, limit = 20, now: number = Date.now()): Promise<Meeting[]> {
  const snap = await col().where('ownerUid', '==', uid).where('startAt', '>=', new Date(now - 3_600_000).toISOString()).orderBy('startAt').limit(Math.min(Math.max(limit, 1), 100) + 20).get();
  // Events (kind 'event') live in the same collection but have their own list (lib/server/events.ts): not meetings.
  return snap.docs.map((d) => publicOf(d.data())).filter((m) => m.kind !== 'event' && m.status === 'scheduled' && Date.parse(m.endAt) >= now).slice(0, limit);
}

export async function cancelMeeting(uid: string, id: string): Promise<{ meeting: Meeting; calendar: CalendarStatus } | null> {
  const ref = col().doc(id);
  const s = await ref.get();
  if (!s.exists || s.data()?.ownerUid !== uid) return null;
  const d = s.data() as MeetingDoc;
  if (d.kind === 'event') { // events cancel through their own module (reminders, series)
    const { cancelEvent } = await import('./events');
    const ev = await cancelEvent(uid, id);
    return ev ? { meeting: ev, calendar: 'ok' } : null;
  }
  const calendar: CalendarStatus = d.gcalEventId ? await deleteGcalEvent(d.gcalEventId) : 'ok';
  await Promise.all((d.reminderTaskIds ?? []).map((t) => deleteTask(uid, t).catch(() => undefined)));
  const patch = { status: 'cancelled' as const, updatedAt: new Date().toISOString(), reminderTaskIds: [] };
  await ref.update(patch);
  const meeting = publicOf({ ...d, ...patch });
  await cancelAttendees(meeting); // WhatsApp note to those invited; never throws
  return { meeting, calendar };
}
