# Recycle Bin Auto-Cleanup

This document describes the automatic cleanup system for the recycle bin.

## Overview

The app automatically deletes tasks from the recycle bin after **30 days**, freeing up storage space and keeping the database clean.

## Features

### 1. **Automatic Expiry**
- Tasks are permanently deleted 30 days after being moved to recycle bin
- Includes deletion of all attachments from Firebase Storage
- Runs automatically in the background every 6 hours

### 2. **Visual Indicators**
- Each deleted task shows time remaining until permanent deletion
- Tasks expiring within 7 days are highlighted in orange
- Header shows retention period (30 days)

### 3. **Storage Cleanup**
- Permanent deletion removes:
  - Task document from Firestore
  - All attachment files from Storage
  - All attachment thumbnails from Storage
  - Updates user's `storageUsed` count

### 4. **Manual Deletion**
- Users can manually permanently delete tasks anytime
- Manual deletion also cleans up all storage files

## Implementation

### Key Files

1. **`utils/recycleCleanup.ts`**
   - Core cleanup logic
   - Utility functions for expiry calculations
   - Configuration constants

2. **`hooks/useRecycleCleanup.ts`**
   - React hook for automatic cleanup
   - Runs cleanup on mount and every 6 hours
   - Prevents duplicate cleanups

3. **`hooks/useTasks.ts`**
   - Updated `permanentlyDeleteTask` to clean storage
   - Deletes all attachments before removing task

4. **`components/RecycleBin.tsx`**
   - Shows expiry countdown for each task
   - Visual warning for tasks expiring soon
   - Header displays retention policy

### Configuration

```typescript
// In utils/recycleCleanup.ts
export const DEFAULT_RETENTION_DAYS = 30;
export const RETENTION_MS = DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// In hooks/useRecycleCleanup.ts
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
```

### Key Functions

#### `cleanupExpiredTasks(userId: string)`
```typescript
// Automatically called by useRecycleCleanup hook
// Finds and permanently deletes expired tasks
// Returns count of deleted items
```

#### `formatExpiryInfo(deletedAt: number)`
```typescript
// Calculate days remaining until permanent deletion
// Returns:
// - daysRemaining: number
// - expiryDate: string
// - isExpiringSoon: boolean (within 7 days)
```

#### `shouldPermanentlyDelete(deletedAt: number)`
```typescript
// Check if item has expired
// Returns true if past retention period
```

## User Experience

### When a task is deleted:
1. Task moves to recycle bin with `deletedAt` timestamp
2. Task is soft-deleted (`deleted: true` flag)
3. All data (including attachments) remains intact

### During retention period (30 days):
1. User can restore task at any time
2. Recycle bin shows countdown timer
3. Tasks expiring soon (≤7 days) shown in orange
4. User can manually permanently delete if desired

### After 30 days:
1. Automatic cleanup runs (every 6 hours)
2. Expired tasks are permanently deleted:
   - All attachments removed from Storage
   - Task document removed from Firestore
   - User's `storageUsed` updated
3. No recovery possible after permanent deletion

## Storage Impact

### Before auto-cleanup:
- Deleted tasks occupied storage space
- Attachments remained in Firebase Storage
- Could reach storage limits with deleted items

### After auto-cleanup:
- Storage automatically freed after 30 days
- No manual intervention required
- Prevents storage bloat from old deleted items

## Technical Notes

### Cleanup Timing
- Cleanup runs every 6 hours when app is open
- Also runs once when user logs in
- Uses timestamp comparison to prevent duplicate runs

### Edge Cases Handled
1. **Missing attachments**: If attachment file doesn't exist in Storage, deletion continues without error
2. **Network failures**: Cleanup fails gracefully, will retry next cycle
3. **Multiple tabs**: Last cleanup time prevents duplicate cleanups
4. **Component re-renders**: `useRef` prevents cleanup on every render

### Storage Rules
Ensure Firebase Storage rules allow users to delete their own attachments:

```javascript
match /attachments/{taskId}/{attachmentId} {
  allow delete: if request.auth != null;
}
```

## Benefits

1. **Automatic maintenance** - No manual cleanup required
2. **Storage savings** - Old files automatically removed
3. **Cost reduction** - Lower storage costs
4. **User awareness** - Clear visibility of retention policy
5. **Grace period** - 30 days to change mind before permanent deletion
6. **Warning system** - Orange highlight for expiring items

## Future Enhancements

Possible improvements:
- Make retention period configurable per user
- Export tasks before permanent deletion
- Bulk operations (restore all, delete all)
- Email notification before permanent deletion
- Archive option (keep metadata, delete attachments)
