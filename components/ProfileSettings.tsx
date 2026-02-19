'use client';

import { useState, useRef, useEffect } from 'react';
import { FaTimes, FaCheck, FaTimes as FaCancel } from 'react-icons/fa';
import { LuCamera, LuPencil, LuInfo, LuChevronRight } from 'react-icons/lu';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { storage, db, auth } from '@/lib/firebase';
import { User } from '@/lib/types';

interface ProfileSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUpdateUser: (updatedData: Partial<User>) => void;
}

export default function ProfileSettings({
  isOpen,
  onClose,
  currentUser,
  onUpdateUser,
}: ProfileSettingsProps) {
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [showFileSizeHint, setShowFileSizeHint] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDisplayName(currentUser.displayName);
  }, [currentUser.displayName]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
    setShowFileSizeHint(true);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const storageRef = ref(storage, `profilePictures/${currentUser.id}`);
      await uploadBytes(storageRef, file);
      const photoURL = await getDownloadURL(storageRef);
      const userDocRef = doc(db, 'users', currentUser.id);
      await updateDoc(userDocRef, { photoURL });
      onUpdateUser({ photoURL });
      setImagePreview(null);
      onClose();
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      alert('Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!currentUser.photoURL) return;
    if (!confirm('Are you sure you want to remove your profile picture?')) return;

    setUploading(true);
    try {
      if (currentUser.photoURL?.includes('firebasestorage.googleapis.com')) {
        try {
          await deleteObject(ref(storage, `profilePictures/${currentUser.id}`));
        } catch {
          // File might not exist, continue
        }
      }
      const userDocRef = doc(db, 'users', currentUser.id);
      await updateDoc(userDocRef, { photoURL: null });
      onUpdateUser({ photoURL: undefined });
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (error) {
      console.error('Error removing profile picture:', error);
      alert('Failed to remove profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleStartEditName = () => {
    setIsEditingName(true);
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);
  };

  const handleCancelEditName = () => {
    setDisplayName(currentUser.displayName);
    setIsEditingName(false);
  };

  const handleSaveName = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName || trimmedName.length === 0) {
      alert('Name cannot be empty');
      return;
    }
    if (trimmedName.length > 50) {
      alert('Name must be 50 characters or less');
      return;
    }
    if (trimmedName === currentUser.displayName) {
      setIsEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      const userDocRef = doc(db, 'users', currentUser.id);
      await updateDoc(userDocRef, { displayName: trimmedName });
      onUpdateUser({ displayName: trimmedName });
      setIsEditingName(false);
      if ('vibrate' in navigator) navigator.vibrate(50);
    } catch (error) {
      console.error('Error updating display name:', error);
      alert('Failed to update name. Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSaveName();
    else if (e.key === 'Escape') handleCancelEditName();
  };

  const handleChangePassword = async () => {
    const email = currentUser.email || auth.currentUser?.email;
    if (!email) {
      alert('No email associated with this account');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      alert('Password reset email sent. Check your inbox.');
    } catch (error) {
      console.error('Error sending password reset:', error);
      alert('Failed to send password reset email. Please try again.');
    }
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      // For now, show message - full implementation would require a Cloud Function
      // that cleans up Firestore data before calling admin.auth().deleteUser()
      alert('To delete your account, please contact support. This feature is coming soon.');
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const avatarSize = 96;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-elevation-2 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle sticky top-0 bg-surface z-10">
          <h2 className="text-xl font-semibold text-fg-primary">Profile Settings</h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-2 hover:bg-surface-muted rounded-full transition-colors disabled:opacity-50 text-fg-secondary"
          >
            <FaTimes size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Avatar + Name Section */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="rounded-full object-cover border-2 border-border-emphasized"
                  style={{ width: avatarSize, height: avatarSize }}
                />
              ) : currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  className="rounded-full object-cover border-2 border-border-emphasized"
                  style={{ width: avatarSize, height: avatarSize }}
                />
              ) : (
                <div
                  className="rounded-full flex items-center justify-center text-3xl font-semibold text-fg-primary bg-surface-muted border-2 border-border-emphasized"
                  style={{ width: avatarSize, height: avatarSize }}
                >
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                onClick={handleCameraClick}
                disabled={uploading}
                className="absolute bottom-0 right-0 w-10 h-10 rounded-full flex items-center justify-center transition-opacity disabled:opacity-50"
                style={{ background: 'rgba(0,0,0,0.5)' }}
                title="Change photo"
              >
                <LuCamera size={18} className="text-white" strokeWidth={2} />
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Name + Edit */}
            <div className="w-full mt-4 text-center">
              {isEditingName ? (
                <div className="flex items-center justify-center gap-2">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    disabled={savingName}
                    maxLength={50}
                    className="flex-1 max-w-[200px] px-3 py-2 border border-border-subtle rounded-lg bg-surface text-fg-primary text-[18px] font-semibold text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    placeholder="Enter your name"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    className="p-2 bg-primary hover:bg-primary/90 text-on-accent rounded-lg transition-colors disabled:opacity-50"
                    title="Save"
                  >
                    <FaCheck size={16} />
                  </button>
                  <button
                    onClick={handleCancelEditName}
                    disabled={savingName}
                    className="p-2 bg-surface-muted hover:bg-surface-muted/80 text-fg-secondary rounded-lg transition-colors disabled:opacity-50"
                    title="Cancel"
                  >
                    <FaCancel size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <p className="text-[18px] font-semibold text-fg-primary">
                    {currentUser.displayName}
                  </p>
                  <button
                    onClick={handleStartEditName}
                    disabled={uploading || savingName}
                    className="p-1.5 hover:bg-surface-muted rounded-lg transition-colors disabled:opacity-50"
                    title="Edit name"
                  >
                    <LuPencil size={14} className="text-fg-secondary" strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>
            <p className="text-[14px] text-fg-secondary mt-1">{currentUser.email}</p>

            {/* Remove photo - plain text, below email */}
            {!imagePreview && currentUser.photoURL && (
              <button
                onClick={handleRemovePhoto}
                disabled={uploading}
                className="mt-2 text-[14px] text-error hover:underline transition-colors disabled:opacity-50"
              >
                {uploading ? 'Removing...' : 'Remove photo'}
              </button>
            )}

            {/* File size hint - only when user taps camera */}
            {showFileSizeHint && (
              <p className="mt-2 text-[13px] text-fg-tertiary flex items-center gap-1.5">
                <LuInfo size={14} />
                Max 5MB
              </p>
            )}
          </div>

          {/* Upload/Cancel when preview */}
          {imagePreview && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-on-accent rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Photo'}
              </button>
              <button
                onClick={() => {
                  setImagePreview(null);
                  fileInputRef.current && (fileInputRef.current.value = '');
                }}
                disabled={uploading}
                className="px-4 py-3 bg-surface-muted hover:bg-surface-muted/80 text-fg-secondary rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Section divider */}
          <div className="border-t border-border-subtle my-6" />

          {/* Profile section */}
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-fg-tertiary uppercase tracking-wide mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => {
                  if (displayName.trim() && displayName.trim() !== currentUser.displayName) {
                    handleSaveName();
                  }
                }}
                className="w-full px-3 py-2.5 border border-border-subtle rounded-lg bg-surface text-fg-primary text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-fg-tertiary uppercase tracking-wide mb-1">
                Email
              </label>
              <input
                type="text"
                value={currentUser.email}
                readOnly
                className="w-full px-3 py-2.5 border border-border-subtle rounded-lg bg-surface-muted text-fg-secondary text-[14px] cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleChangePassword}
              className="w-full flex items-center justify-between px-0 py-2 text-[14px] text-primary hover:underline"
            >
              Change Password
              <LuChevronRight size={16} className="text-fg-tertiary" />
            </button>
          </div>

          {/* Section divider */}
          <div className="border-t border-border-subtle my-6" />

          {/* Account section */}
          <div>
            <h3 className="text-[12px] font-medium text-fg-tertiary uppercase tracking-wide mb-4">
              Account
            </h3>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deletingAccount}
              className="text-[14px] text-error hover:underline transition-colors disabled:opacity-50"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-surface rounded-xl p-6 max-w-sm w-full border border-border-subtle shadow-elevation-2">
            <h3 className="text-lg font-semibold text-fg-primary mb-2">Delete Account</h3>
            <p className="text-[14px] text-fg-secondary mb-6">
              This will permanently delete your account and all your data. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingAccount}
                className="flex-1 px-4 py-2.5 bg-surface-muted hover:bg-surface-muted/80 text-fg-primary rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex-1 px-4 py-2.5 bg-error hover:bg-error/90 text-on-accent rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {deletingAccount ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
