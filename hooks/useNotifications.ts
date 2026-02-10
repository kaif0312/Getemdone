'use client';

import { useState, useEffect, useCallback } from 'react';
import { Task, NotificationSettings } from '@/lib/types';
import { messaging } from '@/lib/firebase';
import { getToken, onMessage } from 'firebase/messaging';

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

  // Auto-generate FCM token if permission already granted and user is logged in
  // Also re-runs when permission changes (e.g., user grants permission)
  useEffect(() => {
    const initializeFCMToken = async () => {
      // Skip if no user, not supported, or permission not granted
      if (!userId || !isSupported || !messaging) return;
      if (Notification.permission !== 'granted') {
        console.log('[useNotifications] Permission not granted, skipping FCM token generation');
        return;
      }

      try {
        console.log('[useNotifications] Auto-generating FCM token for logged-in user...');
        
        // Wait for service worker to be ready (with retry logic for new users)
        let registration;
        let retries = 0;
        const maxRetries = 5;
        
        while (retries < maxRetries) {
          try {
            registration = await navigator.serviceWorker.ready;
            break;
          } catch (error) {
            retries++;
            if (retries >= maxRetries) {
              console.warn('[useNotifications] Service worker not ready after', maxRetries, 'attempts');
              return;
            }
            // Wait a bit longer before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
        
        if (!registration) {
          console.warn('[useNotifications] Service worker registration not available');
          return;
        }
        
        // Get FCM token
        const currentToken = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });
        
        if (currentToken) {
          console.log('✅ FCM Token auto-generated:', currentToken);
          setFcmToken(currentToken);
          
          // Save to Firestore
          const { doc, updateDoc, getDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const { DEFAULT_NOTIFICATION_SETTINGS } = await import('@/hooks/useNotifications');
          
          const userDocRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userDocRef);
          const userData = userDoc.data();
          
          // Check if token already exists and is the same
          const existingToken = userData?.fcmToken;
          
          const updateData: any = {};
          
          // Update token if it changed
          if (existingToken !== currentToken) {
            updateData.fcmToken = currentToken;
            updateData.fcmTokenUpdatedAt = Date.now();
          }
          
          // Ensure notification settings are enabled if permission is granted
          if (!userData?.notificationSettings || !userData.notificationSettings.enabled) {
            updateData.notificationSettings = {
              ...(userData?.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS),
              enabled: true,
            };
            console.log('✅ Auto-enabling notification settings');
          }
          
          if (Object.keys(updateData).length > 0) {
            await updateDoc(userDocRef, updateData);
            console.log('✅ FCM token and settings saved to Firestore for user:', userId);
          } else {
            console.log('ℹ️ FCM token and settings already up to date');
          }
        } else {
          console.warn('⚠️ No FCM token available');
        }
      } catch (error) {
        console.error('❌ Error auto-generating FCM token:', error);
        console.error('💡 Make sure NEXT_PUBLIC_FIREBASE_VAPID_KEY is set');
      }
    };

    // Run after a delay to ensure service worker is registered
    // Longer delay for new users to ensure service worker is fully ready
    const timer = setTimeout(initializeFCMToken, 2000);
    return () => clearTimeout(timer);
  }, [userId, isSupported, permission]); // Added permission to dependencies to re-run when permission changes

  // Listen for foreground messages (when app is open)
  // Note: Service worker handles background messages, this handles foreground
  useEffect(() => {
    if (!messaging) return;

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[useNotifications] Foreground FCM message received:', payload);
      console.log('[useNotifications] ℹ️ Not showing notification (Cloud Function already sent it via FCM background channel)');
      // Don't show notification here - FCM already delivered it via background channel
      // This avoids duplicate notifications when app is open
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
        // Ensure service worker is registered first
        if ('serviceWorker' in navigator) {
          try {
            // Check if service worker is registered
            let registration = await navigator.serviceWorker.getRegistration();
            if (!registration) {
              console.log('[requestPermission] Service worker not registered, registering now...');
              registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
                scope: '/',
              });
              console.log('[requestPermission] Service worker registered');
            }
          } catch (swError) {
            console.warn('[requestPermission] Service worker registration error:', swError);
          }
        }
        
        // Wait for service worker to be ready (with retry logic)
        let registration;
        let retries = 0;
        const maxRetries = 10; // Increased retries for new users
        
        while (retries < maxRetries) {
          try {
            registration = await navigator.serviceWorker.ready;
            console.log('[requestPermission] Service worker ready on attempt', retries + 1);
            break;
          } catch (error) {
            retries++;
            if (retries >= maxRetries) {
              console.warn('[requestPermission] Service worker not ready after', maxRetries, 'attempts');
              // Still try to get token even if service worker check fails
              break;
            }
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 500 * retries));
          }
        }
        
        // Get FCM token for this device
        try {
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
                const { doc, updateDoc, getDoc } = await import('firebase/firestore');
                const { db } = await import('@/lib/firebase');
                const { DEFAULT_NOTIFICATION_SETTINGS } = await import('@/hooks/useNotifications');
                
                const userDocRef = doc(db, 'users', userId);
                const userDoc = await getDoc(userDocRef);
                const userData = userDoc.data();
                
                // Update FCM token and ensure notification settings are enabled
                const updateData: any = {
                  fcmToken: currentToken,
                  fcmTokenUpdatedAt: Date.now(),
                };
                
                // If notification settings don't exist or are disabled, enable them
                if (!userData?.notificationSettings || !userData.notificationSettings.enabled) {
                  updateData.notificationSettings = {
                    ...(userData?.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS),
                    enabled: true, // Ensure enabled when permission is granted
                  };
                  console.log('✅ Enabling notification settings for user');
                }
                
                await updateDoc(userDocRef, updateData);
                console.log('✅ FCM token and notification settings saved to Firestore for user:', userId);
                
                // Verify the token was saved by reading it back
                const verifyDoc = await getDoc(userDocRef);
                const savedToken = verifyDoc.data()?.fcmToken;
                if (savedToken === currentToken) {
                  console.log('✅ Verified: FCM token successfully saved to Firestore');
                } else {
                  console.warn('⚠️ Warning: FCM token verification failed. Saved:', savedToken, 'Expected:', currentToken);
                }
              } catch (saveError) {
                console.error('⚠️ Error saving FCM token to Firestore:', saveError);
                // Don't fail the whole flow if token save fails, but log it
                console.error('💡 This may prevent background notifications from working');
              }
            } else {
              console.warn('⚠️ No userId available, cannot save FCM token to Firestore');
            }
            
            return true;
          } else {
            console.warn('⚠️ No FCM token available. Request permission first.');
            return false;
          }
        } catch (tokenError: any) {
          console.error('❌ Error getting FCM token:', tokenError);
          console.error('💡 Make sure you have set NEXT_PUBLIC_FIREBASE_VAPID_KEY in your .env.local file');
          console.error('💡 Error details:', tokenError.message);
          
          // If it's a service worker error, try again after a delay
          if (tokenError.message?.includes('service worker') || tokenError.message?.includes('messaging')) {
            console.log('🔄 Retrying FCM token generation after delay...');
            setTimeout(async () => {
              if (!messaging) {
                console.error('❌ Messaging not available for retry');
                return;
              }
              try {
                const registration = await navigator.serviceWorker.ready;
                const retryToken = await getToken(messaging, {
                  vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
                  serviceWorkerRegistration: registration,
                });
                if (retryToken && userId) {
                  const { doc, updateDoc, getDoc } = await import('firebase/firestore');
                  const { db } = await import('@/lib/firebase');
                  const userDocRef = doc(db, 'users', userId);
                  await updateDoc(userDocRef, {
                    fcmToken: retryToken,
                    fcmTokenUpdatedAt: Date.now(),
                  });
                  
                  // Verify the token was saved
                  const verifyDoc = await getDoc(userDocRef);
                  const savedToken = verifyDoc.data()?.fcmToken;
                  if (savedToken === retryToken) {
                    console.log('✅ FCM token saved and verified on retry');
                    setFcmToken(retryToken);
                  } else {
                    console.warn('⚠️ FCM token retry verification failed');
                  }
                }
              } catch (retryError) {
                console.error('❌ Retry also failed:', retryError);
              }
            }, 2000);
          }
          
          return result === 'granted'; // Still return true if permission granted, even if token fails
        }
      }
      
      return result === 'granted';
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return false;
    }
  }, [isSupported, userId]);

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
            badge: '/icon.svg',
            icon: '/icon.svg',
            ...options,
          });
        } else {
          // Fallback to regular notification
          return new Notification(title, {
            badge: '/icon.svg',
            icon: '/icon.svg',
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
