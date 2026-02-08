import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Cloud Function: Send Push Notification when a notification document is created
 * 
 * Triggers: When a new document is created in the 'notifications' collection
 * Action: Sends an FCM push notification to the recipient's device
 */
export const sendPushNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const notification = snap.data();
    const notificationId = context.params.notificationId;

    console.log(`[sendPushNotification] Processing notification ${notificationId}`);
    console.log('[sendPushNotification] Notification data:', notification);

    try {
      // Get the recipient user's FCM token
      const userDoc = await admin.firestore()
        .collection('users')
        .doc(notification.userId)
        .get();

      if (!userDoc.exists) {
        console.error(`[sendPushNotification] User ${notification.userId} not found`);
        return null;
      }

      const userData = userDoc.data();
      const fcmToken = userData?.fcmToken;

      if (!fcmToken) {
        console.warn(`[sendPushNotification] No FCM token for user ${notification.userId}`);
        return null;
      }

      console.log(`[sendPushNotification] Found FCM token for user ${notification.userId}`);

      // Prepare the push notification message
      let notificationBody = notification.message;
      
      // For comments and encouragement, use the actual text
      if (notification.type === 'comment' && notification.commentText) {
        notificationBody = `${notification.fromUserName}: "${notification.commentText}"`;
      } else if (notification.type === 'encouragement' && notification.commentText) {
        notificationBody = notification.commentText;
      }

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notificationBody,
        },
        data: {
          notificationId: notificationId,
          type: notification.type,
          taskId: notification.taskId || '',
          fromUserId: notification.fromUserId || '',
          fromUserName: notification.fromUserName || '',
          commentText: notification.commentText || '',
        },
        webpush: {
          notification: {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: `${notification.type}-${notificationId}`,
            requireInteraction: false,
            vibrate: [100, 50, 100],
          },
          fcmOptions: {
            link: '/', // Open app when clicked
          },
        },
      };

      // Send the push notification
      const response = await admin.messaging().send(message);
      console.log(`[sendPushNotification] ✅ Successfully sent notification:`, response);

      return response;
    } catch (error) {
      console.error(`[sendPushNotification] ❌ Error sending notification:`, error);
      
      // If token is invalid, remove it from user document
      if (error instanceof Error && 
          (error.message.includes('registration-token-not-registered') ||
           error.message.includes('invalid-registration-token'))) {
        console.log(`[sendPushNotification] Removing invalid FCM token for user ${notification.userId}`);
        await admin.firestore()
          .collection('users')
          .doc(notification.userId)
          .update({
            fcmToken: admin.firestore.FieldValue.delete(),
            fcmTokenUpdatedAt: admin.firestore.FieldValue.delete(),
          });
      }
      
      return null;
    }
  });

/**
 * Cloud Function: Clean up old FCM tokens
 * 
 * Triggers: Runs daily at midnight UTC
 * Action: Removes FCM tokens older than 60 days
 */
export const cleanupOldFcmTokens = functions.pubsub
  .schedule('0 0 * * *') // Daily at midnight UTC
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('[cleanupOldFcmTokens] Starting cleanup...');
    
    const sixtyDaysAgo = Date.now() - (60 * 24 * 60 * 60 * 1000);
    
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('fcmTokenUpdatedAt', '<', sixtyDaysAgo)
      .get();

    console.log(`[cleanupOldFcmTokens] Found ${usersSnapshot.size} users with old tokens`);

    const batch = admin.firestore().batch();
    let count = 0;

    usersSnapshot.forEach((doc) => {
      batch.update(doc.ref, {
        fcmToken: admin.firestore.FieldValue.delete(),
        fcmTokenUpdatedAt: admin.firestore.FieldValue.delete(),
      });
      count++;
    });

    if (count > 0) {
      await batch.commit();
      console.log(`[cleanupOldFcmTokens] ✅ Cleaned up ${count} old FCM tokens`);
    } else {
      console.log('[cleanupOldFcmTokens] No old tokens to clean up');
    }

    return null;
  });
