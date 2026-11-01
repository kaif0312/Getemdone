// OWNER: agent "domain". Manual fitness logs. Docs: fitness/{uid}/days/{YYYY-MM-DD}, fitnessGoals/{uid}.
export interface Workout { type: string; minutes?: number; distanceKm?: number; sets?: number; reps?: number; note?: string; source: 'wa' | 'app'; at: number; }
export interface FitnessDay { date: string; workouts: Workout[]; steps?: number; weightKg?: number; sleepH?: number; waterL?: number; updatedAt: number; }
export interface FitnessGoals { workoutsPerWeek?: number; stepsPerDay?: number; targetWeightKg?: number; visibility: 'friends' | 'private'; }
export type Metric = 'steps' | 'weightKg' | 'sleepH' | 'waterL';

export async function logWorkout(uid: string, w: Omit<Workout, 'at' | 'source'> & { date?: string }): Promise<FitnessDay> { throw new Error('TODO' + uid + w); }
export async function logMetric(uid: string, metric: Metric, value: number, date?: string): Promise<FitnessDay> { throw new Error('TODO' + uid + metric + value + date); }
export async function getGoals(uid: string): Promise<FitnessGoals | null> { throw new Error('TODO' + uid); }
export async function setGoals(uid: string, g: Partial<FitnessGoals>): Promise<FitnessGoals> { throw new Error('TODO' + uid + g); }
/** Mon-Sun week containing local today: workouts count vs goal, totals, last weight. */
export async function weekSummary(uid: string): Promise<{ workouts: number; goal?: number; minutes: number; distanceKm: number; lastWeightKg?: number; days: FitnessDay[] }> { throw new Error('TODO' + uid); }
/** Remove the most recent workout entry of local today (for undo). */
export async function undoLastWorkout(uid: string): Promise<void> { throw new Error('TODO' + uid); }
