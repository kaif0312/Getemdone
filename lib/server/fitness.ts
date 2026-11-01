// OWNER: agent "domain". Manual fitness logs. Docs: fitness/{uid}/days/{YYYY-MM-DD}, fitnessGoals/{uid}.
import { FieldPath } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { recomputeStreak } from './streaks';
import { addDays, dayOfWeek, getTimezone, localDate } from './users';

export interface Workout { type: string; minutes?: number; distanceKm?: number; sets?: number; reps?: number; note?: string; source: 'wa' | 'app'; at: number; }
export interface FitnessDay { date: string; workouts: Workout[]; steps?: number; weightKg?: number; sleepH?: number; waterL?: number; updatedAt: number; }
export interface FitnessGoals { workoutsPerWeek?: number; stepsPerDay?: number; targetWeightKg?: number; visibility: 'friends' | 'private'; }
export type Metric = 'steps' | 'weightKg' | 'sleepH' | 'waterL';

const METRICS: Metric[] = ['steps', 'weightKg', 'sleepH', 'waterL'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dayRef = (uid: string, date: string) => adminDb().doc(`fitness/${uid}/days/${date}`);

function emptyDay(date: string): FitnessDay {
  return { date, workouts: [], updatedAt: Date.now() };
}

async function resolveDate(uid: string, date?: string): Promise<string> {
  if (date) {
    if (!DATE_RE.test(date)) throw new Error('Invalid date: ' + date);
    return date;
  }
  return localDate(await getTimezone(uid));
}

function num(v: unknown, name: string, opts: { positive?: boolean } = {}): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (opts.positive && v === 0)) {
    throw new Error(`Invalid ${name}`);
  }
  return v;
}

export async function logWorkout(uid: string, w: Omit<Workout, 'at' | 'source'> & { date?: string }): Promise<FitnessDay> {
  const type = (w.type || '').trim().slice(0, 60);
  if (!type) throw new Error('Workout type is required');
  const date = await resolveDate(uid, w.date);
  // Firestore rejects undefined, so only set the fields that were given.
  const entry: Workout = { type, source: 'wa', at: Date.now() };
  const minutes = num(w.minutes, 'minutes');
  const distanceKm = num(w.distanceKm, 'distanceKm');
  const sets = num(w.sets, 'sets');
  const reps = num(w.reps, 'reps');
  if (minutes !== undefined) entry.minutes = minutes;
  if (distanceKm !== undefined) entry.distanceKm = distanceKm;
  if (sets !== undefined) entry.sets = sets;
  if (reps !== undefined) entry.reps = reps;
  if (w.note) entry.note = w.note.slice(0, 500);

  const ref = dayRef(uid, date);
  const day = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? (snap.data() as FitnessDay) : emptyDay(date);
    const next: FitnessDay = { ...cur, date, workouts: [...(cur.workouts || []), entry], updatedAt: Date.now() };
    tx.set(ref, next);
    return next;
  });
  await recomputeStreak(uid);
  return day;
}

export async function logMetric(uid: string, metric: Metric, value: number, date?: string): Promise<FitnessDay> {
  if (!METRICS.includes(metric)) throw new Error('Unknown metric: ' + metric);
  const v = num(value, metric, { positive: true });
  if (v === undefined) throw new Error('Invalid ' + metric);
  const d = await resolveDate(uid, date);
  const ref = dayRef(uid, d);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? (snap.data() as FitnessDay) : emptyDay(d);
    const next: FitnessDay = { ...cur, date: d, workouts: cur.workouts || [], [metric]: v, updatedAt: Date.now() };
    tx.set(ref, next);
    return next;
  });
}

export async function getGoals(uid: string): Promise<FitnessGoals | null> {
  const snap = await adminDb().doc(`fitnessGoals/${uid}`).get();
  return snap.exists ? (snap.data() as FitnessGoals) : null;
}

export async function setGoals(uid: string, g: Partial<FitnessGoals>): Promise<FitnessGoals> {
  const patch: Partial<FitnessGoals> = {};
  const wpw = num(g.workoutsPerWeek, 'workoutsPerWeek');
  const spd = num(g.stepsPerDay, 'stepsPerDay');
  const tw = num(g.targetWeightKg, 'targetWeightKg');
  if (wpw !== undefined) patch.workoutsPerWeek = Math.min(14, Math.round(wpw));
  if (spd !== undefined) patch.stepsPerDay = Math.round(spd);
  if (tw !== undefined) patch.targetWeightKg = tw;
  if (g.visibility === 'friends' || g.visibility === 'private') patch.visibility = g.visibility;
  const ref = adminDb().doc(`fitnessGoals/${uid}`);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const merged = { visibility: 'friends', ...(snap.exists ? snap.data() : {}), ...patch } as FitnessGoals;
    tx.set(ref, merged);
    return merged;
  });
}

/** Mon-Sun week containing local today: workouts count vs goal, totals, last weight. */
export async function weekSummary(uid: string): Promise<{ workouts: number; goal?: number; minutes: number; distanceKm: number; lastWeightKg?: number; days: FitnessDay[] }> {
  const today = localDate(await getTimezone(uid));
  const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
  const sunday = addDays(monday, 6);
  const col = adminDb().collection(`fitness/${uid}/days`);
  const snap = await col.where(FieldPath.documentId(), '>=', monday).where(FieldPath.documentId(), '<=', sunday).get();
  const days = snap.docs.map((d) => d.data() as FitnessDay).sort((a, b) => a.date.localeCompare(b.date));

  let workouts = 0;
  let minutes = 0;
  let distanceKm = 0;
  for (const day of days) {
    for (const w of day.workouts || []) {
      workouts++;
      minutes += w.minutes || 0;
      distanceKm += w.distanceKm || 0;
    }
  }
  let lastWeightKg = [...days].reverse().find((d) => typeof d.weightKg === 'number')?.weightKg;
  if (lastWeightKg === undefined) {
    // No weigh-in this week: fall back to the most recent one on record.
    const recent = await col.orderBy(FieldPath.documentId(), 'desc').limit(60).get();
    lastWeightKg = recent.docs.map((d) => d.data() as FitnessDay).find((d) => typeof d.weightKg === 'number')?.weightKg;
  }
  const goal = (await getGoals(uid))?.workoutsPerWeek;
  return {
    workouts, ...(goal !== undefined && { goal }), minutes, distanceKm: Math.round(distanceKm * 100) / 100,
    ...(lastWeightKg !== undefined && { lastWeightKg }), days,
  };
}

/** Remove the most recent workout entry of local today (for undo). */
export async function undoLastWorkout(uid: string): Promise<void> {
  const date = localDate(await getTimezone(uid));
  const ref = dayRef(uid, date);
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const cur = snap.data() as FitnessDay;
    const workouts = [...(cur.workouts || [])];
    if (!workouts.length) return;
    let idx = 0;
    workouts.forEach((w, i) => { if (w.at >= workouts[idx].at) idx = i; });
    workouts.splice(idx, 1);
    tx.set(ref, { ...cur, workouts, updatedAt: Date.now() });
  });
  await recomputeStreak(uid);
}
