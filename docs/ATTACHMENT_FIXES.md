# Attachment & Storage Fixes

## Issues Fixed

### 1. ✅ Nested Button Error (Hydration Error)
**Problem**: Image attachments had a delete button nested inside the lightbox button, causing HTML validation error: "In HTML, <button> cannot be a descendant of <button>."

**Solution**: 
- Wrapped image attachment in a container `<div>`
- Moved delete button outside the lightbox button
- Both buttons are now siblings, not nested
- Delete button positioned absolutely over the image

**Files Changed**:
- `components/AttachmentGallery.tsx` - Fixed button nesting structure

**Before**:
```tsx
<button onClick={openLightbox}>
  <img />
  <button onClick={deleteAttachment}>X</button> {/* NESTED - ERROR! */}
</button>
```

**After**:
```tsx
<div className="relative">
  <button onClick={openLightbox}>
    <img />
  </button>
  <button onClick={deleteAttachment}>X</button> {/* SIBLING - VALID! */}
</div>
```

### 2. ✅ PDF Delete Button Now Always Visible
**Problem**: Delete button on PDF and document attachments used `opacity-0 group-hover:opacity-100`, which doesn't work on mobile touch devices.

**Solution**: 
- Made delete button always visible for documents
- Changed from hidden-until-hover to always-visible small button
- Made it more touch-friendly with proper sizing and hover states

**Files Changed**:
- `components/AttachmentGallery.tsx` - Restructured document attachment layout

### 3. ✅ Storage Usage Not Auto-Updating
**Problem**: Storage usage only updated when clicking refresh button and disappeared when closing/reopening settings menu. This was because:
- Storage value came from `userData` in AuthContext (not real-time)
- Component unmounted when menu closed, losing state
- **Missing `updateUserStorageUsage` function** - attachments weren't updating Firestore!

**Solution**:
- **Added `updateUserStorageUsage` function** to `storageManager.ts`
- Calls `updateDoc` with `increment()` to update user's `storageUsed` field
- Integrated into `addAttachment` (adds bytes) and `deleteAttachment` (subtracts bytes)
- Added real-time Firestore listener in `useTasks` hook to reflect changes immediately
- Updates automatically when attachments are added/deleted
- Persists across menu open/close cycles

**Files Changed**:
- `utils/storageManager.ts` - Added `updateUserStorageUsage` function
- `hooks/useTasks.ts` - Added storage state, real-time listener, and calls to update function
- `app/page.tsx` - Updated to use storage from `useTasks` instead of `userData`

**Implementation**:
```typescript
// In storageManager.ts
export async function updateUserStorageUsage(userId: string, sizeChange: number): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    storageUsed: increment(sizeChange), // Atomic increment/decrement
  });
}

// In useTasks.ts - addAttachment
await updateDoc(taskRef, {
  attachments: [...currentAttachments, attachment]
});
await updateUserStorageUsage(user.uid, attachment.size); // +bytes

// In useTasks.ts - deleteAttachment
await updateDoc(taskRef, {
  attachments: updatedAttachments
});
await updateUserStorageUsage(user.uid, -attachmentToDelete.size); // -bytes

// Real-time listener
const [userStorageUsage, setUserStorageUsage] = useState(0);
useEffect(() => {
  if (!user?.uid) return;
  const userDocRef = doc(db, 'users', user.uid);
  const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
    if (docSnap.exists()) {
      setUserStorageUsage(docSnap.data().storageUsed || 0);
    }
  });
  return () => unsubscribe();
}, [user?.uid]);
```

## User Experience Improvements

### Delete Button
**Before**: 
- Had to hover to see delete button (impossible on mobile)
- Confusing for touch device users

**After**:
- Delete button always visible
- Small, unobtrusive, clearly marked
- Works perfectly on mobile and desktop

### Storage Display
**Before**:
- Had to manually refresh to see updated usage
- Value disappeared when closing settings
- Frustrating UX

**After**:
- Updates automatically in real-time
- Shows correct value immediately after upload/delete
- Persists correctly when reopening settings
- No manual refresh needed (refresh button still available)

## Testing Checklist

- [x] PDF upload shows delete button
- [x] Word doc upload shows delete button
- [x] Delete button works on mobile
- [x] Delete button works on desktop
- [x] Storage updates after upload
- [x] Storage updates after delete
- [x] Storage persists when closing/reopening settings
- [x] Manual refresh still works
- [x] Build compiles successfully

## Technical Details

### Real-time Storage Updates
The storage listener in `useTasks` hook:
1. Listens to user document in Firestore
2. Updates local state when `storageUsed` field changes
3. Triggers re-render of `SettingsMenu` component
4. Shows updated value without page refresh

### Mobile-Friendly Delete Button
The new structure:
1. Wraps attachment in container `<div>`
2. Places download link and delete button side-by-side
3. Delete button always visible (not hidden until hover)
4. Properly sized for touch targets (20x20px)
5. Hover effects for desktop users

## Benefits

1. **Better Mobile UX**: Delete button works on all devices
2. **Real-time Accuracy**: Storage always shows current usage
3. **Less Confusion**: No need to manually refresh
4. **Cleaner Code**: Proper separation of concerns (storage in useTasks)
5. **Consistent State**: Storage value persists correctly
