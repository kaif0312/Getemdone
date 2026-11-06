// /meet, /meetings, /cancel meeting: schedule a Google Meet from WhatsApp. Pure helpers first (tested without network), then the
// command handlers. The model gets ONE tool (create_meeting), so a /meet message can never be read as anything else.
import type { FunctionDecl } from './types';
import type { Meeting, CalendarStatus, CreateMeetingRequest } from '@/lib/meetings/types';
import { DEFAULT_MEETING_TZ } from '@/lib/meetings/types';
import type { Ctx } from './actions';
import { systemFor } from './prompt';

export const MEET_USAGE = [
  'Set up a meeting like this:',
  '/meet <title> <when> [with <name>] [for <N> min]',
  'e.g. /meet Meeting with Shamly tomorrow 11pm with Shamly shamly@gmail.com for 45 min',
  'Then /meetings lists your next 5 and /cancel meeting 2 cancels the second.',
].join('\n');

const S = { type: 'STRING' } as const;
export const MEET_TOOL: FunctionDecl = {
  name: 'create_meeting',
  description: 'Create the meeting the user described. Fill only what the text says.',
  parameters: {
    type: 'OBJECT',
    properties: {
      title: { ...S, description: "Short meeting title, in the user's words, without the date/time words" },
      start: { ...S, description: "Start in the user's local zone as YYYY-MM-DDTHH:mm, worked out from the local date and weekday given at the end" },
      duration_min: { type: 'NUMBER', description: 'Length in minutes, only if the user says it ("for 45 min", "1 hour" = 60). Omit otherwise.' },
      with_name: { ...S, description: 'Name of the person the meeting is with, if given ("with Shamly")' },
      with_email: { ...S, description: "Their email, ONLY if it is written in the user's message. Never guess or invent one." },
    },
    required: ['title', 'start'],
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() && !Number.isNaN(Number(v)) ? Number(v) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * Model tool args -> a createMeeting request, or null when the title or start is unusable. `userText` is the raw message: an email the
 * model returns that is not literally in it is dropped (never invite a guessed address).
 */
export function meetingRequestFrom(args: Record<string, unknown>, tz: string, userText: string): Omit<CreateMeetingRequest, 'createdVia'> | null {
  const title = str(args.title);
  const start = str(args.start);
  if (!title || !start || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(start)) return null;
  const dur = num(args.duration_min);
  const email = str(args.with_email);
  const name = str(args.with_name);
  const okEmail = email && EMAIL.test(email) && userText.toLowerCase().includes(email.toLowerCase()) ? email : undefined;
  return {
    title: title.slice(0, 200),
    start: start.slice(0, 16).replace('T', ' '),
    tz,
    ...(dur && dur >= 5 && dur <= 1440 ? { durationMin: Math.round(dur) } : {}),
    ...(name || okEmail ? { attendees: [{ ...(name ? { name: name.slice(0, 100) } : {}), ...(okEmail ? { email: okEmail } : {}) }] } : {}),
  };
}

/** "Fri 7 Nov, 11:00 PM" in `tz`. */
export function fmtMeetingWhen(iso: string, tz: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day}, ${time}`;
}

/** Reminders that will actually fire (those whose moment is already past are dropped by the server). */
export function reminderSummary(startIso: string, minutes: number[], now: number): string {
  const startMs = Date.parse(startIso);
  const live = minutes.filter((m) => startMs - m * 60_000 > now + 5_000).sort((a, b) => b - a);
  if (!live.length) return 'No reminders (the meeting is too soon).';
  return `Reminders: ${live.map((m) => (m % 60 === 0 && m >= 60 ? `${m / 60} h` : `${m} min`)).join(' and ')} before.`;
}

export function formatCreated(m: Meeting, calendar: CalendarStatus, tz: string, now: number): string {
  const who = m.attendees.map((a) => a.name || a.email).filter(Boolean).join(', ');
  const mins = Math.round((Date.parse(m.endAt) - Date.parse(m.startAt)) / 60_000);
  const link = m.meetUrl ? `Meet link: ${m.meetUrl}`
    : calendar === 'error' ? 'Google Calendar failed, so there is no Meet link.'
    : 'Google Calendar not connected, no link.';
  const invited = m.meetUrl && m.attendees.some((a) => a.email) ? 'Invite emailed.' : '';
  return [
    `📅 *${m.title}* is set`,
    `${fmtMeetingWhen(m.startAt, tz)} (${mins} min)${who ? ` with ${who}` : ''}`,
    link,
    invited,
    reminderSummary(m.startAt, m.reminderMinutes, now),
  ].filter(Boolean).join('\n');
}

export function formatList(ms: Meeting[], tz: string): string {
  if (!ms.length) return 'No upcoming meetings. Set one with /meet.';
  const lines = ms.map((m, i) => {
    const who = m.attendees.map((a) => a.name || a.email).filter(Boolean).join(', ');
    return `${i + 1}. *${m.title}* · ${fmtMeetingWhen(m.startAt, tz)}${who ? ` · ${who}` : ''}${m.meetUrl ? `\n   ${m.meetUrl}` : ''}`;
  });
  return ['*Your next meetings* 📅', ...lines, '', '/cancel meeting <n> cancels one.'].join('\n');
}

/** "/cancel meeting 2" argument ("meeting 2", "meeting #2") -> 2; 0 = about a meeting but no usable number; null = not about meetings. */
export function parseCancelMeeting(arg: string): number | null {
  const m = /^meetings?\b\s*#?\s*(.*)$/i.exec(arg.trim());
  if (!m) return null;
  const n = /^\d+$/.test(m[1].trim()) ? Number(m[1].trim()) : 0;
  return n >= 1 && n <= 5 ? n : 0;
}

const LIST_N = 5;

export async function meetCommand(ctx: Ctx, text: string): Promise<void> {
  const mt = ctx.d.meetings;
  if (!mt) { await ctx.text('Meetings are not available right now.'); return; }
  if (!text.trim()) { await ctx.text(MEET_USAGE); return; }
  const tz = ctx.tz || DEFAULT_MEETING_TZ;
  let req: ReturnType<typeof meetingRequestFrom> = null;
  try {
    const weekday = new Date(ctx.today + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    const res = await ctx.d.gemini({
      system: systemFor(ctx.link.coach),
      user: [{ text: `The user sent the /meet command. Call create_meeting with the title, start (in their zone), and only what the text states. Call nothing else.\n\nMeeting text:\n${text}\n\nLocal date ${ctx.today} (${weekday}), local time ${ctx.time}, zone ${tz}.` }],
      tools: [MEET_TOOL],
    });
    const call = res.calls.find((c) => c.name === 'create_meeting');
    if (call) req = meetingRequestFrom(call.args ?? {}, tz, text);
  } catch (e) {
    console.error('[bot] /meet parse failed', (e as Error).message);
  }
  if (!req) { await ctx.text(`I could not read a title and a time from that.\n${MEET_USAGE}`); return; }
  try {
    const { meeting, calendar } = await mt.create(ctx.uid, { ...req, createdVia: 'bot' }, ctx.d.now());
    await ctx.text(formatCreated(meeting, calendar, tz, ctx.d.now()));
  } catch (e) {
    const err = e as Error;
    // The server's BadRequest messages are written for people ("start is in the past"); anything else is ours.
    if (mt.isBadRequest(e)) await ctx.text(`Could not set that up: ${err.message}.\n${MEET_USAGE}`);
    else { console.error('[bot] /meet failed', err.message); await ctx.text('Something went wrong setting up the meeting. Please try again.'); }
  }
}

export async function meetingsCommand(ctx: Ctx): Promise<void> {
  const mt = ctx.d.meetings;
  if (!mt) { await ctx.text('Meetings are not available right now.'); return; }
  await ctx.text(formatList(await mt.listUpcoming(ctx.uid, LIST_N, ctx.d.now()), ctx.tz || DEFAULT_MEETING_TZ));
}

export async function cancelMeetingCommand(ctx: Ctx, n: number): Promise<void> {
  const mt = ctx.d.meetings;
  if (!mt) { await ctx.text('Meetings are not available right now.'); return; }
  if (n < 1) { await ctx.text('Which one? Send /meetings to see the list, then /cancel meeting 2.'); return; }
  const list = await mt.listUpcoming(ctx.uid, LIST_N, ctx.d.now());
  const m = list[n - 1];
  if (!m) { await ctx.text(list.length ? `There is no meeting ${n}. Send /meetings to see the list.` : 'No upcoming meetings to cancel.'); return; }
  const r = await mt.cancel(ctx.uid, m.id);
  if (!r) { await ctx.text('I could not find that meeting any more.'); return; }
  const tz = ctx.tz || DEFAULT_MEETING_TZ;
  await ctx.text(`❌ Cancelled *${m.title}* (${fmtMeetingWhen(m.startAt, tz)}). Reminders removed${r.calendar === 'ok' && m.gcalEventId ? ' and the Google event deleted' : ''}.${r.calendar === 'error' ? ' The Google event could not be deleted, remove it in Calendar.' : ''}`);
}
