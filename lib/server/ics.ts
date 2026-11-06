// iCalendar (RFC 5545) writer for the personal calendar feed. PURE.
import type { CalEvent } from './calendarEvents';
import { addDaysStr } from './calendarEvents';

/** Escape TEXT values: backslash, semicolon, comma, newline. */
export function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold a content line at 75 octets (RFC 5545 3.1): continuation lines start with one space. Never splits a UTF-8 char. */
export function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (d: string) => d.replace(/-/g, '');

export interface IcsOptions {
  /** Calendar display name. */
  name: string;
  /** DTSTAMP for every event (ms). */
  now: number;
  /** Link back to the app, shown in the event description. */
  url?: string;
}

export function buildIcs(events: CalEvent[], opts: IcsOptions): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Nudge//Getemdone//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(opts.name)}`,
    // Hint for clients that honour it (Apple, Google ignore it and poll at their own pace).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.taskId}@getemdone.vercel.app`, `DTSTAMP:${stamp(opts.now)}`);
    if (e.date) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(e.date)}`, `DTEND;VALUE=DATE:${dateOnly(addDaysStr(e.date, 1))}`);
    } else {
      lines.push(`DTSTART:${stamp(e.startMs!)}`, `DTEND:${stamp(e.endMs ?? e.startMs! + 30 * 60_000)}`);
    }
    lines.push(`SUMMARY:${icsText(e.title)}`);
    const desc = [e.notes, opts.url ? `Open in Nudge: ${opts.url}` : ''].filter(Boolean).join('\n');
    if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`);
    // All-day deadlines should not block the day; timed tasks are "busy" like any meeting.
    lines.push(`TRANSP:${e.date ? 'TRANSPARENT' : 'OPAQUE'}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
