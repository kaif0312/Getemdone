/**
 * Friends: profiles, their visible tasks (decrypted), friend code search, add/remove, groups, default visibility.
 * Port of hooks/useFriends.ts + the friend half of hooks/useTasks.ts. One shared subscription (context).
 *
 *   const { friends, friendTasks, loading, searchByFriendCode, addFriend, ... } = useFriends();
 *
 * Differences from the PWA (cost + scale, same document shapes):
 *  - friend profiles are LIVE (one `in` query per 10 friends) instead of one-shot getDoc, so streaks update.
 *  - friend tasks: only the last FRIEND_TASK_WINDOW_DAYS (by createdAt) and all friends (PWA: first 10 friends, all history).
 * Visibility is enforced client-side like the PWA (rules still let friends read private docs; text is replaced by
 * '[Private Task]' and `hidden: true`). Never show `raw.text` of a hidden task.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  arrayRemove, arrayUnion, collection, doc, documentId, getDocs, onSnapshot, orderBy, query, updateDoc, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { FriendGroup, Task, TaskVisibility } from '@/lib/types';
import type { FriendTask, UserDoc } from '@/lib/types-extra';
import { canViewTask } from '@/lib/visibility';
import { useAuth } from './useAuth';
import { useEncryption } from './useEncryption';

export const FRIEND_TASK_WINDOW_DAYS = 30;

export interface FriendInvite {
  id: string;
  fromUid: string;
  toUid: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: number;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function useFriendsState() {
  const { uid, profile } = useAuth();
  const enc = useEncryption();
  const [friendDocs, setFriendDocs] = useState<Record<string, UserDoc>>({});
  const [loading, setLoading] = useState(true);
  const [friendTasks, setFriendTasks] = useState<FriendTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [incomingInvites, setIncomingInvites] = useState<FriendInvite[]>([]);

  const friendIds = useMemo(() => profile?.friends ?? [], [profile?.friends]);
  const friendsKey = useMemo(() => [...friendIds].sort().join(','), [friendIds]);

  // ---- friend profiles (live) -----------------------------------------------------------------------------------
  useEffect(() => {
    if (!uid) {
      setFriendDocs({});
      setLoading(false);
      return;
    }
    const ids = friendsKey ? friendsKey.split(',') : [];
    if (ids.length === 0) {
      setFriendDocs({});
      setLoading(false);
      return;
    }
    const acc: Record<string, UserDoc> = {};
    let pending = chunk(ids, 10).length;
    const unsubs = chunk(ids, 10).map((group) =>
      onSnapshot(
        query(collection(db, 'users'), where(documentId(), 'in', group)),
        (snap) => {
          for (const g of group) delete acc[g];
          snap.forEach((d) => {
            acc[d.id] = { ...(d.data() as UserDoc), id: d.id };
          });
          setFriendDocs({ ...acc });
          if (pending > 0) pending = 0;
          setLoading(false);
        },
        (err) => {
          console.warn('[useFriends] profiles listener', err);
          setLoading(false);
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [uid, friendsKey]);

  const friends = useMemo(() => friendIds.map((id) => friendDocs[id]).filter((f): f is UserDoc => !!f), [friendIds, friendDocs]);
  const friendNames = useRef<Record<string, string>>({});
  friendNames.current = Object.fromEntries(friends.map((f) => [f.id, f.displayName]));

  // ---- friends' tasks (live, decrypted) ----------------------------------------------------------------------------
  useEffect(() => {
    if (!uid || !enc.isInitialized) {
      setFriendTasks([]);
      setTasksLoading(!!uid);
      return;
    }
    const ids = friendsKey ? friendsKey.split(',') : [];
    if (ids.length === 0) {
      setFriendTasks([]);
      setTasksLoading(false);
      return;
    }
    const since = Date.now() - FRIEND_TASK_WINDOW_DAYS * 86400000;
    const groups = chunk(ids, 10);
    const results: Record<number, FriendTask[]> = {};
    const seqs: number[] = groups.map(() => 0);
    const unsubs = groups.map((group, gi) =>
      onSnapshot(
        query(collection(db, 'tasks'), where('userId', 'in', group), where('createdAt', '>=', since), orderBy('createdAt', 'desc')),
        async (snap) => {
          const my = ++seqs[gi];
          const list = await Promise.all(
            snap.docs
              .map((d) => ({ id: d.id, ...d.data() }) as Task)
              .filter((t) => t.deleted !== true && !t.parkedAt && t.userId !== uid)
              .map(async (t): Promise<FriendTask> => {
                const canView = canViewTask(t, uid, false);
                let text = '[Private Task]';
                let comments = t.comments;
                if (canView) {
                  text = await enc.decryptFromFriend(t.friendContent?.[uid] ?? t.text, t.userId);
                  if (t.comments?.length) {
                    comments = await Promise.all(
                      t.comments.map(async (c) => ({
                        ...c,
                        text: await enc.decryptComment(c.friendContent?.[uid] ?? c.text, t.userId, c.userId, uid),
                      })),
                    );
                  }
                }
                return {
                  id: t.id,
                  userId: t.userId,
                  userName: friendNames.current[t.userId] ?? 'Friend',
                  text,
                  hidden: !canView,
                  completed: t.completed,
                  completedAt: t.completedAt,
                  createdAt: t.createdAt,
                  deferredTo: t.deferredTo,
                  focusDate: t.focusDate,
                  tags: canView ? t.tags : undefined,
                  committed: canView ? t.committed : undefined,
                  reactions: t.reactions,
                  comments,
                  raw: canView ? { ...t, text, comments } : { ...t, text },
                };
              }),
          );
          if (my !== seqs[gi]) return;
          results[gi] = list;
          setFriendTasks(Object.values(results).flat().sort((a, b) => b.createdAt - a.createdAt));
          setTasksLoading(false);
        },
        (err) => {
          console.warn('[useFriends] tasks listener', err);
          setTasksLoading(false);
        },
      ),
    );
    return () => {
      seqs.forEach((_, i) => seqs[i]++);
      unsubs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, friendsKey, enc.isInitialized]);

  // ---- incoming invites (read only: created/answered by the server, firestore.rules friendInvites) --------------------
  useEffect(() => {
    if (!uid) {
      setIncomingInvites([]);
      return;
    }
    return onSnapshot(
      query(collection(db, 'friendInvites'), where('toUid', '==', uid), where('status', '==', 'pending')),
      (snap) => setIncomingInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as FriendInvite)),
      () => setIncomingInvites([]),
    );
  }, [uid]);

  // ---- actions ------------------------------------------------------------------------------------------------------
  const searchByFriendCode = useCallback(async (code: string): Promise<UserDoc | null> => {
    const snap = await getDocs(query(collection(db, 'users'), where('friendCode', '==', code.trim().toUpperCase())));
    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as UserDoc), id: snap.docs[0].id };
  }, []);

  const searchByEmail = useCallback(async (email: string): Promise<UserDoc | null> => {
    const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim())));
    if (snap.empty) return null;
    return { ...(snap.docs[0].data() as UserDoc), id: snap.docs[0].id };
  }, []);

  /** Mutual add, exactly like the PWA (two array writes; the rules allow touching only `friends` on the other user). */
  const addFriend = useCallback(
    async (friendId: string) => {
      if (!uid || friendId === uid) return;
      await updateDoc(doc(db, 'users', uid), { friends: arrayUnion(friendId) });
      await updateDoc(doc(db, 'users', friendId), { friends: arrayUnion(uid) });
    },
    [uid],
  );

  const removeFriend = useCallback(
    async (friendId: string) => {
      if (!uid) return;
      await updateDoc(doc(db, 'users', uid), { friends: arrayRemove(friendId) });
      await updateDoc(doc(db, 'users', friendId), { friends: arrayRemove(uid) });
    },
    [uid],
  );

  /**
   * Accept an incoming invite. Server-only rules block updating the invite doc, so this performs the mutual add and
   * the invite stays 'pending' until a server endpoint exists (see native/AGENTS.md "Stubbed").
   */
  const acceptInvite = useCallback(async (invite: FriendInvite) => addFriend(invite.fromUid), [addFriend]);

  const updateFriendGroups = useCallback(
    async (groups: FriendGroup[]) => {
      if (!uid) return;
      await updateDoc(doc(db, 'users', uid), { friendGroups: groups });
    },
    [uid],
  );

  const updateDefaultVisibility = useCallback(
    async (visibility: TaskVisibility, visibilityList?: string[]) => {
      if (!uid) return;
      await updateDoc(doc(db, 'users', uid), { defaultVisibility: visibility, defaultVisibilityList: visibilityList || [] });
    },
    [uid],
  );

  return useMemo(
    () => ({
      friends, loading, friendTasks, tasksLoading, incomingInvites,
      searchByFriendCode, searchByEmail, addFriend, removeFriend, acceptInvite, updateFriendGroups, updateDefaultVisibility,
    }),
    [
      friends, loading, friendTasks, tasksLoading, incomingInvites,
      searchByFriendCode, searchByEmail, addFriend, removeFriend, acceptInvite, updateFriendGroups, updateDefaultVisibility,
    ],
  );
}

export type UseFriends = ReturnType<typeof useFriendsState>;
const FriendsContext = createContext<UseFriends | null>(null);

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const value = useFriendsState();
  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): UseFriends {
  const v = useContext(FriendsContext);
  if (!v) throw new Error('useFriends must be used inside <FriendsProvider>');
  return v;
}
