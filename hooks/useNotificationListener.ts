'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InAppNotification } from '@/lib/types';

interface UseNotificationListenerProps {
  userId: string | undefined;
  notificationSettings: any;
  showNotification: (title: string, options?: any) => void;
  isSupported: boolean;
}

/**
 * Background listener for new notifications
 * Tracks notifications for in-app display and unread badge
 * Push notifications are handled by Cloud Functions (no duplicates!)
 */
export function useNotificationListener({
  userId,
  notificationSettings,
  showNotification,
  isSupported,
}: UseNotificationListenerProps) {
  const processedNotificationsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (!userId || !isSupported) return;

    const settings = notificationSettings;
    // Default to enabled if settings are not set (for new users)
    // This ensures notifications work for new accounts even if settings haven't been initialized yet
    if (settings && (!settings.enabled || !settings.friendComments)) {
      console.log('[NotificationListener] Notifications disabled in settings');
      return;
    }

    console.log('[NotificationListener] Starting notification listener for user:', userId);

    // Listen to user's notifications in real-time
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Skip initial load - don't notify for existing notifications
        if (isInitialLoadRef.current) {
          snapshot.forEach((doc) => {
            processedNotificationsRef.current.add(doc.id);
          });
          isInitialLoadRef.current = false;
          console.log('[NotificationListener] Initial load complete, tracking', processedNotificationsRef.current.size, 'existing notifications');
          return;
        }

        // Process new notifications
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const doc = change.doc;
            const notificationId = doc.id;

            // Skip if already processed
            if (processedNotificationsRef.current.has(notificationId)) {
              return;
            }

            // Mark as processed
            processedNotificationsRef.current.add(notificationId);

            const data = doc.data();
            const notification: InAppNotification = {
              id: notificationId,
              userId: data.userId,
              type: data.type,
              title: data.title,
              message: data.message,
              taskId: data.taskId,
              taskText: data.taskText,
              fromUserId: data.fromUserId,
              fromUserName: data.fromUserName,
              commentText: data.commentText,
              createdAt: data.createdAt,
              read: data.read || false,
            };

            console.log('[NotificationListener] 🔔 New notification received:', notification.title);
            console.log('[NotificationListener] ℹ️ Push notification will be sent by Cloud Function (no client-side notification to avoid duplicates)');
          }
        });
      },
      (error) => {
        console.error('[NotificationListener] Error listening to notifications:', error);
      }
    );

    return () => {
      console.log('[NotificationListener] Cleaning up listener');
      unsubscribe();
    };
  }, [userId, notificationSettings, showNotification, isSupported]);
}
