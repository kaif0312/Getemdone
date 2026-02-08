/**
 * Recycle Bin automatic cleanup utilities
 * Automatically deletes items older than retention period
 */

import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { Task } from '@/lib/types';

// Default retention period: 30 days
export const DEFAULT_RETENTION_DAYS = 30;
export const RETENTION_MS = DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/**
 * Calculate when a deleted item will be permanently removed
 */
export function getExpiryDate(deletedAt: number): Date {
  return new Date(deletedAt + RETENTION_MS);
}

/**
 * Calculate days remaining until permanent deletion
 */
export function getDaysRemaining(deletedAt: number): number {
  const now = Date.now();
  const expiryTime = deletedAt + RETENTION_MS;
  const msRemaining = expiryTime - now;
  return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
}

/**
 * Check if item should be permanently deleted
 */
export function shouldPermanentlyDelete(deletedAt: number): boolean {
  const now = Date.now();
  return now >= (deletedAt + RETENTION_MS);
}

/**
 * Format expiry information for display
 */
export function formatExpiryInfo(deletedAt: number): {
  daysRemaining: number;
  expiryDate: string;
  isExpiringSoon: boolean;
} {
  const daysRemaining = getDaysRemaining(deletedAt);
  const expiryDate = getExpiryDate(deletedAt).toLocaleDateString();
  const isExpiringSoon = daysRemaining <= 7;
  
  return { daysRemaining, expiryDate, isExpiringSoon };
}

/**
 * Delete all attachments for a task from Firebase Storage
 */
async function deleteTaskAttachments(taskId: string, attachments: any[]): Promise<void> {
  if (!attachments || attachments.length === 0) return;
  
  const deletePromises = attachments.map(async (attachment) => {
    try {
      // Delete main file
      const mainRef = ref(storage, `attachments/${taskId}/${attachment.id}`);
      await deleteObject(mainRef);
      
      // Delete thumbnail if exists
      if (attachment.thumbnailUrl) {
        const thumbRef = ref(storage, `attachments/${taskId}/${attachment.id}_thumb`);
        await deleteObject(thumbRef);
      }
    } catch (error) {
      // File might not exist, log and continue
      console.warn(`Could not delete attachment ${attachment.id}:`, error);
    }
  });
  
  await Promise.all(deletePromises);
}

/**
 * Permanently delete expired items from recycle bin
 * Returns count of deleted items
 */
export async function cleanupExpiredTasks(userId: string): Promise<number> {
  try {
    const tasksRef = collection(db, 'tasks');
    const q = query(
      tasksRef,
      where('userId', '==', userId),
      where('deleted', '==', true)
    );
    
    const snapshot = await getDocs(q);
    let deletedCount = 0;
    
    const deletePromises = snapshot.docs.map(async (taskDoc) => {
      const task = taskDoc.data() as Task;
      
      if (task.deletedAt && shouldPermanentlyDelete(task.deletedAt)) {
        // Delete attachments from storage first
        if (task.attachments && task.attachments.length > 0) {
          await deleteTaskAttachments(taskDoc.id, task.attachments);
        }
        
        // Delete task document
        await deleteDoc(doc(db, 'tasks', taskDoc.id));
        deletedCount++;
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`Auto-deleted expired task: ${taskDoc.id}`);
        }
      }
    });
    
    await Promise.all(deletePromises);
    
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning up expired tasks:', error);
    return 0;
  }
}

/**
 * Get count of tasks expiring soon (within 7 days)
 */
export async function getExpiringSoonCount(userId: string): Promise<number> {
  try {
    const tasksRef = collection(db, 'tasks');
    const q = query(
      tasksRef,
      where('userId', '==', userId),
      where('deleted', '==', true)
    );
    
    const snapshot = await getDocs(q);
    let count = 0;
    
    snapshot.forEach((doc) => {
      const task = doc.data() as Task;
      if (task.deletedAt) {
        const daysRemaining = getDaysRemaining(task.deletedAt);
        if (daysRemaining > 0 && daysRemaining <= 7) {
          count++;
        }
      }
    });
    
    return count;
  } catch (error) {
    console.error('Error getting expiring soon count:', error);
    return 0;
  }
}
