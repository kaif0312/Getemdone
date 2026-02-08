# Background Notification Troubleshooting Guide

## Problem: Notifications only work when app is open, not in background

This is a common issue with PWA push notifications. Here's how to fix it:

## ✅ Checklist - Do These in Order:

### 1. Add VAPID Key to Vercel (REQUIRED for Production)

**Your Local Key (from .env.local):**
```
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BHndL_X5Sbgm7GYHQ_OrB7YpRe0vZvallvVatAgOrrKxOdy1eHbukUTvHfin4uwOMTHIxawZZBS44pICRcVNiuE
```

**Add to Vercel:**
1. Go to: https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Click **"Add New"**
5. Enter:
   - Name: `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
   - Value: `BHndL_X5Sbgm7GYHQ_OrB7YpRe0vZvallvVatAgOrrKxOdy1eHbukUTvHfin4uwOMTHIxawZZBS44pICRcVNiuE`
   - Environment: **Production** + **Preview**
6. Click **"Save"**
7. **Redeploy** your app

### 2. Verify Service Worker is Active

Open your app and check browser console:

**Should see:**
```
✅ Firebase Messaging Service Worker registered
✅ Service Worker is active and ready
✅ FCM Token obtained: e...
✅ FCM token saved to Firestore for user: ...
```

**If you see errors:**
```
❌ Error getting FCM token
💡 Make sure you have set NEXT_PUBLIC_FIREBASE_VAPID_KEY
```
→ VAPID key is missing or incorrect

### 3. Check FCM Token in Firestore

1. Go to: https://console.firebase.google.com/project/getemdone-87679/firestore/data
2. Open **users** collection
3. Find your user document
4. Check if `fcmToken` field exists
5. It should be a long string starting with `e...` or `d...`

**If `fcmToken` is missing:**
- VAPID key not set
- Service worker not registered
- Notification permission not granted

### 4. Test Cloud Function

When a comment is sent, check Firebase logs:

```bash
firebase functions:log --only sendPushNotification --limit 20
```

**Should see:**
```
[sendPushNotification] Processing notification abc123
[sendPushNotification] Found FCM token for user xyz789
[sendPushNotification] ✅ Successfully sent notification: ...
```

**If you see:**
```
[sendPushNotification] No FCM token for user xyz789
```
→ User hasn't granted notification permission or VAPID key issue

### 5. Browser/Device Requirements

**Desktop Chrome/Edge:**
- ✅ Background notifications work
- Need notification permission
- Need service worker active

**Desktop Firefox:**
- ✅ Background notifications work
- Need notification permission

**Desktop Safari:**
- ❌ No push notification support (desktop)
- Only works on macOS 13+ with Safari 16+

**Mobile Chrome (Android):**
- ✅ Background notifications work
- Even when browser is closed
- Need notification permission

**Mobile Safari (iOS):**
- ⚠️ **ONLY works if installed as PWA** (Add to Home Screen)
- Will NOT work in Safari browser
- This is why we added the iOS installation gate

**iOS PWA (installed):**
- ✅ Background notifications work
- Must be opened from home screen icon
- Need notification permission

## 🔧 Common Issues & Fixes:

### Issue: "No FCM token found"
**Fix:**
1. Add VAPID key to Vercel
2. Redeploy app
3. Clear browser cache
4. Open app in incognito mode
5. Grant notification permission
6. Check console for token

### Issue: "Service worker not active"
**Fix:**
1. Open Chrome DevTools → Application → Service Workers
2. Click "Unregister"
3. Reload page
4. Service worker should re-register

### Issue: "Notifications work in foreground, not background"
**Fix:**
1. This means FCM is set up correctly
2. But Cloud Function might not be triggering
3. Check Cloud Function logs:
   ```bash
   firebase functions:log
   ```
4. Verify notification document is created in Firestore

### Issue: "Cloud Function runs but no notification"
**Fix:**
1. Check if FCM token is valid
2. Token might be expired
3. User might have revoked permission
4. Check function logs for errors

## 🧪 Testing Background Notifications:

### Test 1: Close the App Tab
1. Open your app
2. Grant notification permission
3. Check console for FCM token
4. **Close the browser tab completely**
5. Have friend comment on your task
6. You should get notification even with tab closed ✅

### Test 2: Switch to Another Tab
1. Open your app in one tab
2. Switch to a different tab (e.g., YouTube)
3. Have friend comment on your task
4. You should get notification while on another tab ✅

### Test 3: Minimize Browser
1. Open your app
2. Minimize the browser window
3. Have friend comment on your task
4. You should get notification while minimized ✅

### Test 4: Mobile Background
1. Open app on mobile
2. Press home button (go to home screen)
3. Have friend comment on your task
4. You should get notification even on home screen ✅

### Test 5: iOS PWA (Required for iOS)
1. Install app to home screen on iOS
2. Open from home screen icon
3. Grant notification permission
4. Close app completely
5. Have friend comment on your task
6. You should get notification ✅

## 📊 Debug Console Commands:

**Check Service Worker Status:**
```javascript
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('Service Worker:', reg?.active ? 'Active ✅' : 'Not Active ❌');
});
```

**Check Notification Permission:**
```javascript
console.log('Notification Permission:', Notification.permission);
// Should be: "granted"
```

**Check if FCM is initialized:**
```javascript
// In browser console
localStorage.getItem('firebase:installations')
// Should show installation data
```

**Manually trigger test notification:**
```javascript
// In browser console (when service worker is active)
navigator.serviceWorker.ready.then(registration => {
  registration.showNotification('Test Notification', {
    body: 'If you see this, service worker notifications work!',
    icon: '/icon-192.png'
  });
});
```

## 🎯 Expected Behavior:

### ✅ When Working Correctly:
1. User opens app → FCM token generated
2. Token saved to Firestore
3. Friend comments on task
4. Firestore notification document created
5. Cloud Function triggers (< 1 second)
6. Cloud Function sends FCM message
7. User's device receives push notification
8. **Works even if app is closed!** ✅

### ❌ Current Issue (App must be open):
1. User opens app → FCM token generated
2. Token saved to Firestore
3. Friend comments on task
4. Firestore notification document created
5. Cloud Function triggers
6. Cloud Function sends FCM message
7. ❌ Notification only shows if app is open

**This suggests:**
- Service worker might not be handling background messages
- Or FCM token not properly registered
- Or VAPID key not set in production

## 🚀 Quick Fix Summary:

**For Production (Vercel):**
```bash
1. Add VAPID key to Vercel environment variables
2. Redeploy app
3. Clear cache / use incognito
4. Grant notification permission
5. Have friend test comment
6. Should work in background ✅
```

**For Local Testing:**
```bash
1. VAPID key already in .env.local ✅
2. Run: npm run dev
3. Open: http://localhost:3000
4. Open in incognito (clean slate)
5. Grant notification permission
6. Check console for FCM token
7. Have friend comment
8. Should work in background ✅
```

## 📱 Platform-Specific Notes:

### iOS:
- **Safari browser**: ❌ No push notifications
- **Installed PWA**: ✅ Full push notification support
- **Must use home screen icon**: Critical!

### Android:
- **Chrome browser**: ✅ Full push notification support
- **Even when browser closed**: ✅ Works
- **Installed PWA**: ✅ Even better experience

### Desktop:
- **Chrome/Edge**: ✅ Full support
- **Firefox**: ✅ Full support
- **Safari**: ⚠️ Limited support (macOS 13+)

## 🆘 Still Not Working?

Run this diagnostic:

```bash
# 1. Check Cloud Functions are deployed
firebase functions:list

# 2. Check recent function logs
firebase functions:log --limit 50

# 3. Check if functions are triggering
# Have friend comment, then immediately run:
firebase functions:log --only sendPushNotification --limit 5

# 4. Check Firestore for notification documents
# Go to: Firebase Console → Firestore → notifications collection
# Should see new documents being created
```

## 💡 Pro Tips:

1. **Always test in incognito** first (clean slate)
2. **Check browser console** for errors
3. **Verify FCM token** in Firestore
4. **Check function logs** in Firebase
5. **Test on multiple devices** (iOS requires PWA install)
6. **Clear cache** if changing VAPID key

## ✅ Success Indicators:

When everything is working:
- ✅ Console shows "FCM Token obtained"
- ✅ Firestore has fcmToken in user document
- ✅ Cloud Function logs show successful sends
- ✅ Notifications work with app closed
- ✅ Notifications work across all tabs/windows
- ✅ iOS PWA shows notifications
- ✅ Android shows notifications even in background

## 🎉 Expected Timeline:

Once VAPID key is added to Vercel and redeployed:
- **Immediate**: New users get tokens
- **Within 1 hour**: Most existing users refresh and get tokens
- **Within 24 hours**: All active users should have tokens

Background notifications should work for everyone! 🚀
