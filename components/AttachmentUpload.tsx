'use client';

import { useRef, useState } from 'react';
import { FaPaperclip, FaSpinner } from 'react-icons/fa';
import { compressImage, generateThumbnail, isImageFile, isFileSizeValid, formatFileSize } from '@/utils/imageCompression';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { Attachment } from '@/lib/types';
import { hasStorageSpace, DEFAULT_STORAGE_LIMIT, formatStorageSize } from '@/utils/storageManager';

interface AttachmentUploadProps {
  taskId: string;
  currentAttachments: Attachment[];
  onUploadComplete: (attachment: Attachment) => void;
  maxAttachments?: number;
  userStorageUsed?: number;
  userStorageLimit?: number;
  /** Ghost variant: tertiary text, no backgrounds, 12px - for task card quick actions */
  variant?: 'default' | 'ghost';
}

export default function AttachmentUpload({
  taskId,
  currentAttachments,
  onUploadComplete,
  maxAttachments = 3,
  userStorageUsed = 0,
  userStorageLimit = DEFAULT_STORAGE_LIMIT,
  variant = 'default',
}: AttachmentUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUploadMore = currentAttachments.length < maxAttachments;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file size (10MB max before compression)
    if (!isFileSizeValid(file, 10)) {
      setError('File too large. Maximum 10MB.');
      return;
    }

    // Check max attachments
    if (!canUploadMore) {
      setError(`Maximum ${maxAttachments} attachments per task.`);
      return;
    }

    // Check storage limit
    if (!hasStorageSpace(userStorageUsed, file.size, userStorageLimit)) {
      const remaining = Math.max(userStorageLimit - userStorageUsed, 0);
      setError(`Not enough storage. ${formatStorageSize(remaining)} remaining.`);
      return;
    }

    setUploading(true);

    try {
      const attachmentId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      let fileToUpload: Blob = file;
      let thumbnailUrl: string | undefined;

      // Compress if image
      if (isImageFile(file)) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Original size:', formatFileSize(file.size));
        }
        
        // Compress main image
        fileToUpload = await compressImage(file);
        
        if (process.env.NODE_ENV === 'development') {
          console.log('Compressed size:', formatFileSize(fileToUpload.size));
        }

        // Generate thumbnail
        const thumbnailBlob = await generateThumbnail(file);
        const thumbnailRef = ref(storage, `attachments/${taskId}/${attachmentId}_thumb`);
        await uploadBytes(thumbnailRef, thumbnailBlob);
        thumbnailUrl = await getDownloadURL(thumbnailRef);
      }

      // Upload main file
      const mainFileRef = ref(storage, `attachments/${taskId}/${attachmentId}`);
      await uploadBytes(mainFileRef, fileToUpload);
      const url = await getDownloadURL(mainFileRef);

      // Create attachment object
      const attachment: Attachment = {
        id: attachmentId,
        type: isImageFile(file) ? 'image' : 'document',
        url,
        ...(thumbnailUrl && { thumbnailUrl }), // Only include if exists
        name: file.name,
        size: fileToUpload.size,
        uploadedAt: Date.now(),
      };

      onUploadComplete(attachment);
      
      // Vibrate feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative inline-block">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        onChange={handleFileSelect}
        disabled={uploading || !canUploadMore}
        className="hidden"
      />
      
      <button
        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        disabled={uploading || !canUploadMore}
        className={
          variant === 'ghost'
            ? `flex items-center gap-1 text-xs transition-colors
                ${uploading || !canUploadMore
                  ? 'text-fg-disabled cursor-not-allowed'
                  : 'text-fg-tertiary hover:text-fg-secondary'
                }`
            : `
          flex items-center gap-1 px-1.5 py-0.5 text-xs transition-colors rounded
          ${uploading || !canUploadMore
            ? 'text-gray-400 dark:text-gray-600 cursor-not-allowed bg-gray-100 dark:bg-gray-800'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
          }
        `
        }
        title={
          !canUploadMore
            ? `Maximum ${maxAttachments} attachments`
            : uploading
            ? 'Uploading...'
            : 'Attach file'
        }
      >
        {uploading ? (
          <FaSpinner className="animate-spin" size={10} />
        ) : (
          <FaPaperclip size={10} />
        )}
        <span>{uploading ? 'Uploading...' : 'Attach'}</span>
      </button>

      {error && (
        <div className="absolute top-full left-0 mt-1 bg-error/10 dark:bg-error/20 text-error text-xs px-2 py-1 rounded whitespace-nowrap z-10 shadow-elevation-2">
          {error}
        </div>
      )}
    </div>
  );
}
