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
}

export default function AttachmentUpload({
  taskId,
  currentAttachments,
  onUploadComplete,
  maxAttachments = 3,
  userStorageUsed = 0,
  userStorageLimit = DEFAULT_STORAGE_LIMIT,
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
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
        onChange={handleFileSelect}
        disabled={uploading || !canUploadMore}
        className="hidden"
      />
      
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || !canUploadMore}
        className={`
          p-2 rounded-lg transition-all
          ${uploading || !canUploadMore
            ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
          }
        `}
        title={
          !canUploadMore
            ? `Maximum ${maxAttachments} attachments`
            : uploading
            ? 'Uploading...'
            : 'Attach file'
        }
      >
        {uploading ? (
          <FaSpinner className="animate-spin" size={16} />
        ) : (
          <FaPaperclip size={16} />
        )}
      </button>

      {error && (
        <div className="absolute top-full left-0 mt-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs px-2 py-1 rounded whitespace-nowrap z-10">
          {error}
        </div>
      )}

      {!canUploadMore && !uploading && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {maxAttachments}
        </div>
      )}
    </div>
  );
}
