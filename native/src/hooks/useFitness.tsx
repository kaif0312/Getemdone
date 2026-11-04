/**
 * Fitness: `fitness/{uid}/days/{YYYY-MM-DD}` (workouts + steps/weight/sleep/water) and `fitnessGoals/{uid}`.
 * Writes mirror lib/server/fitness.ts exactly (same shapes and validation) with `source: 'app'`.
 *
 *   const { days, goals, week, logWorkout, logMetric, setGoals, undoLastWorkout, loading } = useFitness();
 * Live window: the last FITNESS_WINDOW_DAYS days (enough for the streak + charts). One shared listener (context).
 * Friends' fitness (they allow it with goals.visibility 'friends'): useFriendFitness(friendId).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, doc, documentId, getDoc, onSnapshot, query, runTransaction, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addDays, lastNDates, localDate, userZone, weekStart } from '@/lib/dates';
import type { FitnessDay, FitnessGoals, FitnessMetric, Workout } from '@/lib/types-extra';
import { useAuth } from './useAuth';

export const FITNESS_WINDOW_DAYS = 400;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface WeekSummary {
  /** Monday..Sunday of the current week */
  dates: string[];
  workouts: number;
  goal?: number;
  minutes: number;
  distanceKm: number;
  lastWeightKg?: number;
  days: FitnessDay[];
}

function positive(v: unknown, name: string): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`Invalid ${name}`);
  return v;
}

export function summarizeWeek(days: FitnessDay[], goals: FitnessGoals | null, today: string): WeekSummary {
  const monday = weekStart(today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const inWeek = days.filter((d) => d.date >= dates[0] && d.date <= dates[6]);
  let workouts = 0;
  let minutes = 0;
  let distanceKm = 0;
  for (const d of inWeek) {
    for (const w of d.workouts || []) {
      workouts++;
      minutes += w.minutes || 0;
      distanceKm += w.distanceKm || 0;
    }
  }
  const withWeight = [...days].reverse().find((d) => typeof d.weightKg === 'number');
  return {
    dates, workouts, minutes, distanceKm: Math.round(distanceKm * 100) / 100, days: inWeek,
    ...(goals?.workoutsPerWeek !== undefined && { goal: goals.workoutsPerWeek }),
    ...(withWeight && { lastWeightKg: withWeight.weightKg }),
  };
}

function useFitnessState() {
  const { uid, profile } = useAuth();
  const zone = userZone(profile?.timezone);
  const [days, setDays] = useState<FitnessDay[]>([]);
  const [goals, setGoalsState] = useState<FitnessGoals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setDays([]);
      setLoading(false);
      return;
    }
    const since = addDays(localDate(zone), -FITNESS_WINDOW_DAYS);
    return onSnapshot(
      query(collection(db, 'fitness', uid, 'days'), where(documentId(), '>=', since), orderBy(documentId())),
      (snap) => {
        setDays(snap.docs.map((d) => ({ ...(d.data() as FitnessDay), date: d.id })));
        setLoading(false);
      },
      (e) => {
        console.warn('[useFitness] days listener', e);
        setLoading(false);
      },
    );
  }, [uid, zone]);

  useEffect(() => {
    if (!uid) {
      setGoalsState(null);
      return;
    }
    return onSnapshot(
      doc(db, 'fitnessGoals', uid),
      (snap) => setGoalsState(snap.exists() ? (snap.data() as FitnessGoals) : null),
      () => setGoalsState(null),
    );
  }, [uid]);

  const resolveDate = useCallback(
    (date?: string) => {
      if (date) {
        if (!DATE_RE.test(date)) throw new Error('Invalid date: ' + date);
        return date;
      }
      return localDate(zone);
    },
    [zone],
  );

  const logWorkout = useCallback(
    async (w: Omit<Workout, 'at' | 'source'> & { date?: string }) => {
      if (!uid) return;
      const type = (w.type || '').trim().slice(0, 60);
      if (!type) throw new Error('Workout type is required');
      const date = resolveDate(w.date);
      const entry: Workout = { type, source: 'app', at: Date.now() };
      const minutes = positive(w.minutes, 'minutes');
      const distanceKm = positive(w.distanceKm, 'distanceKm');
      const sets = positive(w.sets, 'sets');
      const reps = positive(w.reps, 'reps');
      if (minutes !== undefined) entry.minutes = minutes;
      if (distanceKm !== undefined) entry.distanceKm = distanceKm;
      if (sets !== undefined) entry.sets = sets;
      if (reps !== undefined) entry.reps = reps;
      if (w.note) entry.note = w.note.slice(0, 500);
      const ref = doc(db, 'fitness', uid, 'days', date);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const cur = snap.exists() ? (snap.data() as FitnessDay) : { date, workouts: [], updatedAt: Date.now() };
        tx.set(ref, { ...cur, date, workouts: [...(cur.workouts || []), entry], updatedAt: Date.now() });
      });
    },
    [uid, resolveDate],
  );

  const logMetric = useCallback(
    async (metric: FitnessMetric, value: number, date?: string) => {
      if (!uid) return;
      if (!['steps', 'weightKg', 'sleepH', 'waterL'].includes(metric)) throw new Error('Unknown metric: ' + metric);
      const v = positive(value, metric);
      if (v === undefined || v === 0) throw new Error('Invalid ' + metric);
      const d = resolveDate(date);
      const ref = doc(db, 'fitness', uid, 'days', d);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const cur = snap.exists() ? (snap.data() as FitnessDay) : { date: d, workouts: [], updatedAt: Date.now() };
        tx.set(ref, { ...cur, date: d, workouts: cur.workouts || [], [metric]: v, updatedAt: Date.now() });
      });
    },
    [uid, resolveDate],
  );

  /** Remove the most recent workout of today (undo). */
  const undoLastWorkout = useCallback(async () => {
    if (!uid) return;
    const ref = doc(db, 'fitness', uid, 'days', localDate(zone));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const cur = snap.data() as FitnessDay;
      const workouts = [...(cur.workouts || [])];
      if (!workouts.length) return;
      let idx = 0;
      workouts.forEach((w, i) => {
        if (w.at >= workouts[idx].at) idx = i;
      });
      workouts.splice(idx, 1);
      tx.set(ref, { ...cur, workouts, updatedAt: Date.now() });
    });
  }, [uid, zone]);

  const setGoals = useCallback(
    async (g: Partial<FitnessGoals>) => {
      if (!uid) return;
      const patch: Partial<FitnessGoals> = {};
      const wpw = positive(g.workoutsPerWeek, 'workoutsPerWeek');
      const spd = positive(g.stepsPerDay, 'stepsPerDay');
      const tw = positive(g.targetWeightKg, 'targetWeightKg');
      if (wpw !== undefined) patch.workoutsPerWeek = Math.min(14, Math.round(wpw));
      if (spd !== undefined) patch.stepsPerDay = Math.round(spd);
      if (tw !== undefined) patch.targetWeightKg = tw;
      if (g.visibility === 'friends' || g.visibility === 'private') patch.visibility = g.visibility;
      const ref = doc(db, 'fitnessGoals', uid);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        tx.set(ref, { visibility: 'friends', ...(snap.exists() ? snap.data() : {}), ...patch });
      });
    },
    [uid],
  );

  const today = localDate(zone);
  const week = useMemo(() => summarizeWeek(days, goals, today), [days, goals, today]);
  const dayMap = useMemo(() => Object.fromEntries(days.map((d) => [d.date, d])), [days]);
  /** Dates with at least one workout (feeds the streak). */
  const workoutDates = useMemo(() => days.filter((d) => d.workouts?.length).map((d) => d.date), [days]);

  return useMemo(
    () => ({ days, dayMap, goals, week, workoutDates, loading, logWorkout, logMetric, undoLastWorkout, setGoals }),
    [days, dayMap, goals, week, workoutDates, loading, logWorkout, logMetric, undoLastWorkout, setGoals],
  );
}

