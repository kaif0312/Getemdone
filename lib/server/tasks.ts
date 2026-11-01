// OWNER: agent "domain". Task operations with the SAME invariants as hooks/useTasks.ts + firestore.rules.
import type { Task } from '@/lib/types';

export interface NewTaskInput {
  text: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" in the user's zone (task.deferredTo). Omit = today. */
  when?: string;
  /** Deadline, unix ms (task.dueDate). */
  dueDate?: number;
  tags?: string[];
  /** Default: the user's defaultVisibility, else 'everyone'. */
  visibility?: Task['visibility'];
  recurrenceText?: string; // e.g. "every monday" -> utils/recurrence.parseRecurrenceFromText
}

export async function addTasks(uid: string, items: NewTaskInput[]): Promise<Task[]> { throw new Error('TODO' + uid + items); }
/** Tasks for the user's local today, same rules as utils/taskFilter.shouldShowInTodayView, ordered like the app. */
export async function listToday(uid: string): Promise<Task[]> { throw new Error('TODO' + uid); }
/** Open (not completed, not deleted) tasks, newest first, max `limit`. */
export async function listOpen(uid: string, limit?: number): Promise<Task[]> { throw new Error('TODO' + uid + limit); }
/** Recurring: appends local today to recurrence.completedDates. Then recomputes streak. Returns the updated task. */
export async function completeTask(uid: string, taskId: string): Promise<Task> { throw new Error('TODO' + uid + taskId); }
export async function uncompleteTask(uid: string, taskId: string): Promise<Task> { throw new Error('TODO' + uid + taskId); }
/** Move to another day ("YYYY-MM-DD", default tomorrow local). Recurring: adds today to skippedDates. */
export async function deferTask(uid: string, taskId: string, toDate?: string): Promise<Task> { throw new Error('TODO' + uid + taskId + toDate); }
/** Soft delete (deleted:true, deletedAt), like the app. */
export async function deleteTask(uid: string, taskId: string): Promise<void> { throw new Error('TODO' + uid + taskId); }
export async function restoreTask(uid: string, taskId: string): Promise<void> { throw new Error('TODO' + uid + taskId); }
/** Fuzzy match free text ("the gym one") to one of the user's open tasks; null if ambiguous. */
export async function findTask(uid: string, query: string): Promise<Task | null> { throw new Error('TODO' + uid + query); }
/** Morning ritual: focusSessions/{uid}/sessions/{date}, task.focusDate, users.lastFocusSessionDate. */
export async function setFocus(uid: string, taskIds: string[]): Promise<void> { throw new Error('TODO' + uid + taskIds); }
/** Evening recap data for local today. */
export async function daySummary(uid: string): Promise<{ done: Task[]; open: Task[]; streak: number; fitnessStreak: number }> { throw new Error('TODO' + uid); }
