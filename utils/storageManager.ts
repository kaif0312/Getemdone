/**
 * Storage management utilities for tracking user storage usage
 */

import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Task } from '@/lib/types';

// Default storage limit: 100MB in bytes
export const DEFAULT_STORAGE_LIMIT = 100 * 1024 * 1024; // 100MB

/**
 * Update user's storage usage in Firestore
 * @param userId - User ID
 * @param sizeChange - Bytes to add (positive) or remove (negative)
 */
export async function updateUserStorageUsage(userId: string, sizeChange: number): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      storageUsed: increment(sizeChange),
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Updated storage for ${userId}: ${sizeChange > 0 ? '+' : ''}${sizeChange} bytes`);
    }
  } catch (error) {
    console.error('Error updating storage usage:', error);
    throw error;
  }
}

/**
 * Calculate total storage used by a user across all their task attachments
 */
export async function calculateUserStorage(userId: string): Promise<number> {
  try {
    const tasksRef = collection(db, 'tasks');
    const q = query(tasksRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    
    let totalSize = 0;
    
    snapshot.forEach((doc) => {
      const task = doc.data() as Task;
      if (task.attachments && Array.isArray(task.attachments)) {
        task.attachments.forEach((attachment) => {
          totalSize += attachment.size || 0;
        });
      }
    });
    
    return totalSize;
  } catch (error) {
    console.error('Error calculating storage:', error);
    return 0;
  }
}

/**
 * Check if user has enough storage for a new file
 */
export function hasStorageSpace(
  currentUsage: number,
  fileSize: number,
  limit: number = DEFAULT_STORAGE_LIMIT
): boolean {
  return (currentUsage + fileSize) <= limit;
}

/**
 * Format bytes to human-readable string
 */
export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Calculate storage percentage used
 */
export function getStoragePercentage(
  used: number,
  limit: number = DEFAULT_STORAGE_LIMIT
): number {
  return Math.min(Math.round((used / limit) * 100), 100);
}

/**
 * Get storage status color based on usage
 */
export function getStorageStatusColor(percentage: number): {
  bg: string;
  text: string;
  gradient: string;
} {
  if (percentage >= 90) {
    return {
      bg: 'bg-red-500',
      text: 'text-red-600',
      gradient: 'from-red-500 to-red-600',
    };
  } else if (percentage >= 75) {
    return {
      bg: 'bg-orange-500',
      text: 'text-orange-600',
      gradient: 'from-orange-500 to-orange-600',
    };
  } else if (percentage >= 50) {
    return {
      bg: 'bg-yellow-500',
      text: 'text-yellow-600',
      gradient: 'from-yellow-500 to-yellow-600',
    };
  } else {
    return {
      bg: 'bg-green-500',
      text: 'text-green-600',
      gradient: 'from-green-500 to-green-600',
    };
  }
}
