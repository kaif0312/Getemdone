/**
 * Events API (server: app/api/events in the web app; contract: ./meetingsTypes.ts). Bearer = Firebase ID token.
 *   POST   /api/events              -> Meeting (kind 'event')
 *   PATCH  /api/events/<id>         -> Meeting     (title, start, durationMin, notes, location, reminderMinutes, repeat)
 *   DELETE /api/events/<id>         -> cancels (a repeating event: `?date=YYYY-MM-DD` cancels only that day)
 */
import { call } from './meetingsApi';
import type { CreateMeetingRequest, Meeting, UpdateEventRequest } from './meetingsTypes';

export const listEventsApi = () => call<{ events: Meeting[] }>('GET', '/api/events').then((r) => r.events ?? []);
export const createEventApi = (body: CreateMeetingRequest) => call<Meeting>('POST', '/api/events', { ...body, kind: 'event' });
export const updateEventApi = (id: string, patch: UpdateEventRequest) => call<Meeting>('PATCH', `/api/events/${encodeURIComponent(id)}`, patch);
export const cancelEventApi = (id: string, date?: string) =>
  call<Meeting>('DELETE', `/api/events/${encodeURIComponent(id)}${date ? `?date=${encodeURIComponent(date)}` : ''}`);
