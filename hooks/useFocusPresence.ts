'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FocusPresenceData } from '@/lib/types';

const PRESENCE_LS_KEY = 'nudge_focus_presence_started_at';
// Auto-end focus after 4 hours of no interaction (safety valve)
const MAX_FOCUS_MS = 4 * 60 * 60 * 1000;

export interface FocusPresenceState {
  isActive: boolean;
  startedAt: number | null;
  elapsedSeconds: number;
  focusTaskCount: number;
}

export interface FocusPresenceActions {
  startFocus: (taskCount: number) => Promise<void>;
  endFocus: () => Promise<void>;
}

export function useFocusPresence(
  uid: string | undefined
): FocusPresenceState & FocusPresenceActions {
  const [isActive, setIsActive] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [focusTaskCount, setFocusTaskCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore active session from localStorage on mount (survives page refreshes)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PRESENCE_LS_KEY);
      if (stored) {
        const { startedAt: savedAt, taskCount } = JSON.parse(stored);
        const age = Date.now() - savedAt;
        if (age < MAX_FOCUS_MS) {
          setIsActive(true);
          setStartedAt(savedAt);
          setElapsedSeconds(Math.floor(age / 1000));
          setFocusTaskCount(taskCount || 0);
        } else {
          // Stale session — clean up silently
          localStorage.removeItem(PRESENCE_LS_KEY);
        }
      }
    } catch {
      // ignore localStorage errors
    }
  }, []);

  // Tick the elapsed timer while active
  useEffect(() => {
    if (!isActive || !startedAt) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(elapsed);

      // Auto-end after max focus time
      if (elapsed >= MAX_FOCUS_MS / 1000) {
        clearInterval(timerRef.current!);
        endFocusSilent();
      }
    }, 10000); // Update every 10 seconds (sufficient for "18 min" display)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, startedAt]);

  const writePresence = useCallback(async (data: FocusPresenceData) => {
    if (!uid) return;
    try {
      await setDoc(doc(db, 'presence', uid), data);
      await setDoc(doc(db, 'users', uid), { focusModeActive: data.isActive }, { merge: true });
    } catch (err) {
      console.error('[useFocusPresence] Failed to write presence:', err);
    }
  }, [uid]);

  const clearPresence = useCallback(async () => {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'presence', uid));
      await setDoc(doc(db, 'users', uid), { focusModeActive: false }, { merge: true });
    } catch (err) {
      console.error('[useFocusPresence] Failed to clear presence:', err);
    }
  }, [uid]);

  const startFocus = useCallback(async (taskCount: number) => {
    const now = Date.now();
    setIsActive(true);
    setStartedAt(now);
    setElapsedSeconds(0);
    setFocusTaskCount(taskCount);

    try {
      localStorage.setItem(PRESENCE_LS_KEY, JSON.stringify({ startedAt: now, taskCount }));
    } catch { /* ignore */ }

    await writePresence({
      isActive: true,
      startedAt: now,
      focusTaskCount: taskCount,
      updatedAt: now,
    });
  }, [writePresence]);

  const endFocus = useCallback(async () => {
    setIsActive(false);
    setStartedAt(null);
    setElapsedSeconds(0);
    setFocusTaskCount(0);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      localStorage.removeItem(PRESENCE_LS_KEY);
    } catch { /* ignore */ }

    await clearPresence();
  }, [clearPresence]);

  // Silent end (no state update) used for auto-end timeout
  const endFocusSilent = useCallback(async () => {
    setIsActive(false);
    setStartedAt(null);
    setElapsedSeconds(0);
    try { localStorage.removeItem(PRESENCE_LS_KEY); } catch { /* ignore */ }
    await clearPresence();
  }, [clearPresence]);

  return { isActive, startedAt, elapsedSeconds, focusTaskCount, startFocus, endFocus };
}

/** Format elapsed seconds as "32s", "18 min", or "1 h 5 min" */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} h ${rem} min` : `${hrs} h`;
}
