# ⚠️ REQUIRED: Add Your VAPID Key for Push Notifications

## Quick Setup (2 minutes)

### Step 1: Get Your VAPID Key

1. Go to: https://console.firebase.google.com/project/getemdone-87679/settings/cloudmessaging
2. Scroll to **Web Push certificates**
3. If you don't have one, click **Generate key pair**
4. Copy the key (starts with `B...`)

### Step 2: Add to .env.local

Open `/home/kaifu10/Desktop/PersonalProjects/TaskManagerConnect/.env.local` and add:

```env
NEXT_PUBLIC_FIREBASE_VAPID_KEY=YOUR_VAPID_KEY_HERE
```

Replace `YOUR_VAPID_KEY_HERE` with the key you copied.

### Step 3: Restart the Dev Server

```bash
# Stop the current server (Ctrl+C)
# Then restart it
npm run dev
```

### Step 4: Test

1. Open your PWA from the home screen (iOS)
2. Go to Settings → Enable notifications
3. Check the console for: `✅ FCM Token obtained: ...`

## Why This Is Needed

Without the VAPID key, iOS PWAs cannot receive background push notifications (when the app is closed or phone is locked). The basic notification API only works when the app is open.

## Troubleshooting

### Error: "No FCM token available"
- Check that you've added `NEXT_PUBLIC_FIREBASE_VAPID_KEY` to `.env.local`
- Restart your dev server after adding the key

### Error: "Service Worker registration failed"
- Check browser console for specific error
- Make sure `/firebase-messaging-sw.js` file exists in the `public/` folder

### iOS: Not receiving notifications
- Make sure the app is **added to home screen** (not just Safari)
- Check iOS Settings → [App Name] → Notifications is enabled
- Test with the app closed and phone locked

## What's Already Set Up

✅ Firebase Cloud Messaging initialized
✅ Service worker with push event handling
✅ Foreground notification handling
✅ Background notification handling
✅ Notification click handling

❌ Missing: Just the VAPID key in `.env.local`!
