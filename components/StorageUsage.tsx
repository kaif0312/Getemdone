'use client';

import { useState, useEffect } from 'react';
import { FaDatabase, FaSync } from 'react-icons/fa';
import { LuTriangleAlert, LuLightbulb } from 'react-icons/lu';
import { 
  formatStorageSize, 
  getStoragePercentage, 
  getStorageStatusColor,
  DEFAULT_STORAGE_LIMIT,
  calculateUserStorage
} from '@/utils/storageManager';

interface StorageUsageProps {
  userId: string;
  initialUsage?: number;
  limit?: number;
  compact?: boolean;
}

export default function StorageUsage({
  userId,
  initialUsage = 0,
  limit = DEFAULT_STORAGE_LIMIT,
  compact = false,
}: StorageUsageProps) {
  const [storageUsed, setStorageUsed] = useState(initialUsage);
  const [loading, setLoading] = useState(false);

  const percentage = getStoragePercentage(storageUsed, limit);
  const colors = getStorageStatusColor(percentage);
  const remaining = Math.max(limit - storageUsed, 0);

  const refreshStorage = async () => {
    setLoading(true);
    try {
      const usage = await calculateUserStorage(userId);
      setStorageUsed(usage);
    } catch (error) {
      console.error('Error refreshing storage:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setStorageUsed(initialUsage);
  }, [initialUsage]);

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <FaDatabase className={`${colors.text}`} size={14} />
        <span className="text-gray-700 dark:text-gray-300">
          {formatStorageSize(storageUsed)} / {formatStorageSize(limit)}
        </span>
        <span className={`font-semibold ${colors.text}`}>
          ({percentage}%)
        </span>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FaDatabase className={`${colors.text}`} size={18} />
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Storage Usage
          </h3>
        </div>
        <button
          onClick={refreshStorage}
          disabled={loading}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh storage usage"
        >
          <FaSync className={`text-gray-600 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`} size={14} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${colors.gradient} transition-all duration-500 ease-out`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Used</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {formatStorageSize(storageUsed)}
          </p>
        </div>
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-xs mb-1">Remaining</p>
          <p className="font-semibold text-gray-900 dark:text-white">
            {formatStorageSize(remaining)}
          </p>
        </div>
      </div>

      {/* Warning Message */}
      {percentage >= 90 && (
        <div className="mt-3 p-3 bg-error/10 border border-error/30 rounded-lg">
          <p className="text-xs text-error font-medium flex items-center gap-1.5">
            <LuTriangleAlert size={14} className="flex-shrink-0" />
            Storage almost full! Delete old attachments to free up space.
          </p>
        </div>
      )}
      {percentage >= 75 && percentage < 90 && (
        <div className="mt-3 p-3 bg-warning-bg border border-warning-border rounded-lg">
          <p className="text-xs text-warning-text flex items-center gap-1.5">
            <LuLightbulb size={14} className="flex-shrink-0" />
            Consider cleaning up old attachments to free space.
          </p>
        </div>
      )}

      {/* Storage Limit Info */}
      <div className="mt-3 pt-3 border-t border-border-subtle">
        <p className="text-xs text-fg-tertiary">
          Limit: <span className="font-medium">{formatStorageSize(limit)}</span> per user
        </p>
      </div>
    </div>
  );
}
