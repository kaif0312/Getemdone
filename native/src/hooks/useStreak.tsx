/**
 * Streaks. Computes the same numbers as the PWA's AuthContext.updateStreakData / the bot's lib/server/streaks.ts
 * (computeStreak, ported in lib/streak.ts) from your tasks + focus sessions + workouts, and keeps users/{uid}.streakData
 * in step (so friends, the bot and the PWA see the same streak). Guards copied from the PWA: never overwrite with an empty
 * fetch, never lower the longest streaks, only write when something changed (debounced).
 *
 *   const { streakData, current, longest, focusCurrent, fitnessStreak, doneToday, atRisk, loading } = useStreak();
 * One owner (context) mounted in app/_layout.tsx, so there is exactly one writer.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { computeStreak, type StreakResult, type StreakSession, type StreakTask } from '@/lib/streak';
import { userZone } from '@/lib/dates';
import type { FocusSession } from '@/lib/types';
import { useAuth } from './useAuth';
import { useFitness } from './useFitness';
import { useTasks } from './useTasks';
import { useToday } from './useToday';

const EMPTY: StreakResult = { currentStreak: 0, longestStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} };

function sameStreak(a: StreakResult | undefined, b: StreakResult): boolean {
  if (!a) return false;
  return (
    a.currentStreak === b.currentStreak && a.longestStreak === b.longestStreak && a.lastCompletionDate === b.lastCompletionDate &&
    a.focusCurrentStreak === b.focusCurrentStreak && a.focusLongestStreak === b.focusLongestStreak && a.fitnessStreak === b.fitnessStreak &&
    JSON.stringify(a.completionHistory) === JSON.stringify(b.completionHistory) &&
    JSON.stringify(a.missedCommitments) === JSON.stringify(b.missedCommitments) &&
    JSON.stringify(a.focusCompletionHistory ?? {}) === JSON.stringify(b.focusCompletionHistory ?? {})
  );
}

function useStreakState() {
  const { uid, profile } = useAuth();
  const { tasks, loading: tasksLoading } = useTasks();
  const { workoutDates, loading: fitLoading } = useFitness();
  const { today } = useToday();
  const [sessions, setSessions] = useState<StreakSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const stored = profile?.streakData as StreakResult | undefined;
  const storedRef = useRef(stored);
  storedRef.current = stored;
  const zone = userZone(profile?.timezone);

  useEffect(() => {
    if (!uid) {
      setSessions([]);
      setSessionsLoaded(false);
      return;
    }
    return onSnapshot(
      collection(db, 'focusSessions', uid, 'sessions'),
      (snap) => {
        setSessions(snap.docs.map((d) => d.data() as FocusSession));
        setSessionsLoaded(true);
      },
      () => setSessionsLoaded(true),
    );
  }, [uid]);

  const ready = !!uid && !tasksLoading && !fitLoading && sessionsLoaded;

  const computed = useMemo<StreakResult | null>(() => {
    if (!ready) return null;
    const streakTasks: StreakTask[] = tasks.map((t) => ({
      id: t.id, createdAt: t.createdAt, completed: t.completed, completedAt: t.completedAt, skipRollover: t.skipRollover,
      deferredTo: t.deferredTo, committed: t.committed, recurrence: t.recurrence ?? null,
    }));
    return computeStreak({ tasks: streakTasks, sessions, workoutDates, timezone: zone, existing: storedRef.current ?? null }, today);
  }, [ready, tasks, sessions, workoutDates, zone, today]);

  // Persist (debounced). Empty-fetch guard like the PWA: no tasks and no workouts = leave stored data alone.
  useEffect(() => {
    if (!uid || !computed) return;
    if (tasks.length === 0 && workoutDates.length === 0) return;
    if (sameStreak(storedRef.current, computed)) return;
    const t = setTimeout(() => {
      setDoc(doc(db, 'users', uid), { streakData: computed }, { merge: true }).catch((e) => console.warn('[useStreak] persist failed', e));
    }, 1500);
    return () => clearTimeout(t);
  }, [uid, computed, tasks.length, workoutDates.length]);

  const streakData = computed ?? stored ?? EMPTY;
  const doneToday = (streakData.completionHistory?.[today] ?? 0) > 0;
  return useMemo(
    () => ({
      streakData,
      current: streakData.currentStreak,
      longest: streakData.longestStreak,
      focusCurrent: streakData.focusCurrentStreak ?? 0,
      focusLongest: streakData.focusLongestStreak ?? 0,
      fitnessStreak: streakData.fitnessStreak ?? 0,
      /** At least one task completed today. */
      doneToday,
      /** Streak is alive but nothing is done yet today: the coach should nag. */
      atRisk: streakData.currentStreak > 0 && !doneToday,
      loading: !ready && !stored,
    }),
    [streakData, doneToday, ready, stored],
  );
}

export type UseStreak = ReturnType<typeof useStreakState>;
const StreakContext = createContext<UseStreak | null>(null);

export function StreakProvider({ children }: { children: React.ReactNode }) {
  const v = useStreakState();
  return <StreakContext.Provider value={v}>{children}</StreakContext.Provider>;
}

export function useStreak(): UseStreak {
  const v = useContext(StreakContext);
  if (!v) throw new Error('useStreak must be used inside <StreakProvider>');
  return v;
}
