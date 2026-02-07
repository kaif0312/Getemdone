# Beta Whitelist Management

This app is currently in **beta testing mode**. Only whitelisted users can sign up or sign in.

## ⚠️ First Time Setup (IMPORTANT!)

**If you're locked out, you need to whitelist yourself first!**

See **[FIRST_TIME_SETUP.md](./FIRST_TIME_SETUP.md)** for step-by-step instructions to:
1. Add your email to the whitelist in Firebase Console
2. Sign in to the app
3. Make yourself an admin
4. Access the admin dashboard

## 🎯 Admin Dashboard (Recommended)

**The easiest way to manage the whitelist is through the Admin Dashboard!**

1. **Make yourself an admin first** (see "Making Yourself an Admin" below)
2. **Access the dashboard**: Click the purple shield icon (🔒) in the header, or navigate to `/admin`
3. **Add/remove emails**: Use the dashboard to manage whitelist entries
4. **View all users**: See who's signed up and their status

The admin dashboard provides:
- ✅ Visual interface to add/remove emails
- ✅ See all whitelisted emails and their status (Active/Pending)
- ✅ View all users who have signed up
- ✅ Real-time updates
- ✅ Statistics (whitelisted count, total users, active users)

## Making Yourself an Admin

To access the admin dashboard, you need to set `isAdmin: true` in your user document:

### Method 1: Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database**
4. Find your user document in the `users` collection (document ID is your user UID)
5. Click on the document
6. Click "Add field"
7. Field name: `isAdmin`
8. Field type: `boolean`
9. Value: `true`
10. Click "Update"

### Method 2: Firebase CLI
```bash
# Replace YOUR_USER_ID with your actual Firebase Auth UID
firebase firestore:set users/YOUR_USER_ID '{"isAdmin": true}' --merge
```

## How to Add Users to the Whitelist (Manual Method)

### Method 1: Firebase Console (Recommended)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database**
4. Create a new collection called `betaWhitelist` (if it doesn't exist)
5. Add documents with the following structure:
   - **Document ID**: Use the email address (lowercase)
   - **Fields**:
     - `email` (string): The user's email address (lowercase)
     - `addedAt` (timestamp): When they were added (optional)
     - `addedBy` (string): Your admin user ID (optional)

### Example Document

```
Collection: betaWhitelist
Document ID: user@example.com
Fields:
  email: "user@example.com"
  addedAt: [timestamp]
  addedBy: "your-admin-user-id"
```

### Method 2: Firebase CLI

```bash
# Add a user to whitelist
firebase firestore:set betaWhitelist/user@example.com \
  '{"email": "user@example.com", "addedAt": [timestamp]}'
```

### Method 3: Programmatically (for admins)

You can create a simple admin script to add users. The whitelist check uses email addresses (case-insensitive).

## How It Works

- When a user tries to sign up or sign in, the app checks if their email exists in the `betaWhitelist` collection
- If the email is not found, they see: "Access restricted. This app is currently in beta testing. Please contact the administrator for access."
- The check is case-insensitive (emails are converted to lowercase)

## Disabling Beta Mode

To disable beta mode and allow anyone to sign up:

1. Remove the whitelist checks from `contexts/AuthContext.tsx`:
   - Remove `checkBetaWhitelist` calls from `signIn`, `signUp`, and `signInWithGoogle`
2. Or modify the check to always return `true`:
   ```typescript
   const checkBetaWhitelist = async (email: string): Promise<boolean> => {
     return true; // Allow everyone
   };
   ```

## Admin Dashboard Features

- **Add Email**: Quickly add new emails to the whitelist
- **Remove Email**: Remove emails from whitelist (with confirmation)
- **View Status**: See which whitelisted emails have active accounts
- **User List**: View all users who have signed up
- **Statistics**: See counts of whitelisted emails, total users, and active users
- **Real-time Updates**: Changes sync automatically across all admin sessions

## Security Notes

- The whitelist is checked **before** creating Firebase Auth accounts
- For Google sign-in, if the user is not whitelisted, they are immediately signed out
- Firestore rules prevent users from modifying the whitelist (only admins can add via Console)
