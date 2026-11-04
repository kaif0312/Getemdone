/** Workout types, metric definitions and formatting helpers for the Fitness section. Shapes mirror lib/server/fitness.ts. */
import type { FitnessDay, FitnessMetric, Workout } from '@/lib/types-extra';
import { addDays } from '@/lib/dates';

export interface WorkoutType {
  id: string;
  label: string;
  emoji: string;
  /** Which extra fields the log form shows. Minutes is always there. */
  distance?: boolean;
  sets?: boolean;
}

export const WORKOUT_TYPES: WorkoutType[] = [
  { id: 'run', label: 'Run', emoji: '🏃', distance: true },
  { id: 'walk', label: 'Walk', emoji: '🚶', distance: true },
  { id: 'cycle', label: 'Cycle', emoji: '🚴', distance: true },
  { id: 'swim', label: 'Swim', emoji: '🏊', distance: true },
  { id: 'gym', label: 'Gym', emoji: '🏋️', sets: true },
  { id: 'yoga', label: 'Yoga', emoji: '🧘' },
  { id: 'hiit', label: 'HIIT', emoji: '🔥' },
  { id: 'sport', label: 'Sport', emoji: '⚽' },
  { id: 'other', label: 'Other', emoji: '💪' },
];

export function emojiForWorkout(type: string): string {
  const t = type.toLowerCase();
  if (/run|jog|sprint/.test(t)) return '🏃';
  if (/walk|hike/.test(t)) return '🚶';
  if (/cycl|bike|spin/.test(t)) return '🚴';
  if (/swim/.test(t)) return '🏊';
  if (/gym|lift|weight|strength|push|pull|squat|bench/.test(t)) return '🏋️';
  if (/yoga|stretch|pilates/.test(t)) return '🧘';
  if (/hiit|cardio|circuit|crossfit/.test(t)) return '🔥';
  if (/foot|soccer|cricket|tennis|basket|badminton|sport|padel/.test(t)) return '⚽';
  return '💪';
}

export function labelForWorkout(type: string): string {
  const t = type.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : 'Workout';
}

/** "30 min · 5 km · 4 sets" */
export function describeWorkout(w: Workout): string {
  const bits: string[] = [];
  if (w.minutes) bits.push(`${w.minutes} min`);
  if (w.distanceKm) bits.push(`${w.distanceKm} km`);
  if (w.sets) bits.push(`${w.sets} sets${w.reps ? ` x ${w.reps}` : ''}`);
  return bits.join(' · ');
}

export interface MetricDef {
  key: FitnessMetric;
  label: string;
  emoji: string;
  unit: string;
  kind: 'line' | 'bars';
  /** Step for the quick-entry nudge buttons. */
  step: number;
  /** Placeholder / sensible default for the field. */
  placeholder: string;
  decimals: number;
}

export const METRICS: MetricDef[] = [
  { key: 'weightKg', label: 'Weight', emoji: '⚖️', unit: 'kg', kind: 'line', step: 0.1, placeholder: '72.5', decimals: 1 },
  { key: 'steps', label: 'Steps', emoji: '👣', unit: '', kind: 'bars', step: 500, placeholder: '8000', decimals: 0 },
  { key: 'sleepH', label: 'Sleep', emoji: '😴', unit: 'h', kind: 'bars', step: 0.5, placeholder: '7.5', decimals: 1 },
  { key: 'waterL', label: 'Water', emoji: '💧', unit: 'L', kind: 'bars', step: 0.25, placeholder: '2.5', decimals: 2 },
];

export function metricDef(key: string | undefined): MetricDef {
  return METRICS.find((m) => m.key === key) ?? METRICS[0];
}

export function formatMetric(def: MetricDef, v: number): string {
  const n = def.decimals === 0 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 10 ** def.decimals) / 10 ** def.decimals);
  return def.unit ? `${n} ${def.unit}` : n;
}

/** Last `n` days ending at `end`: the value of `metric` per day, null when not logged. */
export function metricSeries(dayMap: Record<string, FitnessDay>, metric: FitnessMetric, end: string, n = 30): (number | null)[] {
  return Array.from({ length: n }, (_, i) => {
    const v = dayMap[addDays(end, i - (n - 1))]?.[metric];
    return typeof v === 'number' ? v : null;
  });
}

export interface WorkoutRow {
  date: string;
  workout: Workout;
}

/** Newest first, flattened from the days. */
export function recentWorkouts(days: FitnessDay[], limit = 8): WorkoutRow[] {
  const rows: WorkoutRow[] = [];
  for (const d of [...days].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const w of [...(d.workouts || [])].sort((a, b) => b.at - a.at)) rows.push({ date: d.date, workout: w });
    if (rows.length >= limit) break;
  }
  return rows.slice(0, limit);
}
