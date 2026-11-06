// Meetings contract (2026-11-06). Shared by the server, the PWA and the native app: pure, no server imports.
// Firestore collection `meetings/{id}`, written ONLY by the Admin SDK (lib/server/meetings.ts); owner and listed attendee
// uids may read (firestore.rules). Docs also carry two server-side helper fields that are not part of the contract:
// `attendeeUids: string[]` (for the rules) and `reminderTaskIds: string[]` (the reminder tasks to remove on cancel).
import type { EventRepeat } from '../events/rules';

export interface MeetingAttendee {
  name?: string;
  email?: string;
  uid?: string;
  waId?: string;
}

export interface Meeting {
  id: string;
  ownerUid: string;
  title: string;
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
  tz: string; // IANA, default 'Asia/Kolkata'
  attendees: MeetingAttendee[];
  meetUrl?: string;
  gcalEventId?: string;
  gcalLink?: string;
  notes?: string;
  /** 'event' (2026-11-07): a timed thing with a length (class, appointment): no Meet link, no attendees, never checkable.
   *  Missing = 'meeting', so every doc written before events stays valid. Rules: lib/events/rules.ts. */
  kind?: 'meeting' | 'event';
  /** Events only: repeat rule, anchored at startAt/endAt (the first occurrence). */
  repeat?: EventRepeat;
  /** Events only: local days "YYYY-MM-DD" of single occurrences that were cancelled. */
  exceptions?: string[];
  location?: string;
  status: 'scheduled' | 'cancelled';
  createdVia: 'claude-code' | 'bot' | 'app';
  reminderMinutes: number[]; // default [30, 10]
  createdAt: string;
  updatedAt: string;
}

export type CalendarStatus = 'ok' | 'not_connected' | 'error';

/** Body of POST /api/meetings. */
export interface CreateMeetingRequest {
  title: string;
  /** ISO with offset ("2026-11-07T23:00:00+05:30"), or "YYYY-MM-DD HH:mm" read in `tz`. */
  start: string;
  durationMin?: number; // default 30
  tz?: string;
  attendees?: MeetingAttendee[];
  notes?: string;
  reminderMinutes?: number[];
  createdVia: Meeting['createdVia'];
  /** 'event' creates an event (default duration 60, reminder [30] or [10], no Meet, no attendees). Omitted = meeting. */
  kind?: 'meeting' | 'event';
  repeat?: EventRepeat;
  location?: string;
}

/** Body of PATCH /api/events/<id>: only the fields given change. `start` moves the first occurrence (a series moves as a whole). */
export interface UpdateEventRequest {
  title?: string;
  start?: string;
  durationMin?: number;
  tz?: string;
  notes?: string | null;
  location?: string | null;
  reminderMinutes?: number[];
  /** null removes the repeat. */
  repeat?: EventRepeat | null;
}

/** An event as GET /api/events lists it: the doc plus the occurrence happening now or next. */
export interface EventItem extends Meeting {
  next: { startAt: string; endAt: string } | null;
}

export interface MeetingResponse extends Meeting {
  calendar: CalendarStatus;
}

export const DEFAULT_MEETING_TZ = 'Asia/Kolkata';
export const DEFAULT_REMINDER_MINUTES = [30, 10];
export const DEFAULT_DURATION_MIN = 30;
export const isEvent = (m: Pick<Meeting, 'kind'>): boolean => m.kind === 'event';
