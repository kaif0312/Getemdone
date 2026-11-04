// OWNER: agent "domain". Task operations with the SAME invariants as hooks/useTasks.ts + firestore.rules.
// Admin writes bypass the rules, so every required field/limit is enforced here.
import type { Task, Recurrence, FocusSession } from '@/lib/types';
import { parseRecurrenceFromText } from '@/utils/recurrence';
import { shouldShowInTodayView } from '@/utils/taskFilter';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { recomputeStreak } from './streaks';
import { addDays, getTimezone, getUserRaw, localDate, shiftToServerWallClock } from './users';

export interface NewTaskInput {
  text: string;
  /** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" in the user's zone (task.deferredTo). Omit = today. */
  when?: string;
  /** Deadline, unix ms (task.dueDate). */
  dueDate?: number;
  tags?: string[];
  /** Default: the user's defaultVisibility, else 'everyone'. */
  visibility?: Task['visibility'];
  /** Reminder fire time, unix ms (task.remindAt). `remindFor` = the event time the reminder is about. See lib/server/reminders.ts. */
  remindAt?: number;
  remindFor?: number;
  recurrenceText?: string; // e.g. "every monday" -> utils/recurrence.parseRecurrenceFromText
}

const tasksCol = () => adminDb().collection('tasks');

function toTask(id: string, data: FirebaseFirestore.DocumentData | undefined): Task {
  return { id, ...(data as Omit<Task, 'id'>) };
}

async function ownedRef(uid: string, taskId: string) {
  const ref = tasksCol().doc(taskId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.userId !== uid) throw new Error('Task not found');
  return ref;
}

export async function addTasks(uid: string, items: NewTaskInput[]): Promise<Task[]> {
  const user = await getUserRaw(uid);
  if (!user) throw new Error('User not found');
  const tz = await getTimezone(uid);
  const today = localDate(tz);

  const open = await tasksCol().where('userId', '==', uid).where('completed', '==', false).get();
  let order = open.docs.reduce((m, d) => Math.max(m, d.data().order || 0), 0);

  const created: Task[] = [];
  const batch = adminDb().batch();
  for (const item of items) {
    const text = (item.text || '').trim();
    if (!text) throw new Error('Task text is empty');
    if (text.length > 2000) throw new Error('Task text is too long (max 2000 characters)');

    const visibility = item.visibility ?? user.defaultVisibility ?? 'everyone';
    // Same as the app: the default list only applies to the default visibility.
    const visibilityList =
      !item.visibility || item.visibility === user.defaultVisibility
        ? (visibility === 'only' || visibility === 'except' ? user.defaultVisibilityList ?? [] : [])
        : [];
    const tags = (item.tags ?? []).filter((t) => typeof t === 'string' && t).slice(0, 5);

    let recurrence: Recurrence | undefined;
    if (item.recurrenceText) {
      const parsed = parseRecurrenceFromText(item.recurrenceText);
      if (parsed) {
        // parseRecurrenceFromText stamps startDate from the server clock; use the user's local today.
        recurrence = { ...parsed.recurrence, startDate: today, completedDates: [], skippedDates: [] };
      }
    }

    order += 1;
    const doc = {
      userId: uid,
      text,
      isPrivate: visibility === 'private',
      visibility,
      visibilityList,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
      order,
      deleted: false,
      ...(item.dueDate ? { dueDate: item.dueDate } : {}),
      ...(item.remindAt ? { remindAt: item.remindAt, ...(item.remindFor ? { remindFor: item.remindFor } : {}) } : {}),
      ...(item.when ? { deferredTo: item.when } : {}),
      ...(recurrence ? { recurrence } : {}),
      ...(tags.length ? { tags } : {}),
    };
    const ref = tasksCol().doc();
    batch.set(ref, doc);
    created.push(toTask(ref.id, doc));
  }
  await batch.commit();
  return created;
}

/** Shift timestamps so utils/taskFilter (which uses the runtime's local zone) sees the user's local dates. */
function inUserZone(task: Task, tz: string): Task {
  return {
    ...task,
    createdAt: shiftToServerWallClock(tz, task.createdAt),
    completedAt: task.completedAt ? shiftToServerWallClock(tz, task.completedAt) : task.completedAt,
  };
}

async function allTasks(uid: string): Promise<Task[]> {
  const snap = await tasksCol().where('userId', '==', uid).get();
  return snap.docs.map((d) => toTask(d.id, d.data())).filter((t) => t.deleted !== true);
}

/** Tasks for the user's local today, same rules as utils/taskFilter.shouldShowInTodayView, ordered like the app. */
export async function listToday(uid: string): Promise<Task[]> {
  const tz = await getTimezone(uid);
  const today = localDate(tz);
  const shown = (await allTasks(uid)).filter((t) => shouldShowInTodayView(inUserZone(t, tz), today));
  return shown.sort((a, b) => Number(a.completed) - Number(b.completed) || (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
}

/** Open (not completed, not deleted) tasks, newest first, max `limit`. */
export async function listOpen(uid: string, limit = 50): Promise<Task[]> {
  return (await allTasks(uid))
    .filter((t) => !t.completed)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** Recurring: appends local today to recurrence.completedDates. Then recomputes streak. Returns the updated task. */
export async function completeTask(uid: string, taskId: string): Promise<Task> {
  const ref = await ownedRef(uid, taskId);
  const today = localDate(await getTimezone(uid));
  const updated = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const task = toTask(snap.id, snap.data());
    if (task.recurrence) {
      const completedDates = task.recurrence.completedDates ?? [];
      if (!completedDates.includes(today)) {
        const recurrence = { ...task.recurrence, completedDates: [...completedDates, today] };
        tx.update(ref, { recurrence });
        return { ...task, recurrence };
      }
      return task;
    }
    if (task.completed) return task;
    const patch = { completed: true, completedAt: Date.now() };
    tx.update(ref, patch);
    return { ...task, ...patch };
  });
  await recomputeStreak(uid);
  return updated;
}

export async function uncompleteTask(uid: string, taskId: string): Promise<Task> {
  const ref = await ownedRef(uid, taskId);
  const today = localDate(await getTimezone(uid));
  const updated = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const task = toTask(snap.id, snap.data());
    if (task.recurrence) {
      const recurrence = { ...task.recurrence, completedDates: (task.recurrence.completedDates ?? []).filter((d) => d !== today) };
      tx.update(ref, { recurrence });
      return { ...task, recurrence };
    }
    const patch = { completed: false, completedAt: null };
    tx.update(ref, patch);
    return { ...task, ...patch };
  });
  await recomputeStreak(uid);
  return updated;
}

