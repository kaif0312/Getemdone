/**
 * PURE core of lib/server/streaks.ts (computeStreak). Keep in step with that file (the bot recomputes with the same maths).
 * The Firestore wrapper (recomputeStreak) is replaced by hooks/useStreak.ts on the client.
 */
import type { StreakData } from './types';
import { addDays, daysBetween, localDate } from './dates';

export type StreakResult = StreakData & { fitnessStreak?: number };

/** The task fields the streak maths needs. */
export interface StreakTask {
  id: string;
  deleted?: boolean;
  createdAt: number;
  completed: boolean;
  completedAt?: number | null;
  skipRollover?: boolean;
  deferredTo?: string | null;
  committed?: boolean;
  recurrence?: { completedDates?: string[] } | null;
}
export interface StreakSession { date: string; taskIds?: string[]; skipped?: boolean }

export interface StreakInput {
  tasks: StreakTask[];
  sessions: StreakSession[];
  /** Local dates ("YYYY-MM-DD") on which the user logged at least one workout. */
  workoutDates: string[];
  timezone: string;
  /** Previously stored streakData, so longest streaks are never lowered. */
  existing?: Partial<StreakResult> | null;
}

/** Consecutive days ending today (today may be empty). Capped like the app (365). */
function runEndingToday(has: (d: string) => boolean, todayStr: string, onHit?: (d: string) => void): number {
  let n = 0;
  let d = todayStr;
  for (;;) {
    if (has(d)) {
      n++;
      onHit?.(d);
    } else if (d !== todayStr) {
      break;
    }
    d = addDays(d, -1);
    if (n > 365) break;
  }
  return n;
}

/** Longest run of consecutive days in a set of dates. */
function longestRun(dates: string[]): number {
  if (!dates.length) return 0;
  const sorted = [...dates].sort((a, b) => b.localeCompare(a));
  let temp = 1;
  let best = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (daysBetween(sorted[i + 1], sorted[i]) === 1) {
      temp++;
      best = Math.max(best, temp);
    } else {
      temp = 1;
    }
  }
  return best;
}

/**
 * PURE port of AuthContext.updateStreakData (completion streak + focus streak) plus fitnessStreak.
 * Differences from the app: dates come from the user's zone instead of the browser clock; deleted committed tasks
 * are not counted as missed commitments.
 */
export function computeStreak(input: StreakInput, todayStr: string): StreakResult {
  const { tasks, sessions, workoutDates, timezone, existing } = input;
  const dateOf = (ms: number) => localDate(timezone, ms);
  const counts: Record<string, { total: number; completed: number }> = {};
  const bump = (d: string) => (counts[d] ??= { total: 0, completed: 0 });

  for (const task of tasks) {
    if (task.deleted === true) continue;
    const createdStr = dateOf(task.createdAt);

    if (task.recurrence) {
      for (const d of task.recurrence.completedDates || []) {
        const c = bump(d);
        c.completed++;
        c.total++;
      }
      continue;
    }
    if (task.completed && task.completedAt) {
      const doneStr = dateOf(task.completedAt);
      const c = bump(doneStr);
      c.completed++;
      if (createdStr <= doneStr) c.total++;
    } else if (!task.completed) {
      bump(createdStr).total++;
      if (createdStr < todayStr && !task.skipRollover && !(task.deferredTo && task.deferredTo > todayStr)) {
        bump(todayStr).total++;
      }
    }
  }

  const completionHistory: Record<string, number> = {};
  for (const [d, c] of Object.entries(counts)) if (c.completed >= 1) completionHistory[d] = c.completed;

  const missedCommitments: Record<string, number> = {};
  for (const task of tasks) {
    if (task.deleted === true || !task.committed || task.completed) continue;
    if (task.deferredTo && task.deferredTo >= todayStr) continue;
    const createdStr = dateOf(task.createdAt);
    if (createdStr < todayStr) missedCommitments[createdStr] = (missedCommitments[createdStr] || 0) + 1;
  }

  let lastCompletionDate = '';
  const currentStreak = runEndingToday((d) => !!completionHistory[d], todayStr, (d) => { lastCompletionDate = d; });
  let longestStreak = longestRun(Object.keys(completionHistory));

  // Focus streak
  const completedOn: Record<string, string> = {};
  for (const t of tasks) if (t.completed && t.completedAt) completedOn[t.id] = dateOf(t.completedAt);
  const focusCompletionHistory: Record<string, 'full' | 'partial' | 'none'> = {};
  for (const s of sessions) {
    if (s.skipped || !s.taskIds || s.taskIds.length === 0) continue;
    const done = s.taskIds.filter((id) => completedOn[id] === s.date).length;
    focusCompletionHistory[s.date] = done === s.taskIds.length ? 'full' : done > 0 ? 'partial' : 'none';
  }
  const focusOk = (d: string) => focusCompletionHistory[d] === 'full' || focusCompletionHistory[d] === 'partial';
  const focusCurrentStreak = runEndingToday(focusOk, todayStr);
  let focusLongestStreak = longestRun(Object.keys(focusCompletionHistory).filter(focusOk));

  // Never lower the longest streaks
  longestStreak = Math.max(longestStreak, existing?.longestStreak ?? 0);
  focusLongestStreak = Math.max(focusLongestStreak, existing?.focusLongestStreak ?? 0);

  const workoutSet = new Set(workoutDates);
  const fitnessStreak = runEndingToday((d) => workoutSet.has(d), todayStr);

  return {
    currentStreak, longestStreak, lastCompletionDate, completionHistory, missedCommitments,
    focusCompletionHistory, focusCurrentStreak, focusLongestStreak, fitnessStreak,
  };
}

