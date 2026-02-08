'use client';

import { useState, useRef } from 'react';
import { FaTimes, FaBug, FaImage, FaSpinner, FaCheck, FaLightbulb } from 'react-icons/fa';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { compressImage, isImageFile, isFileSizeValid, formatFileSize } from '@/utils/imageCompression';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userEmail: string;
}

export default function BugReportModal({
  isOpen,
  onClose,
  userId,
  userName,
  userEmail,
}: BugReportModalProps) {
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    // Validate file type
    if (!isImageFile(file)) {
      setError('Please select an image file (JPEG, PNG, GIF, WebP)');
      return;
    }

    // Validate file size (10MB max)
    if (!isFileSizeValid(file, 10)) {
      setError('Image too large. Maximum 10MB.');
      return;
    }

    setImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      setError('Please describe the issue');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let imageUrl: string | undefined;

      // Upload image if provided
      if (image) {
        // Compress image
        const compressedImage = await compressImage(image);
        
        // Upload to Firebase Storage
        const imageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const imageRef = ref(storage, `bugReports/${userId}/${imageId}`);
        await uploadBytes(imageRef, compressedImage);
        imageUrl = await getDownloadURL(imageRef);
      }

      // Save bug report to Firestore
      await addDoc(collection(db, 'bugReports'), {
        userId,
        userName,
        userEmail,
        description: description.trim(),
        imageUrl: imageUrl || null,
        status: 'open',
        createdAt: serverTimestamp(),
        resolvedAt: null,
        adminNotes: null,
      });

      // Success
      setSubmitted(true);
      
      // Reset and close after 2 seconds
      setTimeout(() => {
        setDescription('');
        setImage(null);
        setImagePreview(null);
        setSubmitted(false);
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error submitting bug report:', err);
      setError('Failed to submit bug report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-lg z-50 animate-in slide-in-from-top duration-300">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-yellow-100 to-orange-100 dark:from-yellow-900/30 dark:to-orange-900/30 rounded-lg">
                <FaLightbulb className="text-yellow-600 dark:text-yellow-400" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Feedback & Ideas
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Report bugs or suggest features
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors disabled:opacity-50"
              title="Close"
            >
              <FaTimes className="text-gray-500 dark:text-gray-400" size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {submitted ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                  <FaCheck className="text-green-600 dark:text-green-400" size={32} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                  Feedback Submitted!
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Thank you for helping us improve the app.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Your feedback <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Found a bug? Have a feature idea? Tell us what you're thinking..."
                    rows={6}
                    maxLength={1000}
                    disabled={submitting}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 dark:focus:ring-yellow-400 resize-none disabled:opacity-50"
                  />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {description.length}/1000 characters
                    </span>
                    {description.length > 900 && (
                      <span className="text-xs text-orange-500">
                        {1000 - description.length} remaining
                      </span>
                    )}
                  </div>
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Screenshot (optional)
                  </label>
                  
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Bug screenshot"
                        className="w-full h-48 object-cover rounded-lg border-2 border-gray-300 dark:border-gray-600"
                      />
                      <button
                        onClick={removeImage}
                        disabled={submitting}
                        className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg disabled:opacity-50"
                        title="Remove image"
                      >
                        <FaTimes size={12} />
                      </button>
                      {image && (
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          {image.name} ({formatFileSize(image.size)})
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageSelect}
                        disabled={submitting}
                        className="hidden"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={submitting}
                        className="w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-red-400 dark:hover:border-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex flex-col items-center gap-2 text-gray-600 dark:text-gray-400">
                          <FaImage size={24} />
                          <span className="text-sm font-medium">
                            Click to upload screenshot
                          </span>
                          <span className="text-xs text-gray-500">
                            PNG, JPG, GIF, WebP (max 10MB)
                          </span>
                        </div>
                      </button>
                    </>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                )}

                {/* Info */}
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    💡 <strong>Tip:</strong> For bugs, include steps to reproduce. For features, describe how it would help you!
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!submitted && (
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !description.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <FaSpinner className="animate-spin" size={14} />
                    Submitting...
                  </>
                ) : (
                  <>
                    <FaLightbulb size={14} />
                    Submit Feedback
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
