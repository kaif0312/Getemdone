/**
 * Own tasks: real-time list + every write the PWA's hooks/useTasks.ts does, with the same field shapes and invariants.
 * (Friends' tasks live in useFriends; comments/reactions/nudges in useTaskSocial.)
 *
 *   const { tasks, loading, error, addTask, toggleComplete, ... } = useTasks();   // context: one shared listener
 *
 * - `tasks`: own, not deleted, decrypted, newest first (same order the PWA uses). Filter for "Today" with
 *   shouldShowInTodayView(task, todayStr) from '@/lib/taskFilter'.
 * - Firestore applies local writes to the snapshot immediately, so the list updates optimistically with no extra state.
 * - Timestamps are ms numbers; dates 'YYYY-MM-DD' in the DEVICE zone (like the PWA) unless a date is passed in.
 * - Text and notes are encrypted for self when E2EE_ENABLED (currently false = plaintext), and `friendContent` is written
 *   for every friend the task is visible to, exactly like the PWA, so friends (and the bot) can read it.
 * KEEP IN STEP with hooks/useTasks.ts and lib/server/tasks.ts (defer clears reminders, setFocus writes the session).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { deleteObject, ref as storageRef } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { getTodayString } from '@/lib/taskFilter';
import type { Attachment, FocusSession, Recurrence, Subtask, Task, TaskVisibility } from '@/lib/types';
import { useAuth } from './useAuth';
import { useEncryption } from './useEncryption';

export interface NewTaskInput {
  text: string;
  /** Default: the user's defaultVisibility, else 'everyone'. */
  visibility?: TaskVisibility;
  visibilityList?: string[];
  dueDate?: number | null;
  /** Server reminder fire time (ms). Picked up by the 15-min reminder cron (exact-time scheduling is bot-only). */
  remindAt?: number | null;
  /** Scheduled day 'YYYY-MM-DD' (the PWA calls this deferredTo). */
  scheduledFor?: string | null;
  recurrence?: Recurrence | null;
  tags?: string[];
  committed?: boolean;
  focusDate?: string | null;
  notes?: string;
  subtasks?: Subtask[];
}

const todayStr = getTodayString;

function noUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function useTasksState() {
  const { uid, profile } = useAuth();
  const enc = useEncryption();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const tasksRef = useRef<Task[]>([]);
  tasksRef.current = tasks;
  const friends = profile?.friends;
  const friendsRef = useRef<string[]>([]);
  friendsRef.current = friends ?? [];
  const defaultsRef = useRef({ vis: profile?.defaultVisibility, list: profile?.defaultVisibilityList });
  defaultsRef.current = { vis: profile?.defaultVisibility, list: profile?.defaultVisibilityList };

  // ---- listener ---------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!uid) {
      setTasks([]);
      setLoading(false);
      return;
    }
    // Wait for the key before decrypting (never show ciphertext, never decrypt with a temporary key).
    if (!enc.isInitialized) {
      setLoading(true);
      return;
    }
    let seq = 0;
    const q = query(collection(db, 'tasks'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const mine = ++seq;
        const decrypted = await Promise.all(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Task)
            .filter((t) => t.deleted !== true)
            .map(async (task) => decryptOwn(task)),
        );
        if (mine !== seq) return; // a newer snapshot already started
        setTasks(decrypted);
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('[useTasks] listener error', err);
        setError(err);
        setLoading(false);
      },
    );
    return () => {
      seq++;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, enc.isInitialized, reloadTick]);

  const decryptOwn = useCallback(
    async (task: Task): Promise<Task> => {
      try {
        const out: Task = { ...task, text: await enc.decryptForSelf(task.text) };
        if (task.notes) out.notes = await enc.decryptForSelf(task.notes);
        if (task.comments?.length && uid) {
          out.comments = await Promise.all(
            task.comments.map(async (c) => ({
              ...c,
              text: await enc.decryptComment(c.friendContent?.[uid] ?? c.text, task.userId, c.userId, uid),
            })),
          );
        }
        return out;
      } catch (e) {
        console.warn('[useTasks] decrypt failed', e);
        return task;
      }
    },
    [enc, uid],
  );

  const retry = useCallback(() => {
    setLoading(true);
    setReloadTick((n) => n + 1);
  }, []);

  // ---- helpers ----------------------------------------------------------------------------------------------------
  const friendTargets = useCallback((visibility: TaskVisibility, list: string[]): string[] => {
    const all = friendsRef.current;
    if (visibility === 'private' || all.length === 0) return [];
    if (visibility === 'everyone') return all;
    if (visibility === 'only') return list;
    return all.filter((f) => !list.includes(f));
  }, []);

  const buildFriendContent = useCallback(
    async (plain: string, targets: string[]): Promise<Record<string, string> | undefined> => {
      if (!enc.isInitialized || targets.length === 0) return undefined;
      const out: Record<string, string> = {};
      for (const f of targets) out[f] = await enc.encryptForFriend(plain, f);
      return out;
    },
    [enc],
  );

  const taskRef = (id: string) => doc(db, 'tasks', id);

  // ---- writes -----------------------------------------------------------------------------------------------------
  const addTask = useCallback(
    async (input: NewTaskInput): Promise<string | null> => {
      if (!uid) return null;
      const text = input.text.trim();
      if (!text) throw new Error('Task text cannot be empty');
      if (text.length > 500) throw new Error('Task text must be 500 characters or less');

      const open = tasksRef.current.filter((t) => !t.completed);
      const maxOrder = open.length ? Math.max(...open.map((t) => t.order || 0)) : 0;

      const visibility: TaskVisibility = input.visibility ?? defaultsRef.current.vis ?? 'everyone';
      const visibilityList = input.visibilityList ?? defaultsRef.current.list ?? [];
      const isPrivate = visibility === 'private';
      const friendContent = isPrivate ? undefined : await buildFriendContent(text, friendTargets(visibility, visibilityList));
      const encryptedText = enc.isInitialized ? await enc.encryptForSelf(text) : text;
      const encryptedNotes = input.notes?.trim() ? await enc.encryptForSelf(input.notes.trim()) : undefined;

      const newTask = noUndefined({
        userId: uid,
        text: encryptedText,
        ...(friendContent && Object.keys(friendContent).length > 0 ? { friendContent } : {}),
        isPrivate,
        visibility,
        visibilityList,
        completed: false,
        createdAt: Date.now(),
        completedAt: null,
        order: maxOrder + 1,
        deleted: false,
        dueDate: input.dueDate || undefined,
        remindAt: input.remindAt || undefined,
        remindFor: input.remindAt ? (input.dueDate || input.remindAt) : undefined,
        deferredTo: input.scheduledFor || undefined,
        recurrence: input.recurrence
          ? { ...input.recurrence, startDate: input.recurrence.startDate || todayStr(), completedDates: [], skippedDates: [] }
          : undefined,
        tags: input.tags && input.tags.length > 0 ? input.tags.slice(0, 5) : undefined,
        committed: input.committed || undefined,
        focusDate: input.focusDate || undefined,
        notes: encryptedNotes,
        subtasks: input.subtasks && input.subtasks.length > 0 ? input.subtasks : undefined,
      });
      const docRef = await addDoc(collection(db, 'tasks'), newTask);
      return docRef.id;
    },
    [uid, enc, buildFriendContent, friendTargets],
  );

  /** Several tasks at once (multi-line Add). Skips blanks. Returns created ids. */
  const addTasks = useCallback(
    async (inputs: NewTaskInput[]): Promise<string[]> => {
      const ids: string[] = [];
      for (const input of inputs) {
        if (!input.text.trim()) continue;
        const id = await addTask(input);
        if (id) ids.push(id);
      }
      return ids;
    },
    [addTask],
  );

  /** Complete / uncomplete. Recurring tasks add/remove `dateStr` (default today) in recurrence.completedDates. */
  const toggleComplete = useCallback(async (task: Task, completed: boolean, dateStr?: string) => {
    if (task.recurrence && completed) {
      const completedDates = [...(task.recurrence.completedDates || []), dateStr ?? todayStr()];
      await updateDoc(taskRef(task.id), { recurrence: { ...task.recurrence, completedDates } });
      return;
    }
    if (task.recurrence && !completed) {
      const target = dateStr ?? todayStr();
      const completedDates = (task.recurrence.completedDates || []).filter((d) => d !== target);
      await updateDoc(taskRef(task.id), { recurrence: { ...task.recurrence, completedDates } });
      return;
    }
    await updateDoc(taskRef(task.id), { completed, completedAt: completed ? Date.now() : null });
  }, []);

  const completeTask = useCallback((task: Task, dateStr?: string) => toggleComplete(task, true, dateStr), [toggleComplete]);
  const uncompleteTask = useCallback((task: Task, dateStr?: string) => toggleComplete(task, false, dateStr), [toggleComplete]);

  /** Move to another day ('YYYY-MM-DD'), or null to clear. Recurring: skips today's instance. Clears reminders (server rule). */
  const deferTask = useCallback(async (task: Task, toDate: string | null) => {
    if (task.recurrence && toDate) {
      const skipped = task.recurrence.skippedDates || [];
      const today = todayStr();
      await updateDoc(taskRef(task.id), { recurrence: { ...task.recurrence, skippedDates: skipped.includes(today) ? skipped : [...skipped, today] } });
      return;
    }
    const patch: Record<string, unknown> = { deferredTo: toDate || null };
    if (toDate) {
      patch.completed = false;
      patch.completedAt = null;
      patch.remindAt = deleteField();
      patch.remindFor = deleteField();
    }
    await updateDoc(taskRef(task.id), patch);
  }, []);

  const updateText = useCallback(
    async (taskId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) throw new Error('Task text cannot be empty');
      if (trimmed.length > 500) throw new Error('Task text must be 500 characters or less');
      const patch: Record<string, unknown> = { text: enc.isInitialized ? await enc.encryptForSelf(trimmed) : trimmed };
      const existing = tasksRef.current.find((t) => t.id === taskId);
      const isPrivate = existing ? existing.isPrivate || existing.visibility === 'private' : false;
      if (!isPrivate && enc.isInitialized && friendsRef.current.length > 0) {
        // Same as the PWA: re-encrypt for every friend (not only the visible ones).
        patch.friendContent = await buildFriendContent(trimmed, friendsRef.current);
      }
      await updateDoc(taskRef(taskId), patch);
    },
    [enc, buildFriendContent],
  );

  const setDueDate = useCallback(async (taskId: string, dueDate: number | null) => {
    await updateDoc(taskRef(taskId), { dueDate: dueDate || null });
  }, []);

  /** Reminder fire time (ms) or null to clear. `eventAt` = what the reminder is about (shown in the message). */
  const setRemindAt = useCallback(async (taskId: string, remindAt: number | null, eventAt?: number) => {
    await updateDoc(
      taskRef(taskId),
      remindAt
        ? { remindAt, remindFor: eventAt ?? deleteField(), remindSentFor: deleteField() }
        : { remindAt: deleteField(), remindFor: deleteField() },
    );
  }, []);

  const setVisibility = useCallback(
    async (taskId: string, visibility: TaskVisibility, visibilityList: string[]) => {
      const patch: Record<string, unknown> = { isPrivate: visibility === 'private', visibility, visibilityList };
      if (visibility === 'private') {
        patch.friendContent = {};
      } else if (enc.isInitialized && friendsRef.current.length > 0) {
        const snap = await getDoc(taskRef(taskId));
        const raw = snap.exists() ? (snap.data() as Task) : null;
        if (raw?.text) {
          const plain = await enc.decryptForSelf(raw.text);
          if (plain && !plain.includes("Couldn't decrypt")) {
            patch.friendContent = (await buildFriendContent(plain, friendTargets(visibility, visibilityList))) ?? {};
          }
        }
      }
      await updateDoc(taskRef(taskId), patch);
    },
    [enc, buildFriendContent, friendTargets],
  );

  const setCommitted = useCallback(async (taskId: string, committed: boolean) => {
    await updateDoc(taskRef(taskId), { committed });
  }, []);

  /** Put a task in (or out of, with null) today's Focus. */
  const setFocusDate = useCallback(async (taskId: string, focusDate: string | null) => {
    await updateDoc(taskRef(taskId), { focusDate: focusDate ?? null });
  }, []);

  /** Morning ritual: mark 1-5 tasks as focus for `date` and write the session (useMorningFocusRitual / lib/server setFocus). */
  const commitFocus = useCallback(
    async (taskIds: string[], date: string = todayStr()) => {
      if (!uid) return;
      const ids = [...new Set(taskIds)];
      if (ids.length > 5) throw new Error('Pick at most 5 focus tasks');
      const batch = writeBatch(db);
      for (const id of ids) batch.update(taskRef(id), { focusDate: date });
      const session: FocusSession = { date, taskIds: ids, completedTaskIds: [], createdAt: Date.now(), skipped: ids.length === 0 };
      batch.set(doc(db, 'focusSessions', uid, 'sessions', date), session);
      batch.set(doc(db, 'users', uid), { lastFocusSessionDate: date }, { merge: true });
      await batch.commit();
    },
    [uid],
  );

  /** "Skip for now" on the morning ritual. */
  const skipFocus = useCallback(
    async (date: string = todayStr()) => {
      if (!uid) return;
      const session: FocusSession = { date, taskIds: [], completedTaskIds: [], createdAt: Date.now(), skipped: true };
      await setDoc(doc(db, 'focusSessions', uid, 'sessions', date), session);
      await setDoc(doc(db, 'users', uid), { lastFocusSessionDate: date }, { merge: true });
    },
    [uid],
  );

  const setTags = useCallback(async (taskId: string, tags: string[]) => {
    if (tags.length > 5) throw new Error('Maximum 5 tags per task');
    await updateDoc(taskRef(taskId), { tags });
  }, []);

  /** Recurrence on/off. Converting a completed task to recurring moves its completion into completedDates (like the PWA). */
  const setRecurrence = useCallback(async (taskId: string, recurrence: Recurrence | null) => {
    if (!recurrence) {
      await updateDoc(taskRef(taskId), { recurrence: null });
      return;
    }
    const snap = await getDoc(taskRef(taskId));
    const existing = snap.exists() ? (snap.data() as Task) : null;
    let completedDates = existing?.recurrence?.completedDates ?? [];
    const patch: Record<string, unknown> = {};
    if (existing?.completed && existing.completedAt) {
      const d = new Date(existing.completedAt);
      const done = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!completedDates.includes(done)) completedDates = [...completedDates, done];
      patch.completed = false;
      patch.completedAt = null;
    }
    patch.recurrence = {
      ...recurrence,
      startDate: recurrence.startDate || todayStr(),
      completedDates,
      skippedDates: existing?.recurrence?.skippedDates ?? [],
    };
    await updateDoc(taskRef(taskId), patch);
  }, []);

  /** Notes are private to the owner (never in friendContent). Empty string clears. */
  const setNotes = useCallback(
    async (taskId: string, notes: string) => {
      const trimmed = notes.trim();
      await updateDoc(taskRef(taskId), { notes: trimmed ? (enc.isInitialized ? await enc.encryptForSelf(trimmed) : trimmed) : null });
    },
    [enc],
  );

  const setSubtasks = useCallback(async (taskId: string, subtasks: Subtask[]) => {
    if (subtasks.length > 100) throw new Error('Maximum 100 subtasks');
    await updateDoc(taskRef(taskId), { subtasks });
  }, []);

  const setSkipRollover = useCallback(async (taskId: string, skipRollover: boolean) => {
    await updateDoc(taskRef(taskId), { skipRollover });
  }, []);

  const reorder = useCallback(async (taskId: string, order: number) => {
    await updateDoc(taskRef(taskId), { order });
  }, []);

  /** Soft delete (recycle bin), like the PWA and the bot. */
  const deleteTask = useCallback(async (taskId: string) => {
    await updateDoc(taskRef(taskId), { deleted: true, deletedAt: Date.now() });
  }, []);

  const restoreTask = useCallback(async (taskId: string) => {
    await updateDoc(taskRef(taskId), { deleted: false, deletedAt: null });
  }, []);

  /** Hard delete incl. attachment files. Only from the recycle bin. */
  const permanentlyDeleteTask = useCallback(async (taskId: string) => {
    const snap = await getDoc(taskRef(taskId));
    if (snap.exists()) {
      const t = snap.data() as Task;
      await Promise.all(
        (t.attachments ?? []).map(async (a) => {
          try {
            await deleteObject(storageRef(storage, `attachments/${taskId}/${a.id}`));
            if (a.thumbnailUrl) await deleteObject(storageRef(storage, `attachments/${taskId}/${a.id}_thumb`));
          } catch (e) {
            console.warn('[useTasks] attachment delete', a.id, e);
          }
        }),
      );
    }
    await deleteDoc(taskRef(taskId));
  }, []);

  /** Recycle bin contents (decrypted), newest deletion first. */
  const fetchDeleted = useCallback(async (): Promise<Task[]> => {
    if (!uid) return [];
    const snap = await getDocs(query(collection(db, 'tasks'), where('userId', '==', uid), where('deleted', '==', true), orderBy('deletedAt', 'desc')));
    return Promise.all(snap.docs.map((d) => decryptOwn({ id: d.id, ...d.data() } as Task)));
  }, [uid, decryptOwn]);

  const emptyBin = useCallback(async (): Promise<number> => {
    if (!uid) return 0;
    const snap = await getDocs(query(collection(db, 'tasks'), where('userId', '==', uid), where('deleted', '==', true)));
    let n = 0;
    for (const d of snap.docs) {
      try {
        await permanentlyDeleteTask(d.id);
        n++;
      } catch (e) {
        console.warn('[useTasks] emptyBin', d.id, e);
      }
    }
    return n;
  }, [uid, permanentlyDeleteTask]);

  /** Attachment metadata on the task (the file upload itself is done by the feature with expo-image-picker + firebase storage). */
  const addAttachment = useCallback(async (taskId: string, attachment: Attachment) => {
    const snap = await getDoc(taskRef(taskId));
    if (!snap.exists()) throw new Error('Task not found');
    const current = (snap.data().attachments || []) as Attachment[];
    if (current.length >= 3) throw new Error('Maximum 3 attachments per task');
    await updateDoc(taskRef(taskId), { attachments: [...current, attachment] });
  }, []);

  const removeAttachment = useCallback(async (taskId: string, attachmentId: string) => {
    const snap = await getDoc(taskRef(taskId));
    if (!snap.exists()) return;
    const current = (snap.data().attachments || []) as Attachment[];
    const target = current.find((a) => a.id === attachmentId);
    if (target) {
      try {
        await deleteObject(storageRef(storage, `attachments/${taskId}/${attachmentId}`));
        if (target.thumbnailUrl) await deleteObject(storageRef(storage, `attachments/${taskId}/${attachmentId}_thumb`));
      } catch (e) {
        console.warn('[useTasks] storage delete', e);
      }
    }
    await updateDoc(taskRef(taskId), { attachments: current.filter((a) => a.id !== attachmentId) });
  }, []);

  return useMemo(
    () => ({
      tasks, loading, error, retry,
      addTask, addTasks, toggleComplete, completeTask, uncompleteTask, deferTask,
      updateText, setDueDate, setRemindAt, setVisibility, setCommitted, setFocusDate, commitFocus, skipFocus,
      setTags, setRecurrence, setNotes, setSubtasks, setSkipRollover, reorder,
      deleteTask, restoreTask, permanentlyDeleteTask, fetchDeleted, emptyBin, addAttachment, removeAttachment,
    }),
    [
      tasks, loading, error, retry, addTask, addTasks, toggleComplete, completeTask, uncompleteTask, deferTask, updateText, setDueDate,
      setRemindAt, setVisibility, setCommitted, setFocusDate, commitFocus, skipFocus, setTags, setRecurrence, setNotes, setSubtasks,
      setSkipRollover, reorder, deleteTask, restoreTask, permanentlyDeleteTask, fetchDeleted, emptyBin, addAttachment, removeAttachment,
    ],
  );
}

export type UseTasks = ReturnType<typeof useTasksState>;

const TasksContext = createContext<UseTasks | null>(null);

/** Mounted once (app/_layout.tsx) so every screen shares ONE listener and one decrypted list. */
export function TasksProvider({ children }: { children: React.ReactNode }) {
  const value = useTasksState();
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): UseTasks {
  const v = useContext(TasksContext);
  if (!v) throw new Error('useTasks must be used inside <TasksProvider>');
  return v;
}
