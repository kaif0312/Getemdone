# Diagnose Triple Notifications Issue

## Quick Diagnostic - Run in Browser Console

Paste this in your browser console (F12) to diagnose the issue:

```javascript
// Check 1: How many tabs/windows are open?
console.log('🔍 DIAGNOSTIC REPORT:');
console.log('====================');

// Check 2: Service Worker status
navigator.serviceWorker.getRegistrations().then(registrations => {
  console.log(`📱 Service Workers: ${registrations.length} registered`);
  registrations.forEach((reg, i) => {
    console.log(`  ${i+1}. ${reg.active ? 'Active' : 'Inactive'}: ${reg.scope}`);
  });
});

// Check 3: Check FCM token
setTimeout(() => {
  const installations = localStorage.getItem('firebase:installations');
  if (installations) {
    console.log('🔑 FCM Installation Data:', JSON.parse(installations));
  }
}, 500);

// Check 4: Notification permission
console.log(`🔔 Notification Permission: ${Notification.permission}`);

// Check 5: How many notifications visible?
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(reg => {
    reg.getNotifications().then(notifications => {
      console.log(`📬 Active Notifications: ${notifications.length}`);
      notifications.forEach((notif, i) => {
        console.log(`  ${i+1}. ${notif.title} (tag: ${notif.tag})`);
      });
    });
  });
}

console.log('====================');
console.log('💡 Common causes of duplicate notifications:');
console.log('   1. Multiple browser tabs open (close extras)');
console.log('   2. Multiple service workers registered (restart browser)');
console.log('   3. Multiple FCM tokens in Firestore (check Firebase Console)');
```

## Common Fixes:

### Fix 1: Close Extra Tabs
- **Issue**: Each open tab receives the same push notification
- **Fix**: Close all but ONE tab of your app
- **Test**: Have friend comment with only 1 tab open

### Fix 2: Clear Service Workers
1. Open Chrome DevTools (F12)
2. Go to **Application** → **Service Workers**
3. Click **"Unregister"** for all service workers
4. Reload page
5. Should register only 1 service worker

### Fix 3: Check for Multiple FCM Tokens in Firestore
1. Go to: https://console.firebase.google.com/project/getemdone-87679/firestore/data
2. Open **users** collection
3. Click on your user document
4. Check `fcmToken` field
5. Should be a single string, not an array

If it's an array or there are multiple tokens, run this in your browser console:

```javascript
// Reset FCM token
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Get current user ID
const userId = 'YOUR_USER_ID_HERE';  // Replace with your actual user ID

// Delete old token
await updateDoc(doc(db, 'users', userId), {
  fcmToken: null,
  fcmTokenUpdatedAt: null
});

// Reload page to regenerate single token
location.reload();
```

### Fix 4: Browser Extension Conflict
- **Issue**: Browser extensions might intercept and duplicate notifications
- **Test**: Open in Incognito mode (disables most extensions)
- **Fix**: Disable notification-related extensions

### Fix 5: Multiple Devices
- **Issue**: You have the app open on multiple devices (phone + laptop)
- **Each device gets a notification** (this is normal!)
- **Fix**: This is expected behavior if you want notifications on all devices

### Fix 6: iOS Multiple Devices
If you're on iOS:
- Make sure the app is only installed on ONE device
- Or only open on ONE device at a time
- iOS PWAs each get their own FCM token

## Test Procedure:

### Test 1: Single Tab
1. Close ALL browser tabs/windows
2. Open ONE tab to your app
3. Check console: should see only 1 service worker
4. Have friend comment
5. Should get 1 notification ✓

### Test 2: Incognito Mode
1. Open app in Incognito/Private mode
2. Grant notification permission
3. Have friend comment  
4. Should get 1 notification ✓

### Test 3: Check Firestore
1. Open Firebase Console
2. Check notifications collection
3. For each comment, should be only 1 notification document
4. Check Cloud Function logs - should be only 1 execution per notification

## Advanced Debugging:

### Check Cloud Function Logs:
```bash
firebase functions:log --lines 50
```

Look for:
- How many times `sendPushNotification` runs per comment
- Should be exactly 1 time
- If it's running 3 times = multiple notification documents being created

### Check Firestore Notifications:
1. Go to: https://console.firebase.google.com/project/getemdone-87679/firestore/data/~2Fnotifications
2. When friend comments, watch in real-time
3. Should create only 1 document
4. If 3 documents appear = bug in `addComment` function

### Check Browser Network Tab:
1. Open DevTools (F12) → Network
2. Filter for "fcm" or "firebase"
3. When friend comments, watch FCM messages
4. Should receive only 1 FCM message
5. If receiving 3 messages = multiple FCM tokens issue

## Expected Behavior:

### Correct Flow (1 notification):
```
Friend comments
  ↓
1 notification document created in Firestore
  ↓
1 Cloud Function execution
  ↓
1 FCM message sent to your FCM token
  ↓
1 notification shown by service worker
  ↓
✅ You see 1 notification
```

### Bug Flow (3 notifications):
```
Friend comments
  ↓
? notification documents created
  ↓
? Cloud Function executions  
  ↓
? FCM messages sent
  ↓
✅ Check each step to find where multiplication happens
```

## Quick Fix (Nuclear Option):

If nothing else works:

1. **Clear ALL site data:**
   - DevTools → Application → Storage
   - Click "Clear site data"
   
2. **Unregister ALL service workers:**
   - DevTools → Application → Service Workers
   - Unregister all

3. **Sign out and clear cache:**
   ```javascript
   // In console
   await firebase.auth().signOut();
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

4. **Reinstall (iOS PWA):**
   - Delete app from home screen
   - Reinstall from Safari

5. **Fresh login:**
   - Sign in again
   - Grant notification permission
   - Should now work with 1 notification

## Report Back:

After running diagnostics, report:
1. How many service workers registered?
2. How many browser tabs open?
3. How many FCM tokens in your user document?
4. Does it still happen in Incognito mode?
5. What do Cloud Function logs show (1 execution or 3)?

This will help identify the exact cause!
