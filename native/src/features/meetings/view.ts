/** Meetings: pure view helpers (no React, no Firebase). Spec: docs/MEETINGS_UI_SPEC.md section 3.
 *  SOURCE: components/meetings/view.ts (web). COPY: native/src/features/meetings/view.ts. Change both together. */
import type { Meeting, MeetingAttendee } from '@/lib/meetingsTypes';

export const DEFAULT_TZ = 'Asia/Kolkata';
export const DURATIONS = [15, 30, 45, 60, 90];
export const DEFAULT_DURATION = 30;
export const REMINDER_CHOICES = [
  { min: 0, label: 'At start' }, { min: 10, label: '10 min' }, { min: 30, label: '30 min' },
  { min: 60, label: '1 hour' }, { min: 1440, label: '1 day' },
];
export const DEFAULT_REMINDERS = [10];
export const JOIN_EARLY_MS = 10 * 60_000;
export const MAX_ATTENDEES = 20;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function safeTz(tz?: string | null): string {
  if (!tz) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

type Kind = 'parts' | 'clock' | 'short';
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, kind: Kind): Intl.DateTimeFormat {
  const key = `${tz}|${kind}`;
  let f = cache.get(key);
  if (!f) {
    f = kind === 'parts'
      ? new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      : kind === 'clock'
        ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })
        : new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
    cache.set(key, f);
  }
  return f;
}
const clean = (s: string) => s.replace(/[  ]/g, ' ').replace(',', '');
function parts(at: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number } {
  const p: Record<string, string> = {};
  for (const x of fmt(safeTz(tz), 'parts').formatToParts(new Date(at))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: p.hour === '24' ? 0 : +p.hour, mi: +p.minute };
}
const pad = (n: number) => String(n).padStart(2, '0');
const t = (iso: string) => Date.parse(iso);

export function dayKeyAt(at: number, tz: string): string {
  const p = parts(at, tz);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}`;
}
export const dayKeyIn = (iso: string, tz: string) => dayKeyAt(t(iso), tz);
export const clockAt = (at: number, tz: string) => clean(fmt(safeTz(tz), 'clock').format(new Date(at)));
export const clockIn = (iso: string, tz: string) => clockAt(t(iso), tz);
export function addDay(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export function zoneCity(tz: string): string {
  const z = safeTz(tz);
  return z.includes('/') ? z.slice(z.lastIndexOf('/') + 1).replace(/_/g, ' ') : z;
}

/** Wall clock (YYYY-MM-DD + HH:mm in tz) -> UTC ms. Two-pass offset fix; exact outside DST gaps. */
export function wallToUtcMs(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const want = Date.UTC(y, mo - 1, d, h, mi);
  const off = (at: number) => { const p = parts(at, tz); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - at; };
  let at = want - off(want);
  at = want - off(at);
  return at;
}

export function upcoming(list: Meeting[], now = Date.now()): Meeting[] {
  return list.filter((m) => m.status === 'scheduled' && t(m.endAt) > now).sort((a, b) => t(a.startAt) - t(b.startAt));
}
export type GroupKey = 'today' | 'tomorrow' | 'later';
export interface MeetingGroup { key: GroupKey; title: string; items: Meeting[] }
export function groupMeetings(list: Meeting[], viewerTz: string, now = Date.now()): MeetingGroup[] {
  const today = dayKeyAt(now, viewerTz);
  const tomorrow = addDay(today, 1);
  const g: Record<GroupKey, Meeting[]> = { today: [], tomorrow: [], later: [] };
  for (const m of upcoming(list, now)) {
    const k = dayKeyIn(m.startAt, viewerTz);
    g[k <= today ? 'today' : k === tomorrow ? 'tomorrow' : 'later'].push(m); // started yesterday, still running = today
  }
  const title: Record<GroupKey, string> = { today: 'Today', tomorrow: 'Tomorrow', later: 'Later' };
  return (['today', 'tomorrow', 'later'] as const).filter((k) => g[k].length).map((k) => ({ key: k, title: title[k], items: g[k] }));
}
/** Upcoming meetings starting in the next 48 h (Today entry block). */
export const soon48h = (list: Meeting[], now = Date.now()) => upcoming(list, now).filter((m) => t(m.startAt) < now + 48 * 3600_000);

export function dayLabel(iso: string, viewerTz: string, now = Date.now()): string {
  const today = dayKeyAt(now, viewerTz);
  const k = dayKeyIn(iso, viewerTz);
  if (k === today) return 'Today';
  if (k === addDay(today, 1)) return 'Tomorrow';
  return clean(fmt(safeTz(viewerTz), 'short').format(new Date(t(iso)))); // "Thu 12 Nov"
}
export interface TimeLines { main: string; other: string | null }
/** main = start-end in the viewer's zone; other = start in the meeting's zone, only when it reads differently. */
export function timeLines(m: Pick<Meeting, 'startAt' | 'endAt' | 'tz'>, viewerTz: string): TimeLines {
  const main = `${clockIn(m.startAt, viewerTz)} – ${clockIn(m.endAt, viewerTz)}`;
  const tz = safeTz(m.tz);
  const sameDay = dayKeyIn(m.startAt, tz) === dayKeyIn(m.startAt, viewerTz);
  if (sameDay && clockIn(m.startAt, tz) === clockIn(m.startAt, viewerTz)) return { main, other: null };
  const day = sameDay ? '' : ` ${clean(fmt(tz, 'short').format(new Date(t(m.startAt))))}`;
  return { main, other: `${clockIn(m.startAt, tz)}${day} in ${zoneCity(tz)}` };
}
export const durationMin = (m: Pick<Meeting, 'startAt' | 'endAt'>) => Math.round((t(m.endAt) - t(m.startAt)) / 60000);
export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  return min % 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min / 60} h`;
}
export function reminderLabel(mins: number[] | undefined): string {
  if (!mins || mins.length === 0) return 'No reminder';
  return [...mins].sort((a, b) => b - a).map((n) => REMINDER_CHOICES.find((c) => c.min === n)?.label ?? `${n} min`).join(', ');
}

