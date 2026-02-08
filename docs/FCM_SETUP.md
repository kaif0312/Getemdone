# Firebase Cloud Messaging (FCM) Setup for iOS Push Notifications

## Why FCM is Needed

iOS PWAs require Firebase Cloud Messaging to receive **background push notifications** (when the app is not open or the phone is locked). The basic Web Notifications API only works when the app is in the foreground.

## Setup Steps

### 1. Get Your VAPID Key from Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **taskmanagerconnect-d02f7**
3. Click on the **gear icon** ⚙️ (Settings) → **Project settings**
4. Go to the **Cloud Messaging** tab
5. Scroll down to **Web Push certificates**
6. If you don't have a key pair, click **Generate key pair**
7. Copy the **Key pair** value (starts with `B...`)

### 2. Add VAPID Key to Environment Variables

Add this to your `.env.local` file:

```env
NEXT_PUBLIC_FIREBASE_VAPID_KEY=YOUR_VAPID_KEY_HERE
```

⚠️ **Important**: Make sure this is in your `.env.local` file, NOT `.env` (which might be committed to git).

### 3. Update firebase-messaging-sw.js with Your Firebase Config

Open `/public/firebase-messaging-sw.js` and replace the placeholder values:

```javascript
firebase.initializeApp({
  apiKey: "YOUR_API_KEY",
  authDomain: "taskmanagerconnect-d02f7.firebaseapp.com",
  projectId: "taskmanagerconnect-d02f7",
  storageBucket: "taskmanagerconnect-d02f7.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
});
```

These values should match what's in your `.env.local`:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

### 4. How It Works

1. **User grants notification permission** → `useNotifications` hook requests permission
2. **FCM token is generated** → Unique device token created for this user's device
3. **Token saved to Firestore** → Stored in the user's document (optional but recommended)
4. **Friend comments on task** → Firestore notification document created by `useTasks.ts`
5. **Cloud Function triggered** → (Future) Server-side function sends FCM push message
6. **Service worker receives push** → `firebase-messaging-sw.js` shows notification
7. **User sees notification** → Even when app is closed or phone is locked!

## Current Implementation Status

### ✅ Completed

- [x] Created `firebase-messaging-sw.js` with push event handling
- [x] Updated `useNotifications` to request FCM tokens
- [x] Service worker now registers in both development and production
- [x] Foreground message handling (when app is open)
- [x] Notification click handling (opens app or focuses existing window)

### ⚠️ To Do (Manual Setup Required)

- [ ] Add `NEXT_PUBLIC_FIREBASE_VAPID_KEY` to `.env.local`
- [ ] Update `firebase-messaging-sw.js` with your actual Firebase config values
- [ ] (Optional) Save FCM token to user's Firestore document
- [ ] (Future) Create Cloud Function to send push notifications via FCM Admin SDK

## iOS-Specific Requirements

For push notifications to work on iOS:

1. ✅ App must be added to home screen (not just Safari browser)
2. ✅ Valid `manifest.json` with `"display": "standalone"`
3. ✅ Service worker must be registered at root (`/firebase-messaging-sw.js`)
4. ✅ VAPID key configured in FCM token request
5. ✅ User must grant notification permission from a user gesture (button click)

## Testing Push Notifications

### On iOS (PWA added to home screen):

1. Open the app from home screen (not Safari)
2. Enable notifications in settings
3. Ask a friend to comment on your task
4. Lock your phone
5. You should receive a push notification even when the app is closed!

### Debugging:

Check the console for these logs:
- `✅ Firebase Cloud Messaging initialized`
- `✅ Firebase Messaging Service Worker registered`
- `✅ FCM Token obtained: ...`
- `[firebase-messaging-sw.js] Received background message`

If you see errors:
- Check that VAPID key is correctly set in `.env.local`
- Verify Firebase config in `firebase-messaging-sw.js` matches your project
- Make sure you're testing on the PWA (added to home screen), not in Safari browser
- Check that notification permission is granted in iOS Settings → [App Name] → Notifications

## Sending Push Notifications from Server

To send push notifications from your server/Cloud Functions, you'll need to use the **Firebase Admin SDK**:

```javascript
// Example Cloud Function (not yet implemented)
const admin = require('firebase-admin');

// When a notification document is created
exports.sendPushNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snap, context) => {
    const notification = snap.data();
    
    // Get user's FCM token from their user document
    const userDoc = await admin.firestore().collection('users').doc(notification.userId).get();
    const fcmToken = userDoc.data().fcmToken;
    
    if (!fcmToken) return;
    
    // Send push notification
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: notification.title,
        body: notification.message,
      },
      data: {
        taskId: notification.taskId,
        type: notification.type,
      },
    });
  });
```

## Resources

- [Firebase Cloud Messaging Web Setup](https://firebase.google.com/docs/cloud-messaging/js/client)
- [iOS PWA Push Notifications](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Service Worker Push Event](https://developer.mozilla.org/en-US/docs/Web/API/PushEvent)
