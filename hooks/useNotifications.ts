'use client';

import { useState, useEffect, useCallback } from 'react';
import { Task } from '@/lib/types';
import { messaging } from '@/lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';

export interface NotificationSettings {
  enabled: boolean;
  deadlineReminders: boolean;
  deadlineMinutesBefore: number; // How many minutes before deadline to remind
  noonCheckIn: boolean; // Remind at noon if no tasks completed
  commitmentReminders: boolean;
  friendCompletions: boolean;
  friendComments: boolean; // Notify when friends comment on your tasks
  sound: boolean;
  vibrate: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  deadlineReminders: true,
  deadlineMinutesBefore: 60, // 1 hour before
  noonCheckIn: true,
  commitmentReminders: true,
  friendCompletions: true,
  friendComments: true,
  friendEncouragement: true,
  sound: false, // Keep it subtle
  vibrate: true,
};

export function useNotifications(userId?: string) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    // Check if notifications are supported
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  // Listen for foreground messages (when app is open)
  useEffect(() => {
    if (!messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[useNotifications] Foreground message received:', payload);
      
      // Show notification when app is in foreground
      if (Notification.permission === 'granted') {
        const title = payload.notification?.title || 'New Notification';
        const options: NotificationOptions = {
          body: payload.notification?.body || '',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: payload.data?.tag || 'default',
          data: payload.data,
        };
        
        // Use service worker to show notification
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, options);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('Notifications not supported');
      return false;
    }

    try {
      // Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result);
      
      if (result === 'granted' && messaging) {
        // Get FCM token for this device
        try {
          const registration = await navigator.serviceWorker.ready;
          
          // IMPORTANT: Get your VAPID key from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates
          const currentToken = await getToken(messaging, {
            vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: registration,
          });
          
          if (currentToken) {
            console.log('✅ FCM Token obtained:', currentToken);
            setFcmToken(currentToken);
            
            // Save FCM token to user's Firestore document for server-side push notifications
            if (userId) {
              try {
                const { doc, updateDoc } = await import('firebase/firestore');
                const { db } = await import('@/lib/firebase');
                
                await updateDoc(doc(db, 'users', userId), {
                  fcmToken: currentToken,
                  fcmTokenUpdatedAt: Date.now(),
                });
                console.log('✅ FCM token saved to Firestore for user:', userId);
              } catch (saveError) {
                console.error('⚠️ Error saving FCM token to Firestore:', saveError);
                // Don't fail the whole flow if token save fails
              }
            }
            
            return true;
          } else {
            console.warn('⚠️ No FCM token available. Request permission first.');
            return false;
          }
        } catch (tokenError) {
          console.error('❌ Error getting FCM token:', tokenError);
          console.error('💡 Make sure you have set NEXT_PUBLIC_FIREBASE_VAPID_KEY in your .env.local file');
          return result === 'granted'; // Still return true if permission granted, even if token fails
        }
      }
      
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [isSupported]);

  const showNotification = useCallback(
    async (title: string, options?: NotificationOptions & { settings?: NotificationSettings }) => {
      if (!isSupported || permission !== 'granted') {
        console.log('Notifications not available or not granted');
        return null;
      }

      const settings = options?.settings || DEFAULT_NOTIFICATION_SETTINGS;

      try {
        // Vibrate if enabled
        if (settings.vibrate && 'vibrate' in navigator) {
          navigator.vibrate([100, 50, 100]);
        }

        // Show notification using Service Worker if available
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          const registration = await navigator.serviceWorker.ready;
          return await registration.showNotification(title, {
            badge: '/icon-192.png',
            icon: '/icon-192.png',
            ...options,
          });
        } else {
          // Fallback to regular notification
          return new Notification(title, {
            badge: '/icon-192.png',
            icon: '/icon-192.png',
            ...options,
          });
        }
      } catch (error) {
        console.error('Error showing notification:', error);
        return null;
      }
    },
    [isSupported, permission]
  );

  const scheduleDeadlineReminder = useCallback(
    (task: Task, settings: NotificationSettings) => {
      if (!settings.enabled || !settings.deadlineReminders || !task.dueDate) {
        return;
      }

      const now = Date.now();
      const deadlineTime = task.dueDate;
      const reminderTime = deadlineTime - settings.deadlineMinutesBefore * 60 * 1000;

      // Only schedule if reminder time is in the future
      if (reminderTime > now) {
        const delay = reminderTime - now;
        
        // Store timeout ID so we can clear it later if needed
        const timeoutId = setTimeout(() => {
          showNotification(`⏰ Deadline Reminder`, {
            body: `"${task.text}" is due in ${settings.deadlineMinutesBefore} minutes!`,
            tag: `deadline-${task.id}`,
            requireInteraction: false,
            settings,
          });
        }, delay);

        return timeoutId;
      }
    },
    [showNotification]
  );

  const showNoonCheckIn = useCallback(
    (completedCount: number, settings: NotificationSettings) => {
      if (!settings.enabled || !settings.noonCheckIn) {
        return;
      }

      if (completedCount === 0) {
        showNotification('☀️ Noon Check-In', {
          body: "Hey! You haven't completed any tasks yet today. Let's make progress! 💪",
          tag: 'noon-checkin',
          requireInteraction: false,
          settings,
        });
      } else {
        showNotification('🎉 Great Progress!', {
          body: `You've completed ${completedCount} task${completedCount !== 1 ? 's' : ''} today. Keep it up!`,
          tag: 'noon-checkin',
          requireInteraction: false,
          settings,
        });
      }
    },
    [showNotification]
  );

  const showCommitmentReminder = useCallback(
    (task: Task, settings: NotificationSettings) => {
      if (!settings.enabled || !settings.commitmentReminders) {
        return;
      }

      showNotification('💪 Commitment Reminder', {
        body: `You committed to: "${task.text}". Let's get it done!`,
        tag: `commitment-${task.id}`,
        requireInteraction: false,
        settings,
      });
    },
    [showNotification]
  );

  const showFriendCompletion = useCallback(
    (friendName: string, taskText: string, settings: NotificationSettings) => {
      if (!settings.enabled || !settings.friendCompletions) {
        return;
      }

      showNotification(`🎊 ${friendName} completed a task!`, {
        body: `"${taskText}" — Way to go!`,
        tag: `friend-completion-${Date.now()}`,
        requireInteraction: false,
        settings,
      });
    },
    [showNotification]
  );

  return {
    permission,
    isSupported,
    fcmToken,
    requestPermission,
    showNotification,
    scheduleDeadlineReminder,
    showNoonCheckIn,
    showCommitmentReminder,
    showFriendCompletion,
  };
}
