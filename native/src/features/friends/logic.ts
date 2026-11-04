/**
 * Pure helpers for the Friends screens: today's counts, the ranked board, the activity feed, time strings, the headline.
 * No React, no Firebase. Counts only ever include tasks the viewer may read (`hidden` friend tasks are not counted).
 */
import { localDate } from '@/lib/dates';
import { shouldShowInTodayView } from '@/lib/taskFilter';
import type { Task } from '@/lib/types';
import type { FriendTask, UserDoc, Workout } from '@/lib/types-extra';

export interface DayStats {
  done: number;
  total: number;
}

/** Done = completed today (or a recurring instance ticked today). Total = done + what is still on today's list. */
export function dayStats(tasks: Task[], today: string, zone: string): DayStats {
  let done = 0;
  let pending = 0;
  for (const t of tasks) {
    if (t.deleted) continue;
    const doneToday =
      (t.completed && t.completedAt != null && localDate(zone, t.completedAt) === today) ||
      !!t.recurrence?.completedDates?.includes(today);
    if (doneToday) done++;
    else if (!t.completed && shouldShowInTodayView(t, today)) pending++;
  }
  return { done, total: done + pending };
}

export interface BoardRow {
  id: string;
  name: string;
  photoURL?: string;
  me: boolean;
  done: number;
  total: number;
  workouts: number;
  streak: number;
}

/** Most done first, then best ratio, then the longer streak, then name. */
export function rankBoard(rows: BoardRow[]): BoardRow[] {
  const ratio = (r: BoardRow) => (r.total ? r.done / r.total : 0);
  return [...rows].sort(
    (a, b) => b.done - a.done || ratio(b) - ratio(a) || b.streak - a.streak || a.name.localeCompare(b.name),
  );
}

/** One strict line above the board. Short, direct. */
export function boardHeadline(ranked: BoardRow[]): string {
  const me = ranked.find((r) => r.me);
  const others = ranked.filter((r) => !r.me);
  if (!me || others.length === 0) return '';
  const lead = others[0];
  if (lead.done === 0 && me.done === 0) return 'Nobody has started. Go first.';
  if (me.done > lead.done) return `You're ahead with ${me.done}. ${first(lead.name)} has ${lead.done}.`;
  if (me.done === lead.done) return `Tied with ${first(lead.name)} on ${me.done}. Break it.`;
  return `${first(lead.name)}'s done ${lead.done}. You're at ${me.done}.`;
}

export function first(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// ---- feed ---------------------------------------------------------------------------------------------------------------

export interface FeedItem {
  key: string;
  at: number;
  kind: 'task' | 'workout';
  text: string;
  task?: FriendTask;
}

export interface FriendFeed {
  friend: UserDoc;
  items: FeedItem[];
  doneCount: number;
  workoutCount: number;
  latest: number;
}

export function describeWorkout(w: Pick<Workout, 'type' | 'minutes' | 'distanceKm'>): string {
  const parts = [w.type || 'workout'];
  if (w.distanceKm) parts.push(`${w.distanceKm} km`);
  if (w.minutes) parts.push(`${w.minutes} min`);
  return parts.join(' ');
}

/**
 * Per friend: their visible completions and workouts since `since` (ms), newest first. Friends with nothing are returned with an
 * empty list so the screen can show the "quiet" nudge row.
 */
export function buildFeed(
  friends: UserDoc[],
  friendTasks: FriendTask[],
  workouts: Record<string, (Workout & { date: string })[]>,
  since: number,
): FriendFeed[] {
  return friends.map((friend) => {
    const items: FeedItem[] = [];
    for (const t of friendTasks) {
      if (t.userId !== friend.id || t.hidden || !t.completed || t.completedAt == null || t.completedAt < since) continue;
      items.push({ key: `t_${t.id}`, at: t.completedAt, kind: 'task', text: t.text, task: t });
    }
    for (const w of workouts[friend.id] ?? []) {
      if (w.at < since) continue;
      items.push({ key: `w_${friend.id}_${w.at}`, at: w.at, kind: 'workout', text: describeWorkout(w) });
    }
    items.sort((a, b) => b.at - a.at);
    return {
      friend,
      items,
      doneCount: items.filter((i) => i.kind === 'task').length,
      workoutCount: items.filter((i) => i.kind === 'workout').length,
      latest: items[0]?.at ?? 0,
    };
  });
}

// ---- time -----------------------------------------------------------------------------------------------------------------

export function timeAgo(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** "5 h", "40 min": time until the local midnight, when the one-nudge-a-day limit resets. */
export function untilMidnight(now = new Date()): string {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  const mins = Math.max(1, Math.round((next.getTime() - now.getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r >= 30 && h < 23 ? `${h + 1} h` : `${h} h`;
}

/** Group reactions: [{emoji, count, mine}] most used first. */
export function groupReactions(reactions: { userId: string; emoji: string }[] | undefined, uid: string | null) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions ?? []) {
    const g = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    g.count++;
    if (r.userId === uid) g.mine = true;
    map.set(r.emoji, g);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export const QUICK_REACTIONS = ['🔥', '👏', '💪', '🎉', '❤️'] as const;

/** The PWA's encouragement messages (components/EncouragementModal.tsx), same text. */
export const ENCOURAGEMENTS = [
  { emoji: '🔥', text: "You've got this! Keep pushing! 🔥" },
  { emoji: '🚀', text: "Let's crush these tasks together! 🚀" },
  { emoji: '⭐', text: "You're doing amazing! Keep it up! ⭐" },
  { emoji: '⚡', text: "Stay focused, you're unstoppable! ⚡" },
  { emoji: '💪', text: 'Believe in yourself, you can do this! 💪' },
  { emoji: '🎯', text: "One step at a time, you're making progress! 🎯" },
] as const;

export const FRIEND_LINK_BASE = 'nudge://friends/add';
export const inviteDeepLink = (code: string) => `${FRIEND_LINK_BASE}?code=${encodeURIComponent(code)}`;
export const inviteText = (code: string) =>
  `Add me on Nudge. My friend code is ${code}. Accountability needs witnesses.\nOpen the app: ${inviteDeepLink(code)}`;
