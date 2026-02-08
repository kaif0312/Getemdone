# Testing Instant Notifications

## Prerequisites ✅
- [x] Cloud Functions deployed (`sendPushNotification` and `cleanupOldFcmTokens`)
- [ ] VAPID key added to `.env.local`
- [ ] Dev server restarted after adding VAPID key
- [ ] Service worker registered successfully

## Test Checklist

### 1. Check VAPID Key Setup
```bash
# In your browser console, check:
echo $NEXT_PUBLIC_FIREBASE_VAPID_KEY
# Should NOT be "YOUR_VAPID_KEY_HERE"
```

### 2. Verify FCM Token Generation
Open browser console and look for:
```
✅ FCM Token obtained: ...
✅ FCM token saved to Firestore for user: ...
```

If you see errors:
```
⚠️ No FCM token available. Request permission first.
💡 Make sure you have set NEXT_PUBLIC_FIREBASE_VAPID_KEY
```
→ VAPID key is missing or incorrect

### 3. Check Firestore User Document
1. Go to: https://console.firebase.google.com/project/getemdone-87679/firestore/data
2. Open `users` collection
3. Find your user document
4. Check if `fcmToken` field exists and has a value (long string starting with `e...` or `d...`)

### 4. Test Comment Notification
1. **User A** comments on **User B's** task
2. Check browser console for:
   ```
   [NotificationListener] 🔔 New notification received: ...
   [NotificationListener] ✅ Push notification sent with comment text
   ```
3. **User B** should receive:
   - In-app notification (bell icon badge)
   - Browser push notification (even if tab is in background)
   - The actual comment text in the notification body

### 5. Test Encouragement Notification
1. **User A** sends encouragement to **User B**
2. Click the 🔥 icon on User B's friend task card
3. Select or type an encouragement message
4. **User B** should receive instant notification

### 6. Check Cloud Function Logs
```bash
firebase functions:log --only sendPushNotification --limit 20
```

Look for:
```
[sendPushNotification] Processing notification ...
[sendPushNotification] Found FCM token for user ...
[sendPushNotification] ✅ Successfully sent notification: ...
```

### Common Issues:

#### ❌ No FCM token in Firestore
- VAPID key not set or incorrect
- User hasn't granted notification permission
- Service worker not registered

#### ❌ Cloud Function runs but no notification received
- FCM token is invalid or expired
- Notification permission revoked
- Check function logs: `firebase functions:log`

#### ❌ Delayed notifications
- This shouldn't happen with Cloud Functions
- Check function logs for timing: `Processing notification` → `Successfully sent`
- Should be < 2 seconds

#### ❌ "Missing or insufficient permissions" in function logs
- Firestore rules might be blocking the function
- Check that the function can read user documents

## Expected Flow:

### Comment Notification:
```
User A comments on User B's task
  ↓
hooks/useTasks.ts → addComment() creates notification doc in Firestore
  ↓
Cloud Function `sendPushNotification` triggers (< 1 second)
  ↓
Function reads User B's fcmToken from Firestore
  ↓
Function sends FCM message to User B's device
  ↓
User B receives push notification IMMEDIATELY
  ↓
Service worker shows notification with actual comment text
```

### Encouragement Notification:
```
User A clicks 🔥 on User B's friend card
  ↓
User A selects/types encouragement message
  ↓
hooks/useTasks.ts → sendEncouragement() creates notification doc
  ↓
Cloud Function `sendPushNotification` triggers (< 1 second)
  ↓
User B receives instant push notification with encouragement
```

## Debugging Commands:

```bash
# View recent function logs
firebase functions:log --limit 50

# View only sendPushNotification logs
firebase functions:log --only sendPushNotification

# Monitor logs in real-time
firebase functions:log --only sendPushNotification --follow

# Check if functions are deployed
firebase functions:list
```

## Success Criteria ✅:

- [ ] Browser console shows FCM token obtained and saved
- [ ] Firestore user document has `fcmToken` field
- [ ] Comments trigger instant notifications (< 2 seconds)
- [ ] Encouragement messages trigger instant notifications
- [ ] Notifications show actual comment/encouragement text
- [ ] Cloud Function logs show successful sends
- [ ] Works even when browser tab is in background
- [ ] Works on iOS PWA (after "Add to Home Screen")
