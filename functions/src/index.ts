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

      // Prepare the push notification message (content is plaintext - stored for push display)
      let notificationBody = notification.message;
      
      if (notification.type === 'comment' && notification.commentText) {
        const taskContext = (notification as any).taskText 
          ? ` on "${(notification as any).taskText}"` 
          : '';
        notificationBody = `${notification.fromUserName}: "${notification.commentText}"${taskContext}`;
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
          bugReportId: (notification as any).bugReportId || '',
        },
        webpush: {
          notification: {
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: `${notification.type}-${notificationId}`,
            requireInteraction: false,
            vibrate: [100, 50, 100],
            renotify: false, // Prevent duplicate notifications
          },
          fcmOptions: {
            link: '/', // Open app when clicked
          },
          headers: {
            // Prevent iOS from showing duplicate notifications
            'apns-collapse-id': `${notification.type}-${notificationId}`,
          },
        },
        apns: {
          headers: {
            // iOS-specific: Use collapse ID to prevent duplicates
            'apns-collapse-id': `${notification.type}-${notificationId}`,
          },
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'content-available': 1,
            },
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

/**
 * Cloud Function: Delete user account completely
 * 
 * This function deletes:
 * - Firebase Auth user
 * - User document from Firestore
 * - All user's tasks
 * - All user's notifications
 * - All user's bug reports
 * - User's storage files (profile picture, attachments)
 * - Removes user from friends lists
 * - Removes from whitelist
 * 
 * Callable function - requires admin authentication
 */
