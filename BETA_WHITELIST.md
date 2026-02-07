# Beta Whitelist Management

This app is currently in **beta testing mode**. Only whitelisted users can sign up or sign in.

## How to Add Users to the Whitelist

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

## Security Notes

- The whitelist is checked **before** creating Firebase Auth accounts
- For Google sign-in, if the user is not whitelisted, they are immediately signed out
- Firestore rules prevent users from modifying the whitelist (only admins can add via Console)
