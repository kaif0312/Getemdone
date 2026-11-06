/**
 * Complete a task from outside the screens (the Android widget's tick). Same writes as `toggleComplete(task, true)` in
 * hooks/useTasks.tsx (KEEP IN STEP): a recurring task gets today's date added to `recurrence.completedDates`, anything else gets
 * `completed` + `completedAt`. Reads the task first so a task that was already done, deleted or is not yours is left alone.
 * The streak is not written here: useStreak (the single writer) recomputes it the next time the app opens.
 */
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { addPending, loadPending, removePending, type PendingTick } from './storage';

export type TickResult = 'done' | 'skipped' | 'failed';

async function signedInUid(): Promise<string | null> {
  try {
    await auth.authStateReady();
  } catch {
    /* fall through to currentUser */
  }
  return auth.currentUser?.uid ?? null;
}

export async function completeTaskById(id: string, date: string): Promise<TickResult> {
  try {
    const uid = await signedInUid();
    if (!uid) return 'failed';
    const ref = doc(db, 'tasks', id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return 'skipped';
    const t = snap.data() as { userId?: string; deleted?: boolean; completed?: boolean; recurrence?: { completedDates?: string[] } | null };
    if (t.userId !== uid || t.deleted) return 'skipped';
    if (t.recurrence) {
      const completedDates = t.recurrence.completedDates ?? [];
      if (completedDates.includes(date)) return 'skipped';
      await updateDoc(ref, { recurrence: { ...t.recurrence, completedDates: [...completedDates, date] } });
      return 'done';
    }
    if (t.completed) return 'skipped';
    await updateDoc(ref, { completed: true, completedAt: Date.now() });
    return 'done';
  } catch {
    return 'failed';
  }
}

/** Tick from the widget: write now, or remember it for the next time the app is open if the write fails (offline). */
export async function tickFromWidget(tick: PendingTick): Promise<TickResult> {
  // Offline, Firestore queues the write and never answers: stop waiting after 10 s and keep the tick for a retry
  // (completing twice is harmless: completeTaskById skips a task that is already done).
  const r = await Promise.race([completeTaskById(tick.id, tick.date), new Promise<TickResult>((res) => setTimeout(() => res('failed'), 10_000))]);
  if (r === 'failed') await addPending(tick);
  return r;
}

/** Retry the ticks that could not be written earlier. Called when the app is open and signed in. */
export async function flushPendingTicks(): Promise<void> {
  for (const tick of await loadPending()) {
    const r = await completeTaskById(tick.id, tick.date);
    if (r !== 'failed') await removePending(tick);
  }
}
