/**
 * Script to restore admin status and check user data
 * Run this in Firebase Console > Firestore > Run query, or use Firebase CLI
 * 
 * To restore admin status for kaifuten@gmail.com:
 * 1. Find the user document in Firestore (users collection)
 * 2. Add/update the field: isAdmin = true (boolean)
 * 
 * Or use Firebase CLI:
 * firebase firestore:set users/USER_ID '{"isAdmin": true}' --merge
 * 
 * To find USER_ID:
 * - Go to Firebase Console > Authentication > Users
 * - Find kaifuten@gmail.com
 * - Copy the UID
 */

// This is a reference script - actual restoration should be done via Firebase Console or CLI
