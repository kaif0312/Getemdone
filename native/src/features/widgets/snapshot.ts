/**
 * What the home-screen widgets show, as plain JSON. The app builds this from its live task list whenever something changes
 * (useWidgetSync) and stores it; the Android widgets draw from the stored copy (they run outside the app screens), the iOS
 * widgets receive it as props. Pure: no React, no storage, so `scripts/test_widget_snapshot.mts` can check it.
 *
 * Privacy rule: a private task is counted but its text is never put in the snapshot ("Private task"), because a widget sits on
 * the home screen and the lock screen of a phone that may be glanced at by anyone.
 */
import { buildSections, parseScheduled, fmtTime } from '../tasks/helpers';
import { shouldShowInTodayView } from '@/lib/taskFilter';
import type { Task } from '@/lib/types';

export const SNAPSHOT_VERSION = 1;
/** Rows kept in the snapshot; the 4x2 widget shows 4, a tall one up to 8. */
export const MAX_ROWS = 8;
const MAX_TEXT = 80;

export type WidgetPose = 'cheer' | 'flex' | 'proud' | 'sleepy' | 'waiting' | 'disappointed';
export type WidgetGroup = 'focus' | 'committed' | 'overdue' | 'rolled' | 'today';

export interface WidgetTask {
  id: string;
  text: string;
  group: WidgetGroup;
  /** 'HH:mm' when the task has a time today. */
  time: string | null;
  recurring: boolean;
}

export interface WidgetSnapshot {
  v: number;
  /** Signed-in user, or null when signed out (widgets then say "Sign in"). */
  uid: string | null;
  /** The day this snapshot is for ('YYYY-MM-DD', user's zone). A widget that is shown on a later day treats the list as stale. */
  date: string;
  /** IANA zone `date` was computed in, so a widget (outside the app) can tell what "today" is. */
  zone: string;
  generatedAt: number;
  /** Open tasks for today, most important first, at most MAX_ROWS. */
  open: WidgetTask[];
  /** All open tasks for today (can be more than `open.length`). */
  openCount: number;
  doneCount: number;
  streak: number;
  /** Streak is alive but nothing is done yet today. */
  atRisk: boolean;
  pose: WidgetPose;
}

export function emptySnapshot(uid: string | null = null, date = '', zone = ''): WidgetSnapshot {
  return { v: SNAPSHOT_VERSION, uid, date, zone, generatedAt: Date.now(), open: [], openCount: 0, doneCount: 0, streak: 0, atRisk: false, pose: 'sleepy' };
}

export function pickPose(openCount: number, doneCount: number, streak: number, atRisk: boolean): WidgetPose {
  if (openCount === 0 && doneCount > 0) return 'cheer';
  if (openCount === 0) return 'sleepy';
  if (atRisk) return 'waiting';
  if (streak >= 7) return 'flex';
  return 'proud';
}

function isPrivate(t: Task): boolean {
  return t.isPrivate === true || t.visibility === 'private';
}

function clip(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > MAX_TEXT ? `${one.slice(0, MAX_TEXT - 1)}…` : one;
}

export function buildSnapshot(args: {
  uid: string | null;
  tasks: Task[];
  today: string;
  zone: string;
  streak: number;
  atRisk: boolean;
  now?: number;
}): WidgetSnapshot {
  const { uid, tasks, today, zone, streak, atRisk } = args;
  const now = args.now ?? Date.now();
  if (!uid) return { ...emptySnapshot(null, today, zone), generatedAt: now };

  const visible = tasks.filter((t) => shouldShowInTodayView(t, today));
  const sections = buildSections(visible, today, now);
  const open: WidgetTask[] = [];
  let doneCount = 0;
  for (const s of sections) {
    if (s.key === 'done') {
      doneCount = s.tasks.length;
      continue;
    }
    if (s.key === 'upcoming') continue; // scheduled for a later day: not "left today"
    for (const t of s.tasks) {
      const sch = parseScheduled(t.deferredTo);
      open.push({
        id: t.id,
        text: isPrivate(t) ? 'Private task' : clip(t.text),
        group: s.key as WidgetGroup,
        time: sch && sch.date === today ? sch.time : null,
        recurring: !!t.recurrence,
      });
    }
  }
  return {
    v: SNAPSHOT_VERSION,
    uid,
    date: today,
    zone,
    generatedAt: now,
    open: open.slice(0, MAX_ROWS),
    openCount: open.length,
    doneCount,
    streak,
    atRisk,
    pose: pickPose(open.length, doneCount, streak, atRisk),
  };
}

/** Apply a tick made on the widget to a stored snapshot (instant redraw before Firestore answers). */
export function markDone(s: WidgetSnapshot, taskId: string): WidgetSnapshot {
  if (!s.open.some((t) => t.id === taskId)) return s;
  const open = s.open.filter((t) => t.id !== taskId);
  const openCount = Math.max(0, s.openCount - 1);
  const doneCount = s.doneCount + 1;
  // The first completion of the day extends the streak (the app recomputes the real number when it next opens).
  const streak = s.doneCount === 0 ? s.streak + 1 : s.streak;
  return { ...s, open, openCount, doneCount, atRisk: false, streak, pose: pickPose(openCount, doneCount, streak, false), generatedAt: Date.now() };
}

/** Row label: "09:30  Call the dentist" or just the text. */
export function rowLabel(t: WidgetTask): string {
  return t.time ? `${fmtTime(t.time)}  ${t.text}` : t.text;
}

/** "2 of 5 done" / "All clear" / "Nothing planned". */
export function progressLine(s: WidgetSnapshot): string {
  const total = s.openCount + s.doneCount;
  if (total === 0) return 'Nothing planned';
  if (s.openCount === 0) return 'All clear';
  return `${s.doneCount} of ${total} done`;
}

/** A snapshot from an earlier day is stale: show the empty "open Nudge" state instead of yesterday's list. */
export function isStale(s: WidgetSnapshot, today: string): boolean {
  return s.date !== today;
}
