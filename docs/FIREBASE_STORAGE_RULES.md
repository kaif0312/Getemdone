# Firebase Storage Security Rules

## Required Setup for Media Attachments

To enable media attachments, you need to update your Firebase Storage security rules.

### How to Update:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Click **Storage** in the left sidebar
4. Click the **Rules** tab
5. Replace ALL existing rules with the rules below
6. Click **Publish**

### Storage Rules:

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Profile pictures: users can read any, but only write/delete their own
    match /profilePictures/{userId} {
      allow read: if request.auth != null;
      allow write, delete: if request.auth != null && request.auth.uid == userId;
    }
    
    // Task attachments: only authenticated users can access
    match /attachments/{taskId}/{attachmentId} {
      allow read: if request.auth != null;
      allow write, delete: if request.auth != null;
    }
    
    // Deny all other paths
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### What These Rules Do:

#### Profile Pictures (`profilePictures/{userId}`)
- ✅ **Read**: Any authenticated user can view profile pictures
- ✅ **Write**: Users can only upload/update their own profile picture
- ✅ **Delete**: Users can only delete their own profile picture

#### Task Attachments (`attachments/{taskId}/{attachmentId}`)
- ✅ **Read**: Any authenticated user can view attachments (friends can see each other's task attachments)
- ✅ **Write**: Any authenticated user can upload attachments to tasks
- ✅ **Delete**: Any authenticated user can delete attachments (app-level logic handles ownership)
- ℹ️ **Note**: The app ensures users can only modify their own tasks, so attachment deletion is controlled at the application level

#### Security Features:
- 🔒 All access requires authentication
- 🔒 Profile pictures are user-specific
- 🔒 Attachments are organized by taskId for easy cleanup
- 🔒 All other storage paths are denied by default

### File Size Limits:

Enforced at application level:
- **Images**: Compressed to max 2MB (original can be up to 10MB)
- **Documents**: Max 10MB
- **Max attachments per task**: 3
- **Thumbnail**: Auto-generated, max 200KB

### Storage Usage Estimation:

**Free Tier**: 5GB storage, 1GB/day downloads

**Typical Usage**:
- Compressed image: ~500KB
- Thumbnail: ~50KB  
- Document: ~200KB
- 100 active users, 2 attachments/day = **~100MB/day** ✅ Well within free tier

### Cleanup:

Attachments are automatically deleted when:
- User deletes attachment manually
- Task is permanently deleted from recycle bin
- Storage path: `attachments/{taskId}/{attachmentId}`

---

**Status**: ⚠️ **ACTION REQUIRED**  
**Next Step**: Apply these rules in Firebase Console before using attachments feature
