/**
 * In-app notification inbox (bell). Port of NotificationsPanel + hooks/useUnreadNotifications.ts.
 * notifications/{id}: InAppNotification. The recipient may read, update (mark read) and delete their own (firestore.rules).
 * taskText / commentText can be ciphertext for you: decrypted here with the friend key of `fromUserId`.
 *
 *   const { notifications, unread, loading, markRead, markAllRead, remove } = useNotificationsInbox();
 * One shared listener (context), mounted in app/_layout.tsx. `unread` drives the Header bell badge.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, limit, onSnapshot, orderBy, query, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { InAppNotification } from '@/lib/types';
import { useAuth } from './useAuth';
import { useBlocks } from './useBlocks';
import { useEncryption } from './useEncryption';

const MAX_NOTIFICATIONS = 100;

function useInboxState() {
  const { uid } = useAuth();
  const enc = useEncryption();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid || !enc.isInitialized) {
      setNotifications([]);
      setLoading(!!uid);
      return;
    }
    let seq = 0;
    const unsub = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', uid), orderBy('createdAt', 'desc'), limit(MAX_NOTIFICATIONS)),
      async (snap) => {
        const mine = ++seq;
        const list = await Promise.all(
          snap.docs.map(async (d) => {
            const n = { id: d.id, ...d.data() } as InAppNotification;
            if (n.fromUserId && n.fromUserId !== uid) {
              if (n.taskText) n.taskText = await enc.decryptFromFriend(n.taskText, n.fromUserId);
              if (n.commentText) n.commentText = await enc.decryptFromFriend(n.commentText, n.fromUserId);
            }
            return n;
          }),
        );
        if (mine !== seq) return;
        setNotifications(list);
        setLoading(false);
      },
      (err) => {
        console.warn('[inbox] listener', err);
        setLoading(false);
      },
    );
    return () => {
      seq++;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, enc.isInitialized]);

  // Notifications from people I blocked are not shown (they stay in Firestore; unblocking brings them back).
  const { blockedSet } = useBlocks();
  const visible = useMemo(
    () => (blockedSet.size ? notifications.filter((n) => !n.fromUserId || !blockedSet.has(n.fromUserId)) : notifications),
    [notifications, blockedSet],
  );
  const unread = useMemo(() => visible.filter((n) => !n.read).length, [visible]);

  const markRead = useCallback(async (id: string) => {
    await updateDoc(doc(db, 'notifications', id), { read: true });
  }, []);

  const markAllRead = useCallback(async () => {
    const batch = writeBatch(db);
    let n = 0;
    for (const item of notifications) {
      if (!item.read) {
        batch.update(doc(db, 'notifications', item.id), { read: true });
        n++;
      }
    }
    if (n > 0) await batch.commit();
  }, [notifications]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'notifications', id));
  }, []);

  return useMemo(() => ({ notifications: visible, unread, loading, markRead, markAllRead, remove }), [visible, unread, loading, markRead, markAllRead, remove]);
}

export type UseNotificationsInbox = ReturnType<typeof useInboxState>;
const InboxContext = createContext<UseNotificationsInbox | null>(null);

export function NotificationsInboxProvider({ children }: { children: React.ReactNode }) {
  const v = useInboxState();
  return <InboxContext.Provider value={v}>{children}</InboxContext.Provider>;
}

export function useNotificationsInbox(): UseNotificationsInbox {
  const v = useContext(InboxContext);
  if (!v) throw new Error('useNotificationsInbox must be used inside <NotificationsInboxProvider>');
  return v;
}