export const deleteUserAccount = functions.https.onCall(async (data, context) => {
  // Verify the caller is authenticated and is an admin
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const callerUid = context.auth.uid;
  const targetUserId = data.userId;

  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'userId is required');
  }

  // Prevent self-deletion
  if (callerUid === targetUserId) {
    throw new functions.https.HttpsError('permission-denied', 'Cannot delete your own account');
  }

  // Verify caller is admin
  const callerDoc = await admin.firestore().collection('users').doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data()?.isAdmin !== true) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can delete user accounts');
  }

  console.log(`[deleteUserAccount] Admin ${callerUid} deleting user ${targetUserId}`);

  try {
    // Get user data before deletion
    const userDoc = await admin.firestore().collection('users').doc(targetUserId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    const userEmail = userData?.email;

    // 1. Get all user's tasks first (before deleting) to get task IDs for attachment cleanup
    const tasksSnapshot = await admin.firestore()
      .collection('tasks')
      .where('userId', '==', targetUserId)
      .get();
    
    const taskIds: string[] = [];
    tasksSnapshot.forEach((taskDoc) => {
      taskIds.push(taskDoc.id);
    });

    // 1a. Delete task attachments from storage
    if (taskIds.length > 0) {
      try {
        const bucket = admin.storage().bucket();
        for (const taskId of taskIds) {
          try {
            const [files] = await bucket.getFiles({ prefix: `attachments/${taskId}/` });
            for (const file of files) {
              try {
                await file.delete();
              } catch (fileError) {
                // Continue with other files
              }
            }
          } catch (taskError) {
            // Continue with other tasks
          }
        }
        console.log(`[deleteUserAccount] Cleaned up attachments for ${taskIds.length} tasks`);
      } catch (storageError) {
        console.warn('[deleteUserAccount] Error deleting task attachments:', storageError);
      }
    }

    // 1b. Delete all user's tasks from Firestore
    const taskBatch = admin.firestore().batch();
    tasksSnapshot.forEach((taskDoc) => {
      taskBatch.delete(taskDoc.ref);
    });
    if (tasksSnapshot.size > 0) {
      await taskBatch.commit();
      console.log(`[deleteUserAccount] Deleted ${tasksSnapshot.size} tasks`);
    }

    // 2. Delete all user's notifications
    const notificationsSnapshot = await admin.firestore()
      .collection('notifications')
      .where('userId', '==', targetUserId)
      .get();
    
    const notifBatch = admin.firestore().batch();
    notificationsSnapshot.forEach((notifDoc) => {
      notifBatch.delete(notifDoc.ref);
    });
    if (notificationsSnapshot.size > 0) {
      await notifBatch.commit();
      console.log(`[deleteUserAccount] Deleted ${notificationsSnapshot.size} notifications`);
    }

    // 3. Delete notifications where user is the sender (fromUserId)
    const sentNotificationsSnapshot = await admin.firestore()
      .collection('notifications')
      .where('fromUserId', '==', targetUserId)
      .get();
    
    const sentNotifBatch = admin.firestore().batch();
    sentNotificationsSnapshot.forEach((notifDoc) => {
      sentNotifBatch.delete(notifDoc.ref);
    });
    if (sentNotificationsSnapshot.size > 0) {
      await sentNotifBatch.commit();
      console.log(`[deleteUserAccount] Deleted ${sentNotificationsSnapshot.size} sent notifications`);
    }

    // 4. Delete all user's bug reports
    const bugReportsSnapshot = await admin.firestore()
      .collection('bugReports')
      .where('userId', '==', targetUserId)
      .get();
    
    const bugBatch = admin.firestore().batch();
    bugReportsSnapshot.forEach((bugDoc) => {
      bugBatch.delete(bugDoc.ref);
    });
    if (bugReportsSnapshot.size > 0) {
      await bugBatch.commit();
      console.log(`[deleteUserAccount] Deleted ${bugReportsSnapshot.size} bug reports`);
    }

    // 5. Remove user from all friends lists
    const allUsersSnapshot = await admin.firestore()
      .collection('users')
      .where('friends', 'array-contains', targetUserId)
      .get();
    
    const friendsBatch = admin.firestore().batch();
    allUsersSnapshot.forEach((friendDoc) => {
      const currentFriends = friendDoc.data()?.friends || [];
      const updatedFriends = currentFriends.filter((friendId: string) => friendId !== targetUserId);
      friendsBatch.update(friendDoc.ref, { friends: updatedFriends });
    });
    if (allUsersSnapshot.size > 0) {
      await friendsBatch.commit();
      console.log(`[deleteUserAccount] Removed user from ${allUsersSnapshot.size} friends lists`);
    }

    // 6. Remove from whitelist if present
    if (userEmail) {
      try {
        const whitelistDoc = await admin.firestore()
          .collection('betaWhitelist')
          .doc(userEmail.toLowerCase())
          .get();
        
        if (whitelistDoc.exists) {
          await whitelistDoc.ref.delete();
          console.log(`[deleteUserAccount] Removed from whitelist`);
        }
      } catch (whitelistError) {
        console.warn('[deleteUserAccount] Error removing from whitelist:', whitelistError);
      }
    }

    // 7. Delete user's storage files
    const bucket = admin.storage().bucket();
    
    // Delete profile picture
    try {
      const profilePicRef = bucket.file(`profilePictures/${targetUserId}`);
      const [exists] = await profilePicRef.exists();
      if (exists) {
        await profilePicRef.delete();
        console.log(`[deleteUserAccount] Deleted profile picture`);
      }
    } catch (storageError) {
      console.warn('[deleteUserAccount] Error deleting profile picture:', storageError);
    }

    // Delete all bug report images for this user
    try {
      const [bugReportFiles] = await bucket.getFiles({ prefix: `bugReports/${targetUserId}/` });
      for (const file of bugReportFiles) {
        try {
          await file.delete();
        } catch (fileError) {
          // Continue with other files
        }
      }
      if (bugReportFiles.length > 0) {
        console.log(`[deleteUserAccount] Deleted ${bugReportFiles.length} bug report images`);
      }
    } catch (storageError) {
      console.warn('[deleteUserAccount] Error deleting bug report images:', storageError);
    }

    // 9. Delete user document from Firestore
    await admin.firestore().collection('users').doc(targetUserId).delete();
    console.log(`[deleteUserAccount] Deleted user document`);

    // 10. Delete Firebase Auth user
    try {
      await admin.auth().deleteUser(targetUserId);
      console.log(`[deleteUserAccount] Deleted Firebase Auth user`);
    } catch (authError: any) {
      // If auth user doesn't exist, that's okay
      if (authError.code !== 'auth/user-not-found') {
        throw authError;
      }
      console.log(`[deleteUserAccount] Auth user not found (may have been deleted already)`);
    }

    console.log(`[deleteUserAccount] ✅ Successfully deleted user ${targetUserId}`);
    return { success: true, message: `User account deleted successfully` };
  } catch (error: any) {
    console.error(`[deleteUserAccount] ❌ Error deleting user:`, error);
    throw new functions.https.HttpsError('internal', `Failed to delete user: ${error.message}`);
  }
});
