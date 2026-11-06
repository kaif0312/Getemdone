/**
 * Pure helpers for the Today / task screens: date labels, scheduling, section building, multi-line parsing, tag display.
 * No React in here. Dates are 'YYYY-MM-DD' strings; a scheduled time lives in `deferredTo` as 'YYYY-MM-DDTHH:mm' (PWA format).
 */
import { addDays, daysBetween, dayOfWeek } from '@/lib/dates';
import { getDateString, isRolledOver } from '@/lib/taskFilter';
import type { Task } from '@/lib/types';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---- schedule (deferredTo) ----------------------------------------------------------------------------------------
export interface Scheduled {
  date: string;
  /** 'HH:mm' (24h) or null when only a day is set. */
  time: string | null;
}

export function parseScheduled(deferredTo?: string | null): Scheduled | null {
  if (!deferredTo) return null;
  const [date, time] = deferredTo.split('T');
  return { date, time: time ? time.slice(0, 5) : null };
}

export function buildScheduled(date: string, time: string | null): string {
  return time ? `${date}T${time}` : date;
}

/** ms timestamp for a local date + 'HH:mm'. */
export function toTimestamp(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0).getTime();
}

export function fromTimestamp(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  return {
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

/** '15:30' -> '3:30 PM' */
export function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

/** 'Today' / 'Tomorrow' / 'Yesterday' / 'Fri' (within a week) / 'Fri 14 Nov' / '14 Nov 2027'. */
export function fmtDay(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number);
  if (diff > 1 && diff < 7) return DAY_NAMES[dayOfWeek(date)];
  const sameYear = today.slice(0, 4) === String(y);
  return `${DAY_NAMES[dayOfWeek(date)]} ${d} ${MONTH_NAMES[m - 1]}${sameYear ? '' : ` ${y}`}`;
}

export function fmtDayTime(ts: number, today: string): string {
  const { date, time } = fromTimestamp(ts);
  return `${fmtDay(date, today)}, ${fmtTime(time)}`;
}

/** Header date: 'Wednesday, 5 November'. */
export function fmtHeaderDate(today: string, short = false): string {
  const [, m, d] = today.split('-').map(Number);
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // short = narrow phones (the header buttons leave ~140pt for the subtitle): 'Sat, 7 Nov'.
  if (short) return `${names[dayOfWeek(today)].slice(0, 3)}, ${d} ${MONTH_LONG[m - 1].slice(0, 3)}`;
  return `${names[dayOfWeek(today)]}, ${d} ${MONTH_LONG[m - 1]}`;
}

export function fmtAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return `${Math.round(d / 7)}w`;
}

/** First day-of-week index (Mon-first grid) offset for a month; also days in the month. */
export function monthGrid(year: number, month0: number): { lead: number; days: number } {
  const first = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  return { lead: (first + 6) % 7, days: new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate() };
}

