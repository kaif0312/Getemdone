// Meetings contract (2026-11-06). Shared by the server, the PWA and the native app: pure, no server imports.
// Firestore collection `meetings/{id}`, written ONLY by the Admin SDK (lib/server/meetings.ts); owner and listed attendee
// uids may read (firestore.rules). Docs also carry two server-side helper fields that are not part of the contract:
// `attendeeUids: string[]` (for the rules) and `reminderTaskIds: string[]` (the reminder tasks to remove on cancel).
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
}

export interface MeetingResponse extends Meeting {
  calendar: CalendarStatus;
}

export const DEFAULT_MEETING_TZ = 'Asia/Kolkata';
export const DEFAULT_REMINDER_MINUTES = [30, 10];
export const DEFAULT_DURATION_MIN = 30;
