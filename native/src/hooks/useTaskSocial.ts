/**
 * Social actions on tasks: reactions, comments (with replies + reactions), nudges, encouragement.
 * Port of the matching functions in hooks/useTasks.ts (same writes, same notification docs, same encryption rules).
 * Works on your own tasks AND friends' tasks (the rules let friends touch only `reactions` / `comments`).
 *
 *   const { addReaction, addComment, sendNudge } = useTaskSocial();
 */
import { useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, collection, doc, getDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Comment, Reaction, Task } from '@/lib/types';
import type { UserDoc } from '@/lib/types-extra';
import { useAuth } from './useAuth';
import { useEncryption } from './useEncryption';

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, Array.isArray(v) ? v.filter((x) => x !== undefined) : v]),
  ) as T;
}

export function useTaskSocial() {
  const { user, uid, profile } = useAuth();
  const enc = useEncryption();

  const fromName = useCallback(
    () => profile?.displayName?.trim() || user?.displayName || user?.email?.split('@')[0] || 'A friend',
    [profile?.displayName, user],
  );

  /** One reaction per user per task; same emoji again removes it. */
  const addReaction = useCallback(
    async (taskId: string, emoji: string) => {
      if (!uid || !profile) return;
      const ref = doc(db, 'tasks', taskId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const reactions = ((snap.data() as Task).reactions || []) as Reaction[];
      if (reactions.some((r) => r.userId === uid && r.emoji === emoji)) {
        await updateDoc(ref, { reactions: reactions.filter((r) => !(r.userId === uid && r.emoji === emoji)) });
      } else {
        const next = reactions.filter((r) => r.userId !== uid);
        next.push({ userId: uid, emoji, userName: profile.displayName, timestamp: Date.now() });
        await updateDoc(ref, { reactions: next });
      }
    },
    [uid, profile],
  );

  /** Comment on a task (own or a friend's). Encrypts per the PWA rules and notifies the task owner when a friend comments. */
  const addComment = useCallback(
    async (taskId: string, text: string, replyTo?: { id: string; userName: string; text?: string }) => {
      if (!uid || !profile) return;
      const ref = doc(db, 'tasks', taskId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const task = snap.data() as Task;

      let ownerData: UserDoc | null = null;
      if (task.userId !== uid) {
        const o = await getDoc(doc(db, 'users', task.userId));
        ownerData = o.exists() ? (o.data() as UserDoc) : null;
      }

      const plain = text.substring(0, 500);
      let storedText = plain;
      let friendContent: Record<string, string> | undefined;
      if (enc.isInitialized) {
        if (task.userId === uid) {
          storedText = await enc.encryptForSelf(plain);
          if (profile.friends?.length) {
            friendContent = {};
            for (const f of profile.friends) friendContent[f] = await enc.encryptForFriend(plain, f);
          }
        } else {
          storedText = await enc.encryptForFriend(plain, task.userId);
          const ownerFriends = ownerData?.friends || [];
          if (ownerFriends.length) {
            friendContent = {};
            for (const f of ownerFriends) if (f !== task.userId) friendContent[f] = await enc.encryptForFriend(plain, f);
          }
        }
      }

      const comment: Comment = stripUndefined({
        id: `${uid}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId: uid,
        userName: profile.displayName,
        photoURL: profile.photoURL,
        text: storedText,
        friendContent: friendContent && Object.keys(friendContent).length > 0 ? friendContent : undefined,
        timestamp: Date.now(),
        replyToId: replyTo?.id,
        replyToUserName: replyTo?.userName,
        replyToText: replyTo?.text ? replyTo.text.substring(0, 200) : undefined,
      }) as Comment;

      await runTransaction(db, async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists()) throw new Error('Task not found');
        tx.update(ref, { comments: [...((s.data() as Task).comments || []), comment] });
      });

      if (task.userId !== uid && ownerData && ownerData.notificationSettings?.friendComments !== false) {
        try {
          let preview = '';
          const src = task.friendContent?.[uid] ?? task.text;
          if (src) {
            const p = await enc.decryptFromFriend(src, task.userId);
            if (p && !p.includes("[Couldn't decrypt]")) preview = p.substring(0, 50);
          }
          const name = fromName();
          await addDoc(
            collection(db, 'notifications'),
            stripUndefined({
              userId: task.userId,
              type: 'comment',
              title: `💬 ${name} commented`,
              message: `${name} commented on your task`,
              taskId,
              taskText: preview ? await enc.encryptForFriend(preview, task.userId) : '',
              fromUserId: uid,
              fromUserName: name,
              fromUserPhotoURL: profile.photoURL,
              commentText: await enc.encryptForFriend(text.substring(0, 150), task.userId),
              createdAt: Date.now(),
              read: false,
            }),
          );
        } catch (e) {
          console.warn('[useTaskSocial] comment notification failed', e);
        }
      }
    },
    [uid, profile, enc, fromName],
  );

  const editComment = useCallback(
    async (taskId: string, commentId: string, newText: string) => {
      if (!uid || !profile) return;
      const ref = doc(db, 'tasks', taskId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const task = snap.data() as Task;
      const comments = [...(task.comments || [])];
      const idx = comments.findIndex((c) => c.id === commentId);
      if (idx === -1 || comments[idx].userId !== uid) return;

      const plain = newText.substring(0, 500);
      let stored = plain;
      let friendContent: Record<string, string> | undefined;
      if (enc.isInitialized) {
        if (task.userId === uid) {
          stored = await enc.encryptForSelf(plain);
          if (profile.friends?.length) {
            friendContent = {};
            for (const f of profile.friends) friendContent[f] = await enc.encryptForFriend(plain, f);
          }
        } else {
          stored = await enc.encryptForFriend(plain, task.userId);
          const o = await getDoc(doc(db, 'users', task.userId));
          const ownerFriends = o.exists() ? ((o.data() as UserDoc).friends || []) : [];
          if (ownerFriends.length) {
            friendContent = {};
            for (const f of ownerFriends) if (f !== task.userId) friendContent[f] = await enc.encryptForFriend(plain, f);
          }
        }
      }
      comments[idx] = { ...comments[idx], text: stored, ...(friendContent ? { friendContent } : {}) };
      await updateDoc(ref, { comments });
    },
    [uid, profile, enc],
  );

  const deleteComment = useCallback(
    async (taskId: string, commentId: string) => {
      if (!uid) return;
      const ref = doc(db, 'tasks', taskId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const comments = (snap.data() as Task).comments || [];
      const c = comments.find((x) => x.id === commentId);
      if (!c || c.userId !== uid) return;
      await updateDoc(ref, { comments: comments.filter((x) => x.id !== commentId) });
    },
    [uid],
  );

  /** Emoji reaction on a comment (one per user; same emoji removes). Notifies the comment's author when added. */
  const addCommentReaction = useCallback(
    async (taskId: string, commentId: string, emoji: string) => {
      if (!uid || !profile) return;
      const ref = doc(db, 'tasks', taskId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const task = snap.data() as Task;
      const comments = [...(task.comments || [])];
      const idx = comments.findIndex((c) => c.id === commentId);
      if (idx === -1) return;
      const comment = comments[idx];
      const reactions = comment.reactions || [];
      const removing = reactions.some((r) => r.userId === uid && r.emoji === emoji);
      const next = removing
        ? reactions.filter((r) => !(r.userId === uid && r.emoji === emoji))
        : [...reactions.filter((r) => r.userId !== uid), { userId: uid, emoji, userName: profile.displayName, timestamp: Date.now() }];
      comments[idx] = { ...comment, reactions: next };
      await updateDoc(ref, { comments: comments.map((c) => stripUndefined(c as unknown as Record<string, unknown>)) });

      if (!removing && comment.userId !== uid) {
        try {
          const o = await getDoc(doc(db, 'users', comment.userId));
          if (o.exists() && (o.data() as UserDoc).notificationSettings?.friendComments !== false) {
            const name = fromName();
            await addDoc(
              collection(db, 'notifications'),
              stripUndefined({
                userId: comment.userId,
                type: 'comment',
                title: `${emoji} ${name} reacted to your comment`,
                message: `${name} reacted ${emoji} to your comment`,
                taskId,
                taskText: '',
                fromUserId: uid,
                fromUserName: name,
                fromUserPhotoURL: profile.photoURL,
                reactionEmoji: emoji,
                commentText: '',
                createdAt: Date.now(),
                read: false,
              }),
            );
          }
        } catch (e) {
          console.warn('[useTaskSocial] reaction notification failed', e);
        }
      }
    },
    [uid, profile, fromName],
  );

  /** Encouragement notification to a friend (respects their settings). */
  const sendEncouragement = useCallback(
    async (friendId: string, message: string) => {
      if (!uid || !profile) throw new Error('Must be signed in');
      const f = await getDoc(doc(db, 'users', friendId));
      if (!f.exists()) throw new Error('Friend not found');
      const fd = f.data() as UserDoc;
      if (!(fd.notificationSettings?.enabled && fd.notificationSettings?.friendEncouragement !== false)) return;
      const name = fromName();
      const isNudge = message.includes('nudged you');
      await addDoc(
        collection(db, 'notifications'),
        stripUndefined({
          userId: friendId,
          type: 'encouragement',
          title: isNudge ? `💪 ${message}` : `💪 ${name} sent you encouragement!`,
          message: isNudge ? message : `${name} sent you encouragement`,
          fromUserId: uid,
          fromUserName: name,
          fromUserPhotoURL: profile.photoURL,
          commentText: await enc.encryptForFriend(message.substring(0, 150), friendId),
          createdAt: Date.now(),
          read: false,
        }),
      );
    },
    [uid, profile, enc, fromName],
  );

  /** ⚡ nudge: one per friend per day (the PWA throttles per device; so do we, in AsyncStorage). Returns false if already nudged. */
  const sendNudge = useCallback(
    async (friendId: string): Promise<boolean> => {
      if (!uid) return false;
      const key = `nudge_sent_${friendId}`;
      const today = new Date().toDateString();
      try {
        if ((await AsyncStorage.getItem(key)) === today) return false;
      } catch {
        /* ignore */
      }
      await sendEncouragement(friendId, `${fromName()} nudged you to get things done today!`);
      try {
        await AsyncStorage.setItem(key, today);
      } catch {
        /* ignore */
      }
      return true;
    },
    [uid, sendEncouragement, fromName],
  );

  return useMemo(
    () => ({ addReaction, addComment, editComment, deleteComment, addCommentReaction, sendEncouragement, sendNudge }),
    [addReaction, addComment, editComment, deleteComment, addCommentReaction, sendEncouragement, sendNudge],
  );
}
