# Firebase Cloud Functions Setup for Instant Push Notifications

## Why Cloud Functions Are Needed

**Problem**: Client-side notifications are slow because they rely on the Firestore listener being active on the recipient's device. If the app is closed or the phone is locked, notifications are delayed until the app wakes up.

**Solution**: Server-side push notifications using Firebase Cloud Functions. When a notification document is created, a Cloud Function immediately sends a push notification via FCM, even if the recipient's app is closed.

## Setup Instructions

### 1. Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
```

### 2. Login to Firebase

```bash
firebase login
```

### 3. Initialize Cloud Functions

```bash
cd /home/kaifu10/Desktop/PersonalProjects/TaskManagerConnect
firebase init functions
```

When prompted:
- **Language**: TypeScript
- **ESLint**: Yes (optional)
- **Install dependencies**: Yes

⚠️ **Note**: The `functions/` directory and files have already been created for you. If Firebase asks to overwrite, choose **No** to keep the existing files.

### 4. Install Dependencies

```bash
cd functions
npm install
```

### 5. Build the Functions

```bash
npm run build
```

### 6. Deploy to Firebase

```bash
npm run deploy
```

Or deploy from the project root:

```bash
firebase deploy --only functions
```

## What's Included

### Cloud Function: `sendPushNotification`

**Trigger**: Firestore onCreate for `notifications/{notificationId}`

**What it does**:
1. Reads the notification document
2. Gets the recipient's FCM token from their user document
3. Sends an immediate push notification via FCM
4. Handles different notification types (comment, encouragement, etc.)
5. Cleans up invalid tokens automatically

### Cloud Function: `cleanupOldFcmTokens`

**Trigger**: Scheduled daily at midnight UTC

**What it does**:
- Removes FCM tokens older than 60 days
- Keeps the database clean and efficient

## Testing Locally

### 1. Start the Firebase Emulator

```bash
cd functions
npm run serve
```

### 2. Update Your App to Use Emulator

In your `.env.local`, set:

```env
NEXT_PUBLIC_USE_EMULATOR=true
```

### 3. Test Notifications

- Send an encouragement or comment
- Check the emulator logs to see the function execution
- The notification should be sent immediately

## Monitoring in Production

### View Function Logs

```bash
firebase functions:log
```

Or view in Firebase Console:
https://console.firebase.google.com/project/getemdone-87679/functions

### Check Function Execution

- Go to Firebase Console → Functions
- Click on `sendPushNotification`
- View execution logs, errors, and performance metrics

## Cost Estimate

Firebase Cloud Functions pricing:
- **Free tier**: 2 million invocations/month
- **After free tier**: $0.40 per million invocations

For your use case:
- Each notification = 1 function invocation
- If you have 100 users sending 10 notifications/day each = 30,000 invocations/month
- **Cost**: FREE (well within free tier)

Even with 1,000 users: 300,000 invocations/month = **Still FREE**

## Troubleshooting

### Error: "Permission denied"

Make sure you're logged in to the correct Firebase account:

```bash
firebase login --reauth
```

### Error: "Functions deployment failed"

Check that you've built the TypeScript:

```bash
cd functions
npm run build
```

### Notifications still delayed

1. Check that the function deployed successfully:
   ```bash
   firebase functions:list
   ```

2. Check function logs for errors:
   ```bash
   firebase functions:log --only sendPushNotification
   ```

3. Verify the user has a valid FCM token:
   - Check Firestore → users → {userId} → fcmToken

### Testing Push Notifications

1. Enable notifications in your app
2. Check console for: `✅ FCM token saved to Firestore`
3. Have a friend send you encouragement
4. Check Firebase Console → Functions → sendPushNotification for execution logs
5. You should receive the notification **immediately**, even with the app closed

## Next Steps

After deploying:
1. ✅ Test with a friend
2. ✅ Monitor function logs for errors
3. ✅ Verify notifications arrive instantly
4. ✅ Check Firebase Console for function metrics

## Files Created

- `functions/package.json` - Dependencies and scripts
- `functions/tsconfig.json` - TypeScript configuration
- `functions/src/index.ts` - Cloud Functions code
- `functions/.gitignore` - Ignore compiled files
- `docs/CLOUD_FUNCTIONS_SETUP.md` - This file

## Resources

- [Firebase Cloud Functions Docs](https://firebase.google.com/docs/functions)
- [FCM Admin SDK](https://firebase.google.com/docs/cloud-messaging/admin)
- [Firebase Pricing](https://firebase.google.com/pricing)
