'use client';

import { useState, useEffect, useCallback } from 'react';
import { Task } from '@/lib/types';

export interface NotificationSettings {
  enabled: boolean;
  deadlineReminders: boolean;
  deadlineMinutesBefore: number; // How many minutes before deadline to remind
  noonCheckIn: boolean; // Remind at noon if no tasks completed
  commitmentReminders: boolean;
  friendCompletions: boolean;
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
  sound: false, // Keep it subtle
  vibrate: true,
};

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // Check if notifications are supported
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSupported(true);
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      console.warn('Notifications not supported');
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
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
    requestPermission,
    showNotification,
    scheduleDeadlineReminder,
    showNoonCheckIn,
    showCommitmentReminder,
    showFriendCompletion,
  };
}
