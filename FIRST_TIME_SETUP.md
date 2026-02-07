# First Time Admin Setup

If you're locked out because you haven't whitelisted yourself yet, follow these steps:

## Step 1: Add Your Email to Whitelist (Firebase Console)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `getemdone-87679`
3. Navigate to **Firestore Database**
4. Click **Start collection** (if `betaWhitelist` doesn't exist)
5. Collection ID: `betaWhitelist`
6. Click **Add document**
7. Document ID: **Your email address** (e.g., `your@email.com`)
8. Add fields:
   - Click **Add field**
   - Field name: `email`
   - Field type: `string`
   - Value: **Your email address** (lowercase, e.g., `your@email.com`)
   - Click **Add field** again
   - Field name: `addedAt`
   - Field type: `timestamp`
   - Value: Click the clock icon to set current time
9. Click **Save**

## Step 2: Sign In to Your App

Now you can sign in with your email address!

## Step 3: Make Yourself Admin

1. In Firebase Console, go to **Firestore Database**
2. Navigate to the `users` collection
3. Find your user document (the document ID is your Firebase Auth UID)
   - If you don't know your UID, you can find it in Firebase Console > Authentication > Users
4. Click on your user document
5. Click **Add field**
6. Field name: `isAdmin`
7. Field type: `boolean`
8. Value: `true`
9. Click **Update**

## Step 4: Access Admin Dashboard

1. Refresh your app
2. You should see a purple shield icon (🔒) in the header
3. Click it to access the admin dashboard
4. Now you can manage the whitelist from the dashboard!

## Alternative: Quick Firebase CLI Setup

If you have Firebase CLI installed:

```bash
# Add your email to whitelist
firebase firestore:set betaWhitelist/your@email.com \
  '{"email": "your@email.com", "addedAt": [timestamp]}'

# Make yourself admin (replace YOUR_USER_ID with your Firebase Auth UID)
firebase firestore:set users/YOUR_USER_ID '{"isAdmin": true}' --merge
```

## Troubleshooting

**Q: I still can't sign in after adding to whitelist**
- Make sure the email in the whitelist matches exactly (case-insensitive, but check for typos)
- Try signing out and signing in again
- Check browser console for errors

**Q: I don't see the admin button**
- Make sure you set `isAdmin: true` in your user document
- Refresh the page
- Check that the field type is `boolean`, not `string`

**Q: How do I find my Firebase Auth UID?**
- Go to Firebase Console > Authentication > Users
- Your UID is shown in the list, or click on your user to see details
