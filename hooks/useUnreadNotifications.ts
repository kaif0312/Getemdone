'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Hook to track unread notification count
 * Returns the count of unread notifications for a user
 */
export function useUnreadNotifications(userId: string | undefined) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }

    // Listen to unread notifications
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      where('read', '==', false)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setUnreadCount(snapshot.size);
        if (snapshot.size > 0) {
          console.log(`[UnreadNotifications] ${snapshot.size} unread notification(s)`);
        }
      },
      (error) => {
        console.error('[UnreadNotifications] Error fetching unread count:', error);
        setUnreadCount(0);
      }
    );

    return () => unsubscribe();
  }, [userId]);

  return unreadCount;
}
