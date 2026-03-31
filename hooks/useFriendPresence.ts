'use client';

import { useEffect, useState, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FocusPresenceData } from '@/lib/types';

// Presence docs older than 4 hours are treated as stale/inactive
const MAX_PRESENCE_AGE_MS = 4 * 60 * 60 * 1000;

export type FriendPresenceMap = Record<string, FocusPresenceData | null>;

/**
 * Subscribes to real-time presence docs for all provided friend IDs.
 * Returns a map of friendId -> FocusPresenceData (or null if not in focus).
 * Automatically manages subscriptions as friendIds change.
 */
export function useFriendPresence(friendIds: string[]): FriendPresenceMap {
  const [presenceMap, setPresenceMap] = useState<FriendPresenceMap>({});
  // Keep unsubscribe functions keyed by friendId so we can clean up individually
  const unsubscribesRef = useRef<Record<string, () => void>>({});

  useEffect(() => {
    const currentIds = new Set(friendIds);
    const subscribedIds = new Set(Object.keys(unsubscribesRef.current));

    // Unsubscribe from friends no longer in list
    subscribedIds.forEach((id) => {
      if (!currentIds.has(id)) {
        unsubscribesRef.current[id]?.();
        delete unsubscribesRef.current[id];
        setPresenceMap((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    });

    // Subscribe to newly added friends
    friendIds.forEach((friendId) => {
      if (unsubscribesRef.current[friendId]) return; // already subscribed

      const presenceRef = doc(db, 'presence', friendId);
      const unsub = onSnapshot(
        presenceRef,
        (snap) => {
          if (!snap.exists()) {
            setPresenceMap((prev) => ({ ...prev, [friendId]: null }));
            return;
          }
          const data = snap.data() as FocusPresenceData;
          // Treat stale docs as inactive
          const isStale = Date.now() - data.updatedAt > MAX_PRESENCE_AGE_MS;
          setPresenceMap((prev) => ({
            ...prev,
            [friendId]: data.isActive && !isStale ? data : null,
          }));
        },
        () => {
          // On error (e.g. permission denied) treat as null
          setPresenceMap((prev) => ({ ...prev, [friendId]: null }));
        }
      );

      unsubscribesRef.current[friendId] = unsub;
    });

    return () => {
      // Cleanup is handled incrementally above; full cleanup on unmount below
    };
  }, [friendIds.join(',')]); // re-run only when the set of IDs changes

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(unsubscribesRef.current).forEach((unsub) => unsub());
    };
  }, []);

  return presenceMap;
}

/**
 * Returns elapsed seconds for a presence doc, accounting for the
 * time since startedAt (not just updatedAt).
 */
export function getPresenceElapsedSeconds(presence: FocusPresenceData): number {
  return Math.floor((Date.now() - presence.startedAt) / 1000);
}
