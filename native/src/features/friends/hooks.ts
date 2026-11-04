/**
 * Friends-screen hooks that the shared data hooks do not cover:
 *  - useNudges: which friends I already nudged today (the limit lives in useTaskSocial.sendNudge, per device, AsyncStorage)
 *  - useFriendsWorkouts: friends' workouts since yesterday (honours fitnessGoals.visibility), one listener per friend
 *  - useInviters: profiles of the people who sent me a request
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, documentId, getDoc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FitnessDay, FitnessGoals, Workout } from '@/lib/types-extra';
import type { UserDoc } from '@/lib/types-extra';
import type { FriendInvite } from '@/hooks/useFriends';
import { useTaskSocial } from '@/hooks/useTaskSocial';

const nudgeKey = (friendId: string) => `nudge_sent_${friendId}`;

/** Nudge state for a set of friends. `sendNudge` returns false when one already went out today. */
export function useNudges(friendIds: string[]) {
  const social = useTaskSocial();
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const key = [...friendIds].sort().join(',');
  const today = new Date().toDateString();

  useEffect(() => {
    let alive = true;
    const ids = key ? key.split(',') : [];
    (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, (await AsyncStorage.getItem(nudgeKey(id))) === today] as const;
          } catch {
            return [id, false] as const;
          }
        }),
      );
      if (alive) setSent(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, [key, today]);

  const nudge = useCallback(
    async (friendId: string): Promise<'sent' | 'already' | 'error'> => {
      if (busy[friendId]) return 'already';
      setBusy((b) => ({ ...b, [friendId]: true }));
      setSent((s) => ({ ...s, [friendId]: true })); // optimistic
      try {
        const ok = await social.sendNudge(friendId);
        return ok ? 'sent' : 'already';
      } catch {
        setSent((s) => ({ ...s, [friendId]: false }));
        return 'error';
      } finally {
        setBusy((b) => ({ ...b, [friendId]: false }));
      }
    },
    [social, busy],
  );

  return { sent, busy, nudge };
}

export type FriendWorkout = Workout & { date: string };

/** Workouts for `dates` (e.g. yesterday + today) per friend; empty for friends who keep fitness private. */
export function useFriendsWorkouts(friendIds: string[], fromDate: string): Record<string, FriendWorkout[]> {
  const [map, setMap] = useState<Record<string, FriendWorkout[]>>({});
  const key = [...friendIds].sort().join(',');
  const priv = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    setMap((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => ids.includes(id))));
    let alive = true;
    const unsubs = ids.map((id) => {
      getDoc(doc(db, 'fitnessGoals', id))
        .then((s) => {
          priv.current[id] = s.exists() && (s.data() as FitnessGoals).visibility === 'private';
          if (priv.current[id] && alive) setMap((m) => ({ ...m, [id]: [] }));
        })
        .catch(() => {});
      return onSnapshot(
        query(collection(db, 'fitness', id, 'days'), where(documentId(), '>=', fromDate), orderBy(documentId())),
        (snap) => {
          if (!alive || priv.current[id]) return;
          const list: FriendWorkout[] = [];
          snap.forEach((d) => {
            const day = d.data() as FitnessDay;
            for (const w of day.workouts ?? []) list.push({ ...w, date: d.id });
          });
          setMap((m) => ({ ...m, [id]: list }));
        },
        () => {},
      );
    });
    return () => {
      alive = false;
      unsubs.forEach((u) => u());
    };
  }, [key, fromDate]);

  return map;
}

/** Profiles of the people behind incoming invites (one read each, cached for the session). */
export function useInviters(invites: FriendInvite[]): Record<string, UserDoc | null> {
  const [profiles, setProfiles] = useState<Record<string, UserDoc | null>>({});
  const key = useMemo(() => invites.map((i) => i.fromUid).sort().join(','), [invites]);
  useEffect(() => {
    let alive = true;
    for (const id of key ? key.split(',') : []) {
      if (id in profiles) continue;
      getDoc(doc(db, 'users', id))
        .then((s) => alive && setProfiles((p) => ({ ...p, [id]: s.exists() ? ({ ...(s.data() as UserDoc), id }) : null })))
        .catch(() => alive && setProfiles((p) => ({ ...p, [id]: null })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return profiles;
}