export type JoinState = 'none' | 'later' | 'soon' | 'live';
export function joinState(m: Pick<Meeting, 'meetUrl' | 'startAt' | 'endAt' | 'status'>, now = Date.now()): JoinState {
  if (!m.meetUrl || m.status !== 'scheduled') return 'none';
  const s = t(m.startAt);
  if (now >= t(m.endAt)) return 'none';
  if (now >= s) return 'live';
  return now >= s - JOIN_EARLY_MS ? 'soon' : 'later';
}
export type SourceTone = 'primary' | 'success' | 'neutral';
export function sourceMeta(v: Meeting['createdVia']): { label: string; tone: SourceTone } {
  if (v === 'claude-code') return { label: 'Claude Code', tone: 'primary' };
  if (v === 'bot') return { label: 'WhatsApp', tone: 'success' };
  return { label: 'Nudge', tone: 'neutral' };
}
export const attendeeLabel = (a: MeetingAttendee) => a.name?.trim() || a.email?.trim() || 'Guest';
export function attendeeInitials(a: MeetingAttendee): string {
  const w = attendeeLabel(a).split(/[\s@._-]+/).filter(Boolean);
  return ((w[0]?.[0] ?? '?') + (w[1]?.[0] ?? '')).toUpperCase();
}

export interface NewMeetingDraft {
  title: string; date: string; time: string; durationMin: number; tz: string;
  attendees: MeetingAttendee[]; notes: string; reminderMinutes: number[];
}
/** Next half hour in tz (e.g. 14:07 -> 14:30; 23:40 -> tomorrow 00:00). */
export function defaultStart(tz: string, now = Date.now()): { date: string; time: string } {
  const at = Math.ceil((now + 60_000) / 1_800_000) * 1_800_000;
  const p = parts(at, tz);
  return { date: `${p.y}-${pad(p.mo)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.mi)}` };
}
export function zoneChoices(viewerTz: string): string[] {
  return [...new Set([safeTz(viewerTz), DEFAULT_TZ, 'Asia/Dubai', 'Asia/Kuwait', 'UTC'])];
}
export function validateDraft(d: NewMeetingDraft, now = Date.now()): string | null {
  if (!d.title.trim()) return 'Give it a title.';
  if (d.title.trim().length > 120) return 'Keep the title under 120 characters.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{2}:\d{2}$/.test(d.time)) return 'Pick a date and time.';
  if (wallToUtcMs(d.date, d.time, d.tz) <= now) return 'That time has passed.';
  if (d.attendees.some((a) => a.email && !EMAIL_RE.test(a.email))) return 'Check the email address.';
  if (d.attendees.length > MAX_ATTENDEES) return `Up to ${MAX_ATTENDEES} people.`;
  return null;
}
export function toCreateBody(d: NewMeetingDraft) {
  return {
    title: d.title.trim(),
    start: new Date(wallToUtcMs(d.date, d.time, d.tz)).toISOString(),
    durationMin: d.durationMin,
    tz: d.tz,
    attendees: d.attendees.length ? d.attendees : undefined,
    notes: d.notes.trim() || undefined,
    reminderMinutes: d.reminderMinutes,
    createdVia: 'app' as const,
  };
}
