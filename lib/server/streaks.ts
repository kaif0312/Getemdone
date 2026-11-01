// OWNER: agent "domain". Server port of AuthContext.updateStreakData (pure core + Firestore wrapper).
import type { StreakData } from '@/lib/types';

/** Recompute users/{uid}.streakData (+ fitnessStreak) from tasks, focus sessions and fitness days, in the user's zone. */
export async function recomputeStreak(uid: string): Promise<StreakData & { fitnessStreak?: number }> { throw new Error('TODO' + uid); }
