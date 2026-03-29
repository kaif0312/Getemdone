'use client';

import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FocusSession, Task } from '@/lib/types';
import { getTodayString } from '@/utils/taskFilter';

function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLocalStorageKey(date: string): string {
  return `nudge_focus_ritual_${date}`;
}

export interface MorningFocusRitualState {
  showRecap: boolean;
  showSelection: boolean;
  yesterdaySession: FocusSession | null;
  isLoading: boolean;
}

export interface MorningFocusRitualActions {
  confirmFocusSelection: (selectedIds: string[], toggleFocus: (taskId: string, date: string | null) => Promise<void>) => Promise<void>;
  skipFocusSession: () => Promise<void>;
  completeRecap: () => void;
  skipRecap: () => void;
}

export function useMorningFocusRitual(
  uid: string | undefined,
  lastFocusSessionDate: string | undefined,
  tasksLoaded: boolean
): MorningFocusRitualState & MorningFocusRitualActions {
  const [showRecap, setShowRecap] = useState(false);
  const [showSelection, setShowSelection] = useState(false);
  const [yesterdaySession, setYesterdaySession] = useState<FocusSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!uid || !tasksLoaded) return;

    const todayStr = getTodayString();
    const hour = new Date().getHours();

    // Only show before 11am
    if (hour >= 11) return;

    // Already did the ritual today
    if (lastFocusSessionDate === todayStr) return;

    // Check localStorage deduplication (handles same-day page refreshes)
    try {
      if (localStorage.getItem(getLocalStorageKey(todayStr)) === 'done') return;
    } catch {
      // ignore localStorage errors
    }

    const checkYesterday = async () => {
      setIsLoading(true);
      try {
        const yesterdayStr = getYesterdayString();
        const sessionRef = doc(db, 'focusSessions', uid, 'sessions', yesterdayStr);
        const sessionSnap = await getDoc(sessionRef);

        if (sessionSnap.exists()) {
          const session = sessionSnap.data() as FocusSession;
          if (!session.skipped && session.taskIds && session.taskIds.length > 0) {
            // Check if there are any incomplete focus tasks from yesterday
            const hasIncomplete = session.taskIds.some(
              (id: string) => !session.completedTaskIds?.includes(id)
            );
            setYesterdaySession(session);
            if (hasIncomplete) {
              setShowRecap(true);
            } else {
              // All done yesterday — show a brief celebration before selection
              setShowRecap(true);
            }
          } else {
            setShowSelection(true);
          }
        } else {
          setShowSelection(true);
        }
      } catch {
        // On error, fall through to selection
        setShowSelection(true);
      } finally {
        setIsLoading(false);
      }
    };

    checkYesterday();
  }, [uid, lastFocusSessionDate, tasksLoaded]);

  const confirmFocusSelection = useCallback(async (
    selectedIds: string[],
    toggleFocus: (taskId: string, date: string | null) => Promise<void>
  ) => {
    if (!uid) return;
    const todayStr = getTodayString();

    // Set focusDate on each selected task
    await Promise.all(selectedIds.map((id) => toggleFocus(id, todayStr)));

    // Write focus session to Firestore
    const session: FocusSession = {
      date: todayStr,
      taskIds: selectedIds,
      completedTaskIds: [],
      createdAt: Date.now(),
      skipped: false,
    };

    try {
      const sessionRef = doc(db, 'focusSessions', uid, 'sessions', todayStr);
      await setDoc(sessionRef, session);
      // Update lastFocusSessionDate on user doc
      await setDoc(doc(db, 'users', uid), { lastFocusSessionDate: todayStr }, { merge: true });
    } catch (err) {
      console.error('[useMorningFocusRitual] Failed to save session:', err);
    }

    // Persist deduplication key
    try {
      localStorage.setItem(getLocalStorageKey(todayStr), 'done');
    } catch {
      // ignore
    }

    setShowSelection(false);
  }, [uid]);

  const skipFocusSession = useCallback(async () => {
    if (!uid) return;
    const todayStr = getTodayString();

    const skippedSession: FocusSession = {
      date: todayStr,
      taskIds: [],
      completedTaskIds: [],
      createdAt: Date.now(),
      skipped: true,
    };

    try {
      const sessionRef = doc(db, 'focusSessions', uid, 'sessions', todayStr);
      await setDoc(sessionRef, skippedSession);
      await setDoc(doc(db, 'users', uid), { lastFocusSessionDate: todayStr }, { merge: true });
    } catch (err) {
      console.error('[useMorningFocusRitual] Failed to save skip:', err);
    }

    try {
      localStorage.setItem(getLocalStorageKey(todayStr), 'done');
    } catch {
      // ignore
    }

    setShowRecap(false);
    setShowSelection(false);
  }, [uid]);

  const completeRecap = useCallback(() => {
    setShowRecap(false);
    setShowSelection(true);
  }, []);

  const skipRecap = useCallback(() => {
    setShowRecap(false);
    setShowSelection(true);
  }, []);

  return {
    showRecap,
    showSelection,
    yesterdaySession,
    isLoading,
    confirmFocusSelection,
    skipFocusSession,
    completeRecap,
    skipRecap,
  };
}
