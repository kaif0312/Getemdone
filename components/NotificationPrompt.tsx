'use client';

import { useState } from 'react';
import { FaBell, FaCheckCircle, FaTimes } from 'react-icons/fa';

interface NotificationPromptProps {
  onEnable: () => Promise<boolean>;
  permission: NotificationPermission;
  isSupported: boolean;
  onDismiss?: () => void;
}

export default function NotificationPrompt({
  onEnable,
  permission,
  isSupported,
  onDismiss,
}: NotificationPromptProps) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't show if not supported, already granted, or denied
  if (!isSupported || permission === 'granted' || permission === 'denied' || isDismissed) {
    return null;
  }

  const handleEnable = async () => {
    setIsRequesting(true);
    try {
      const granted = await onEnable();
      if (granted) {
        // Success - component will hide automatically when permission changes
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  return (
    <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Elegant notification prompt card */}
      <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 border border-blue-200/50 dark:border-blue-700/50 rounded-2xl p-5 md:p-6 shadow-elevation-2 backdrop-blur-sm relative overflow-hidden">
        {/* Decorative background pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-purple-400 rounded-full blur-2xl"></div>
        </div>

        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-full hover:bg-white/50 dark:hover:bg-gray-700/50"
            aria-label="Dismiss"
          >
            <FaTimes size={14} />
          </button>
        )}

        <div className="relative z-10">
          {/* Icon and Title */}
          <div className="flex items-start gap-4 mb-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-md">
                <FaBell className="text-white" size={20} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white mb-1.5">
                Stay on track with notifications
              </h3>
              <p className="text-sm md:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
                Get reminders for deadlines, friend updates, and daily check-ins
              </p>
            </div>
          </div>

          {/* Benefits list */}
          <div className="space-y-2 mb-5">
            <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <FaCheckCircle className="text-blue-500 dark:text-blue-400 flex-shrink-0" size={14} />
              <span>Deadline reminders</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <FaCheckCircle className="text-blue-500 dark:text-blue-400 flex-shrink-0" size={14} />
              <span>Friend activity updates</span>
            </div>
            <div className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-300">
              <FaCheckCircle className="text-blue-500 dark:text-blue-400 flex-shrink-0" size={14} />
              <span>Daily progress check-ins</span>
            </div>
          </div>

          {/* Enable button */}
          <button
            onClick={handleEnable}
            disabled={isRequesting}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3.5 md:py-4 rounded-xl shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 active:scale-[0.98]"
          >
            {isRequesting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Enabling...</span>
              </>
            ) : (
              <>
                <FaBell size={16} />
                <span>Enable Notifications</span>
              </>
            )}
          </button>

          {/* Privacy note */}
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-3">
            You can change this anytime in settings
          </p>
        </div>
      </div>
    </div>
  );
}
