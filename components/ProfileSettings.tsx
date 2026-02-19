'use client';

import { useState, useRef, useEffect } from 'react';
import { FaTimes, FaCamera, FaUserCircle, FaEdit, FaCheck, FaTimes as FaCancel } from 'react-icons/fa';
import { LuLightbulb } from 'react-icons/lu';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { storage, db } from '@/lib/firebase';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Update displayName when currentUser changes
  useEffect(() => {
    setDisplayName(currentUser.displayName);
  }, [currentUser.displayName]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size should be less than 5MB');
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      // Upload to Firebase Storage (simple path: profilePictures/{userId})
      // This overwrites any existing profile picture
      const storageRef = ref(storage, `profilePictures/${currentUser.id}`);
      await uploadBytes(storageRef, file);
      
      // Get download URL
      const photoURL = await getDownloadURL(storageRef);
      
      // Update user document in Firestore
      const userDocRef = doc(db, 'users', currentUser.id);
      await updateDoc(userDocRef, { photoURL });
      
      // Update local state
      onUpdateUser({ photoURL });
      
      // Close modal
      setImagePreview(null);
      onClose();
      
      // Vibrate feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('Error uploading profile picture:', error);
      alert('Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!currentUser.photoURL) return;

    if (!confirm('Are you sure you want to remove your profile picture?')) {
      return;
    }

    setUploading(true);
    try {
      // Try to delete from storage if it's a custom upload (not Google profile)
      if (currentUser.photoURL?.includes('firebasestorage.googleapis.com')) {
        try {
          const photoRef = ref(storage, `profilePictures/${currentUser.id}`);
          await deleteObject(photoRef);
        } catch (error) {
          // File might not exist or already deleted, continue anyway
          console.warn('Could not delete file from storage:', error);
        }
      }
      
      // Update user document in Firestore
      const userDocRef = doc(db, 'users', currentUser.id);
      await updateDoc(userDocRef, { photoURL: null });
      
      // Update local state
      onUpdateUser({ photoURL: undefined });
      
      // Vibrate feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('Error removing profile picture:', error);
      alert('Failed to remove profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleStartEditName = () => {
    setIsEditingName(true);
    // Focus input after state update
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
    
    // Validate name
    if (!trimmedName || trimmedName.length === 0) {
      alert('Name cannot be empty');
      return;
    }
    
    if (trimmedName.length > 50) {
      alert('Name must be 50 characters or less');
      return;
    }

    // If name hasn't changed, just cancel edit
    if (trimmedName === currentUser.displayName) {
      setIsEditingName(false);
      return;
    }

    setSavingName(true);
    try {
      // Update user document in Firestore
      const userDocRef = doc(db, 'users', currentUser.id);
      await updateDoc(userDocRef, { displayName: trimmedName });
      
      // Update local state
      onUpdateUser({ displayName: trimmedName });
      
      setIsEditingName(false);
      
      // Vibrate feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    } catch (error) {
      console.error('Error updating display name:', error);
      alert('Failed to update name. Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      handleCancelEditName();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-elevation-2 max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-subtle sticky top-0 bg-surface z-10">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Profile Settings</h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors disabled:opacity-50"
          >
            <FaTimes size={20} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Current Profile Picture */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative">
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-32 h-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
                />
              ) : currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-gray-200 dark:border-gray-700"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold border-4 border-gray-200 dark:border-gray-700">
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-elevation-2 transition-colors disabled:opacity-50"
              >
                <FaCamera size={16} />
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            {/* Name Section */}
            <div className="w-full mt-3">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    disabled={savingName}
                    maxLength={50}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-center font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    placeholder="Enter your name"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
                    title="Save name"
                  >
                    <FaCheck size={16} />
                  </button>
                  <button
                    onClick={handleCancelEditName}
                    disabled={savingName}
                    className="p-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                    title="Cancel"
                  >
                    <FaCancel size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                    {currentUser.displayName}
                  </p>
                  <button
                    onClick={handleStartEditName}
                    disabled={uploading || savingName}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors disabled:opacity-50"
                    title="Edit name"
                  >
                    <FaEdit size={14} className="text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 text-center">
              {currentUser.email}
            </p>
          </div>

          {/* Actions */}
          {imagePreview && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Uploading...' : 'Upload Photo'}
              </button>
              <button
                onClick={() => {
                  setImagePreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                disabled={uploading}
                className="px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          )}

          {!imagePreview && currentUser.photoURL && (
            <button
              onClick={handleRemovePhoto}
              disabled={uploading}
              className="w-full px-4 py-3 bg-red-100 dark:bg-red-900/20 hover:bg-red-200 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Removing...' : 'Remove Photo'}
            </button>
          )}

          {/* Info */}
          <div className="mt-6 p-4 bg-primary/10 border border-primary/30 rounded-lg">
            <p className="text-sm text-fg-secondary flex items-center gap-1.5">
              <LuLightbulb size={16} className="flex-shrink-0" />
              <strong>Tip:</strong> Upload a profile picture to personalize your account. Maximum file size is 5MB.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