/** Move to another day ("YYYY-MM-DD", default tomorrow local). Recurring: adds today to skippedDates. */
export async function deferTask(uid: string, taskId: string, toDate?: string): Promise<Task> {
  const ref = await ownedRef(uid, taskId);
  const today = localDate(await getTimezone(uid));
  const target = toDate ?? addDays(today, 1);
  return adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const task = toTask(snap.id, snap.data());
    if (task.recurrence) {
      const skipped = task.recurrence.skippedDates ?? [];
      const recurrence = { ...task.recurrence, skippedDates: skipped.includes(today) ? skipped : [...skipped, today] };
      tx.update(ref, { recurrence });
      return { ...task, recurrence };
    }
    const patch = { deferredTo: target, completed: false, completedAt: null };
    // A reminder for the old day would fire at the wrong time.
    tx.update(ref, { ...patch, remindAt: FieldValue.delete(), remindFor: FieldValue.delete() });
    return { ...task, ...patch };
  });
}

/** Soft delete (deleted:true, deletedAt), like the app. */
export async function deleteTask(uid: string, taskId: string): Promise<void> {
  const ref = await ownedRef(uid, taskId);
  await ref.update({ deleted: true, deletedAt: Date.now() });
}

export async function restoreTask(uid: string, taskId: string): Promise<void> {
  const ref = await ownedRef(uid, taskId);
  await ref.update({ deleted: false, deletedAt: null });
}

const STOP = new Set(['the', 'a', 'an', 'my', 'one', 'task', 'to', 'of', 'that', 'this', 'it', 'and', 'for', 'i']);

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => !STOP.has(t));
}

function tokenMatch(a: string, b: string): boolean {
  return a === b || (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));
}

/** Fuzzy match free text ("the gym one") to one of the user's open tasks; null if ambiguous. */
export async function findTask(uid: string, query: string): Promise<Task | null> {
  const q = tokens(query);
  if (!q.length) return null;
  const open = await listOpen(uid, 500);
  const scored = open
    .map((task) => {
      const tt = tokens(task.text);
      const hits = q.filter((qt) => tt.some((x) => tokenMatch(qt, x))).length;
      const exact = task.text.toLowerCase().includes(query.trim().toLowerCase()) ? 0.5 : 0;
      return { task, score: hits + exact, hits };
    })
    .filter((s) => s.hits >= Math.ceil(q.length / 2))
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1].score === scored[0].score) return null; // ambiguous
  return scored[0].task;
}

/** Morning ritual: focusSessions/{uid}/sessions/{date}, task.focusDate, users.lastFocusSessionDate. */
export async function setFocus(uid: string, taskIds: string[]): Promise<void> {
  const ids = [...new Set(taskIds)];
  if (ids.length > 5) throw new Error('Pick at most 5 focus tasks');
  const db = adminDb();
  const today = localDate(await getTimezone(uid));
  for (const id of ids) await ownedRef(uid, id);
  const batch = db.batch();
  for (const id of ids) batch.update(tasksCol().doc(id), { focusDate: today });
  const session: FocusSession = { date: today, taskIds: ids, completedTaskIds: [], createdAt: Date.now(), skipped: ids.length === 0 };
  batch.set(db.doc(`focusSessions/${uid}/sessions/${today}`), session);
  batch.set(db.doc(`users/${uid}`), { lastFocusSessionDate: today }, { merge: true });
  await batch.commit();
}

/** Evening recap data for local today. */
export async function daySummary(uid: string): Promise<{ done: Task[]; open: Task[]; streak: number; fitnessStreak: number }> {
  const tz = await getTimezone(uid);
  const today = localDate(tz);
  const todays = await listToday(uid);
  const done: Task[] = [];
  const open: Task[] = [];
  for (const t of todays) {
    if (t.completed) done.push(t);
    else open.push(t);
  }
  // Recurring tasks completed today are hidden by shouldShowInTodayView; add them back as done.
  for (const t of await allTasks(uid)) {
    if (t.recurrence?.completedDates?.includes(today)) done.push({ ...t, completed: true });
  }
  const streak = await recomputeStreak(uid);
  return { done, open, streak: streak.currentStreak, fitnessStreak: streak.fitnessStreak ?? 0 };
}

/** Set (or clear with null) the reminder of a task. `remindFor` = what the reminder is about (event time), for the message. */
export async function setReminder(uid: string, taskId: string, remindAt: number | null, remindFor?: number): Promise<Task> {
  const ref = await ownedRef(uid, taskId);
  await ref.update(
    remindAt
      ? { remindAt, remindFor: remindFor ?? FieldValue.delete(), remindSentFor: FieldValue.delete() }
      : { remindAt: FieldValue.delete(), remindFor: FieldValue.delete() },
  );
  const snap = await ref.get();
  return toTask(snap.id, snap.data());
}
