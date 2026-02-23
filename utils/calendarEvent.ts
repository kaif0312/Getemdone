import type { CalendarEvent } from '@/lib/types';

/** Format time part for AM/PM logic */
function formatTimePart(d: Date): { time: string; ampm: string } {
  const hour = d.getHours();
  const minute = d.getMinutes();
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const ampm = hour < 12 ? 'AM' : 'PM';
  const time = `${hour12}:${String(minute).padStart(2, '0')}`;
  return { time, ampm };
}

/**
 * Format event time for display.
 * - All day: "All day"
 * - Multi-day: "Feb 24 – Feb 26"
 * - Same AM/PM: "9:00 – 10:30 AM"
 * - Different AM/PM: "11:30 AM – 1:00 PM"
 * Uses en dash (–) between times.
 */
export function formatEventTime(event: CalendarEvent): string {
  if (event.start?.date) {
    const startDate = event.start.date;
    const endDate = event.end?.date;
    if (endDate && startDate !== endDate) {
      const s = new Date(startDate + 'T12:00:00');
      const e = new Date(endDate + 'T12:00:00');
      return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    return 'All day';
  }
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!start) return '';
  const s = new Date(start);
  if (!end) {
    return s.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const e = new Date(end);
  const startPart = formatTimePart(s);
  const endPart = formatTimePart(e);
  if (startPart.ampm === endPart.ampm) {
    return `${startPart.time} – ${endPart.time} ${startPart.ampm}`;
  }
  return `${startPart.time} ${startPart.ampm} – ${endPart.time} ${endPart.ampm}`;
}

/** True if event's end time has passed */
export function isEventPast(event: CalendarEvent): boolean {
  if (event.start?.date) return false;
  const end = event.end?.dateTime;
  if (!end) return false;
  return new Date(end).getTime() < Date.now();
}

/** True if event is currently ongoing (started but not ended) */
export function isEventOngoing(event: CalendarEvent): boolean {
  if (event.start?.date) return true;
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!start || !end) return false;
  const now = Date.now();
  return new Date(start).getTime() <= now && new Date(end).getTime() > now;
}

/** Get event start/end in minutes from midnight for dateStr. Returns null for all-day. */
export function getEventTimeRange(event: CalendarEvent, dateStr: string): { start: number; end: number } | null {
  if (event.start?.date) return null;
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!start || !end) return null;
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  if (startDate !== dateStr) return null;
  const [, startTime] = start.split('T');
  const [, endTime] = end.split('T');
  const [sh, sm] = (startTime?.slice(0, 5) || '00:00').split(':').map(Number);
  const [eh, em] = (endTime?.slice(0, 5) || '00:00').split(':').map(Number);
  return {
    start: sh * 60 + sm,
    end: endDate === dateStr ? eh * 60 + em : 24 * 60,
  };
}

/** Get task scheduled time in minutes from midnight for dateStr. Returns null if no time. */
export function getTaskMinutes(task: { deferredTo?: string | null; dueDate?: number | null }, dateStr: string): number | null {
  if (task.deferredTo?.includes('T')) {
    const datePart = task.deferredTo.slice(0, 10);
    if (datePart !== dateStr) return null;
    const timePart = task.deferredTo.slice(11, 16) || '00:00';
    const [h, m] = timePart.split(':').map(Number);
    return h * 60 + m;
  }
  if (task.dueDate) {
    const d = new Date(task.dueDate);
    const taskDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (taskDateStr !== dateStr) return null;
    return d.getHours() * 60 + d.getMinutes();
  }
  return null;
}
