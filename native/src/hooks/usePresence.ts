/**
 * Focus presence. Port of hooks/useFriendPresence.ts (read) and hooks/useFocusPresence.ts (write).
 * presence/{uid} = { isActive, startedAt, focusTaskCount, updatedAt } (any signed-in user can read; owner writes).
 *
 *   const presence = usePresence(friendIds);       // { [friendId]: FocusPresenceData | null }  (null = not focusing)
 *   const focus = useMyFocus();                     // { isActive, startedAt, elapsedSeconds, focusTaskCount, startFocus(n), endFocus() }
 * Stale docs (> 4 h) count as inactive. Presence docs are one listener per friend: call usePresence once per screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FocusPresenceData } from '@/lib/types';
import { useAuth } from './useAuth';

const MAX_PRESENCE_AGE_MS = 4 * 60 * 60 * 1000;
const STORE_KEY = 'nudge_focus_presence_started_at';

export type FriendPresenceMap = Record<string, FocusPresenceData | null>;

export function usePresence(friendIds: string[]): FriendPresenceMap {
  const [map, setMap] = useState<FriendPresenceMap>({});
  const key = [...friendIds].sort().join(',');

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    setMap((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => ids.includes(id))));
    const unsubs = ids.map((id) =>
      onSnapshot(
        doc(db, 'presence', id),
        (snap) => {
          if (!snap.exists()) return setMap((p) => ({ ...p, [id]: null }));
          const data = snap.data() as FocusPresenceData;
          const stale = Date.now() - data.updatedAt > MAX_PRESENCE_AGE_MS;
          setMap((p) => ({ ...p, [id]: data.isActive && !stale ? data : null }));
        },
        () => setMap((p) => ({ ...p, [id]: null })),
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [key]);

  return map;
}

/** Seconds a friend has been focusing. */
export function presenceElapsedSeconds(p: FocusPresenceData): number {
  return Math.floor((Date.now() - p.startedAt) / 1000);
}

/** "32s", "18 min", "1 h 5 min" */
export function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs} h ${rem} min` : `${hrs} h`;
}

/** Your own focus session (writes presence/{uid} and users.focusModeActive, which silences pushes while you focus). */
export function useMyFocus() {
  const { uid } = useAuth();
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [focusTaskCount, setFocusTaskCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(async () => {
    setStartedAt(null);
    setElapsed(0);
    setFocusTaskCount(0);
    try {
      await AsyncStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
    if (!uid) return;
    try {
      await deleteDoc(doc(db, 'presence', uid));
      await setDoc(doc(db, 'users', uid), { focusModeActive: false }, { merge: true });
    } catch (e) {
      console.warn('[useMyFocus] clear failed', e);
    }
  }, [uid]);

  // restore after an app restart
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORE_KEY);
        if (!raw || !alive) return;
        const { startedAt: at, taskCount } = JSON.parse(raw) as { startedAt: number; taskCount: number };
        if (Date.now() - at < MAX_PRESENCE_AGE_MS) {
          setStartedAt(at);
          setFocusTaskCount(taskCount || 0);
          setElapsed(Math.floor((Date.now() - at) / 1000));
        } else {
          await AsyncStorage.removeItem(STORE_KEY);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    timer.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(s);
      if (s * 1000 >= MAX_PRESENCE_AGE_MS) void clear();
    }, 10000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [startedAt, clear]);

  const startFocus = useCallback(
    async (taskCount: number) => {
      const now = Date.now();
      setStartedAt(now);
      setElapsed(0);
      setFocusTaskCount(taskCount);
      try {
        await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ startedAt: now, taskCount }));
      } catch {
        /* ignore */
      }
      if (!uid) return;
      const data: FocusPresenceData = { isActive: true, startedAt: now, focusTaskCount: taskCount, updatedAt: now };
      try {
        await setDoc(doc(db, 'presence', uid), data);
        await setDoc(doc(db, 'users', uid), { focusModeActive: true }, { merge: true });
      } catch (e) {
        console.warn('[useMyFocus] start failed', e);
      }
    },
    [uid],
  );

  return useMemo(
    () => ({ isActive: startedAt !== null, startedAt, elapsedSeconds: elapsed, focusTaskCount, startFocus, endFocus: clear }),
    [startedAt, elapsed, focusTaskCount, startFocus, clear],
  );
}