export type UseFitness = ReturnType<typeof useFitnessState>;
const FitnessContext = createContext<UseFitness | null>(null);

export function FitnessProvider({ children }: { children: React.ReactNode }) {
  const v = useFitnessState();
  return <FitnessContext.Provider value={v}>{children}</FitnessContext.Provider>;
}

export function useFitness(): UseFitness {
  const v = useContext(FitnessContext);
  if (!v) throw new Error('useFitness must be used inside <FitnessProvider>');
  return v;
}

/** A friend's goals + the last 7 days (null goals = they have none or keep them private). */
export function useFriendFitness(friendId: string | null | undefined) {
  const { profile } = useAuth();
  const zone = userZone(profile?.timezone);
  const [days, setDays] = useState<FitnessDay[]>([]);
  const [goals, setGoals] = useState<FitnessGoals | null>(null);
  const [loading, setLoading] = useState(!!friendId);

  useEffect(() => {
    if (!friendId) return;
    let alive = true;
    const first = lastNDates(localDate(zone), 7)[0];
    const unsub = onSnapshot(
      query(collection(db, 'fitness', friendId, 'days'), where(documentId(), '>=', first), orderBy(documentId())),
      (snap) => {
        if (!alive) return;
        setDays(snap.docs.map((d) => ({ ...(d.data() as FitnessDay), date: d.id })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    getDoc(doc(db, 'fitnessGoals', friendId))
      .then((s) => alive && setGoals(s.exists() ? (s.data() as FitnessGoals) : null))
      .catch(() => alive && setGoals(null));
    return () => {
      alive = false;
      unsub();
    };
  }, [friendId, zone]);

  return { days, goals, loading };
}