export function ymd(y: number, m0: number, d: number): string {
  return `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Next 15-minute slot, at least 1h from now, as 'HH:mm' (default for the time picker). */
export function defaultTime(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const mins = Math.ceil(d.getMinutes() / 15) * 15;
  d.setMinutes(mins % 60, 0, 0);
  if (mins >= 60) d.setHours(d.getHours() + 1);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---- multi-line add -----------------------------------------------------------------------------------------------
/** One task per line, or separated by ';'. Blank pieces dropped, 500-char cap, max 20. */
export function parseTaskLines(raw: string): string[] {
  return raw
    .split(/[\n;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 500))
    .slice(0, 20);
}

// ---- sections -----------------------------------------------------------------------------------------------------
export type SectionKey = 'focus' | 'committed' | 'overdue' | 'rolled' | 'today' | 'upcoming' | 'done';

export interface TodaySection {
  key: SectionKey;
  title: string;
  tasks: Task[];
}

function sortOpen(a: Task, b: Task): number {
  const as = parseScheduled(a.deferredTo);
  const bs = parseScheduled(b.deferredTo);
  const at = as?.time ? as.date + as.time : null;
  const bt = bs?.time ? bs.date + bs.time : null;
  if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  if (at && bt) return at < bt ? -1 : at > bt ? 1 : 0;
  if (at) return -1;
  if (bt) return 1;
  return (a.order || 0) - (b.order || 0);
}

/**
 * Splits today's tasks (already passed through shouldShowInTodayView) into sections. A task is in exactly one:
 * Focus > Committed > Overdue (deadline passed) > Rolled over (from an earlier day) > Today > Coming up (scheduled later) > Done.
 */
export function buildSections(visible: Task[], today: string, now: number = Date.now()): TodaySection[] {
  const open = visible.filter((t) => !t.completed).sort(sortOpen);
  const done = visible.filter((t) => t.completed).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const groups: Record<SectionKey, Task[]> = { focus: [], committed: [], overdue: [], rolled: [], today: [], upcoming: [], done };
  for (const t of open) {
    const sch = parseScheduled(t.deferredTo);
    if (t.focusDate === today) groups.focus.push(t);
    else if (t.committed) groups.committed.push(t);
    else if (t.dueDate && t.dueDate < now) groups.overdue.push(t);
    else if (sch && sch.date > today) groups.upcoming.push(t);
    else if (!t.recurrence && isRolledOver(t, today) && !(sch && sch.date === today)) groups.rolled.push(t);
    else groups.today.push(t);
  }
  const titles: Record<SectionKey, string> = {
    focus: 'Focus', committed: 'Committed', overdue: 'Overdue', rolled: 'Rolled over', today: 'Today', upcoming: 'Coming up', done: 'Done',
  };
  const order: SectionKey[] = ['focus', 'committed', 'overdue', 'rolled', 'today', 'upcoming', 'done'];
  return order.filter((k) => groups[k].length > 0).map((k) => ({ key: k, title: titles[k], tasks: groups[k] }));
}

/** Today's timed tasks for the schedule strip, soonest first. */
export function timedToday(visible: Task[], today: string): Task[] {
  return visible
    .filter((t) => {
      const s = parseScheduled(t.deferredTo);
      return !!s?.time && s.date === today;
    })
    .sort((a, b) => (parseScheduled(a.deferredTo)!.time! < parseScheduled(b.deferredTo)!.time! ? -1 : 1));
}

/** Days a task has been rolling (0 = created today). */
export function daysRolled(task: Task, today: string): number {
  return Math.max(0, daysBetween(getDateString(task.createdAt), today));
}

export const tomorrowOf = (today: string) => addDays(today, 1);

// ---- tags (PWA stores emoji, 'iconId' or 'iconId:tint'; the native app shows them all as emoji) ---------------------
export const TAG_CHOICES: { id: string; emoji: string; label: string }[] = [
  { id: 'briefcase', emoji: '💼', label: 'Work' },
  { id: 'home', emoji: '🏠', label: 'Home' },
  { id: 'dumbbell', emoji: '🏋️', label: 'Fitness' },
  { id: 'book-open', emoji: '📚', label: 'Study' },
  { id: 'coins', emoji: '💰', label: 'Money' },
  { id: 'shopping-cart', emoji: '🛒', label: 'Shopping' },
  { id: 'heart-pulse', emoji: '❤️', label: 'Health' },
  { id: 'target', emoji: '🎯', label: 'Goal' },
  { id: 'phone', emoji: '📞', label: 'Call' },
  { id: 'mail', emoji: '📧', label: 'Mail' },
  { id: 'laptop', emoji: '💻', label: 'Laptop' },
  { id: 'users', emoji: '👥', label: 'People' },
  { id: 'car', emoji: '🚗', label: 'Errand' },
  { id: 'plane', emoji: '✈️', label: 'Travel' },
  { id: 'utensils', emoji: '🍳', label: 'Food' },
  { id: 'pill', emoji: '💊', label: 'Medicine' },
  { id: 'wrench', emoji: '🔧', label: 'Fix' },
  { id: 'palette', emoji: '🎨', label: 'Art' },
  { id: 'music', emoji: '🎵', label: 'Music' },
  { id: 'lightbulb', emoji: '💡', label: 'Idea' },
  { id: 'pencil', emoji: '📝', label: 'Write' },
  { id: 'gift', emoji: '🎁', label: 'Gift' },
  { id: 'paw-print', emoji: '🐕', label: 'Pet' },
  { id: 'star', emoji: '⭐', label: 'Important' },
  { id: 'flag', emoji: '🚩', label: 'Priority' },
  { id: 'clipboard', emoji: '📋', label: 'Admin' },
  { id: 'moon', emoji: '🌙', label: 'Sleep' },
  { id: 'camera', emoji: '📷', label: 'Photo' },
];

const BY_ID = new Map(TAG_CHOICES.map((t) => [t.id, t]));
const EXTRA_IDS: Record<string, string> = {
  'check-square': '✅', clock: '⏰', calendar: '📅', 'list-todo': '📋', kanban: '🗂️', code: '💻', presentation: '📊', 'file-text': '📄',
  building: '🏢', activity: '🏃', apple: '🍎', brain: '🧠', droplet: '💧', 'graduation-cap': '🎓', beaker: '🔬', library: '📚',
  languages: '🌐', wallet: '👛', 'credit-card': '💳', 'piggy-bank': '🐷', 'trending-up': '📈', receipt: '🧾', banknote: '💵',
  'message-circle': '💬', video: '🎥', 'party-popper': '🎉', handshake: '🤝', 'pen-tool': '✏️', film: '🎬', mic: '🎤', tag: '🏷️',
};

/** Display emoji + label for a stored tag. */
export function tagDisplay(tag: string): { emoji: string; label: string } {
  const id = tag.split(':')[0];
  const known = BY_ID.get(id);
  if (known) return { emoji: known.emoji, label: known.label };
  if (EXTRA_IDS[id]) return { emoji: EXTRA_IDS[id], label: id.replace(/-/g, ' ') };
  // legacy: the tag is a raw emoji
  return { emoji: tag, label: tag };
}

/** Value written to Firestore for a picked tag: the PWA's icon id (what the web app writes today). */
export function tagValue(choice: { id: string }): string {
  return choice.id;
}

export function sameTag(a: string, b: string): boolean {
  return a.split(':')[0] === b.split(':')[0];
}

/** Parked (Someday) tasks that are still open, most recently parked first. Repeating tasks cannot be parked. */
export function listParked(tasks: Task[]): Task[] {
  return tasks
    .filter((t) => !!t.parkedAt && !t.completed && !t.deleted && !t.recurrence)
    .sort((a, b) => (b.parkedAt ?? 0) - (a.parkedAt ?? 0));
}

/** COPY of pickSomeday in the bot (lib/bot/actions.ts): three parked tasks, the shortest first, rotated by day so it is not always the same three. */
export function pickSomeday(parked: Task[], dayKey: string, n = 3): Task[] {
  const small = [...parked].sort((a, b) => a.text.length - b.text.length).slice(0, Math.max(n * 2, n));
  let h = 0;
  for (const c of dayKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const start = small.length ? h % small.length : 0;
  return [...small.slice(start), ...small.slice(0, start)].slice(0, n);
}
