# Data Recovery Guide

## Issue
User documents were overwritten, causing loss of:
- Admin status (`isAdmin` field)
- Friends list (`friends` array)

## Root Cause
The code was using `setDoc` without `merge: true`, which completely replaced user documents instead of merging with existing data.

## Fix Applied
✅ Updated all `setDoc` calls to use `{ merge: true }` to preserve existing fields

## How to Restore Your Data

### Step 1: Restore Admin Status

**Option A: Firebase Console (Easiest)**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `getemdone-87679`
3. Go to **Firestore Database**
4. Navigate to the `users` collection
5. Find your user document (the document ID is your Firebase Auth UID)
   - If you don't know your UID, go to **Authentication > Users** and find `kaifuten@gmail.com`
6. Click on your user document
7. Click **Add field** (or edit if `isAdmin` exists)
8. Field name: `isAdmin`
9. Field type: `boolean`
10. Value: `true`
11. Click **Update**

**Option B: Firebase CLI**
```bash
# First, find your user ID from Authentication > Users in Firebase Console
# Then run:
firebase firestore:set users/YOUR_USER_ID '{"isAdmin": true}' --merge
```

### Step 2: Restore Friends List

Unfortunately, if the friends list was overwritten, it may be lost unless you have a backup. However, you can:

1. **Check if friends still exist in other users' documents:**
   - Friends are stored bidirectionally (both users have each other in their friends list)
   - If your friends still have you in their friends list, you can recover it

2. **Manually restore friends:**
   - Go to Firestore > `users` collection
   - Find each friend's user document
   - Check their `friends` array - if your user ID is there, add them back to your friends list
   - Or have your friends re-add you (easier)

3. **Use the app to re-add friends:**
   - Your friends can search for you by email or friend code
   - They can send you friend requests again

### Step 3: Verify Recovery

1. Sign out and sign back in to the app
2. Check if admin dashboard (purple shield icon) appears
3. Check if friends are showing

## Prevention

The code has been fixed to use `merge: true` for all user document updates, so this should not happen again.

## If Data Cannot Be Recovered

If friends list cannot be recovered:
1. Ask your friends to re-add you
2. Or manually add friend IDs back to your user document in Firestore

## Need Help?

If you need help finding your user ID or restoring data, check:
- Firebase Console > Authentication > Users (to find your UID)
- Firebase Console > Firestore > users collection (to see your document)
