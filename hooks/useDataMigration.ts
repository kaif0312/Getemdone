/**
 * Data Migration Hook
 * 
 * Migrates existing unencrypted data to encrypted format
 * Runs once per user automatically
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useEncryption } from './useEncryption';
import { useAuth } from '@/contexts/AuthContext';
import { isEncrypted } from '@/utils/crypto';
import { Task, Comment } from '@/lib/types';

interface MigrationStatus {
  completed: boolean;
  migratedAt?: number;
  tasksMigrated: number;
  notificationsMigrated: number;
}

export function useDataMigration() {
  const { user } = useAuth();
  const { 
    encryptForSelf, 
    encryptForFriend, 
    isInitialized: encryptionInitialized,
    getSharedKey 
  } = useEncryption();
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  /**
   * Migrate all user data to encrypted format
   */
  const migrateAllData = useCallback(async (): Promise<{ success: boolean; tasksMigrated: number; notificationsMigrated: number }> => {
    if (!user?.uid || !encryptionInitialized) {
      throw new Error('User not authenticated or encryption not initialized');
    }

    setIsMigrating(true);
    let tasksMigrated = 0;
    let notificationsMigrated = 0;

    try {
      console.log('[useDataMigration] Starting migration for user:', user.uid);

      // Migrate tasks
      const tasksQuery = query(
        collection(db, 'tasks'),
        where('userId', '==', user.uid)
      );
      const tasksSnapshot = await getDocs(tasksQuery);
      
      console.log(`[useDataMigration] Found ${tasksSnapshot.size} tasks to check`);

      // Process tasks in batches to avoid overwhelming Firestore
      const batch = writeBatch(db);
      let batchCount = 0;
      const BATCH_SIZE = 500;

      for (const taskDoc of tasksSnapshot.docs) {
        const task = taskDoc.data() as Task;
        const updates: any = {};
        let needsUpdate = false;

        // Check and encrypt task text
        if (task.text && !isEncrypted(task.text)) {
          updates.text = await encryptForSelf(task.text);
          needsUpdate = true;
        }

        // Check and encrypt notes
        if (task.notes && !isEncrypted(task.notes)) {
          updates.notes = await encryptForSelf(task.notes);
          needsUpdate = true;
        }

        // Check and encrypt comments
        if (task.comments && Array.isArray(task.comments) && task.comments.length > 0) {
          const encryptedComments: Comment[] = [];
          let commentsNeedUpdate = false;

          for (const comment of task.comments) {
            if (comment.text && !isEncrypted(comment.text)) {
              // Comments are added by friends on tasks
              // Encrypt with the shared key between comment author and task owner
              // If comment author is the task owner, use master key
              if (comment.userId === task.userId) {
                // Comment by task owner on their own task - use master key
                encryptedComments.push({
                  ...comment,
                  text: await encryptForSelf(comment.text),
                });
              } else {
                // Comment by friend - use shared key with task owner
                encryptedComments.push({
                  ...comment,
                  text: await encryptForFriend(comment.text, task.userId),
                });
              }
              commentsNeedUpdate = true;
            } else {
              encryptedComments.push(comment);
            }
          }

          if (commentsNeedUpdate) {
            updates.comments = encryptedComments;
            needsUpdate = true;
          }
        }

        // Update task if any fields need encryption
        if (needsUpdate) {
          batch.update(taskDoc.ref, updates);
          tasksMigrated++;
          batchCount++;

          // Commit batch if it reaches the limit
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`[useDataMigration] Committed batch of ${batchCount} tasks`);
            batchCount = 0;
          }
        }
      }

      // Commit remaining tasks
      if (batchCount > 0) {
        await batch.commit();
        console.log(`[useDataMigration] Committed final batch of ${batchCount} tasks`);
      }

      console.log(`[useDataMigration] Migrated ${tasksMigrated} tasks`);

      // Notifications: keep plaintext so push notifications display correctly (Cloud Function can't decrypt)

      // Mark migration as complete
      const statusRef = doc(db, 'migrationStatus', user.uid);
      const status: MigrationStatus = {
        completed: true,
        migratedAt: Date.now(),
        tasksMigrated,
        notificationsMigrated,
      };
      const { setDoc } = await import('firebase/firestore');
      await setDoc(statusRef, status, { merge: true });

      setMigrationStatus(status);
      console.log('[useDataMigration] ✅ Migration completed successfully');

      return { success: true, tasksMigrated, notificationsMigrated };
    } catch (error) {
      console.error('[useDataMigration] ❌ Migration failed:', error);
      throw error;
    } finally {
      setIsMigrating(false);
    }
  }, [user?.uid, encryptionInitialized, encryptForSelf, encryptForFriend, getSharedKey]);

  /**
   * Check if migration is needed and run it automatically
   */
  useEffect(() => {
    const runMigrationIfNeeded = async () => {
      if (!user?.uid || !encryptionInitialized || isMigrating) return;

      try {
        // Check if migration has been completed
        const statusRef = doc(db, 'migrationStatus', user.uid);
        const { getDoc } = await import('firebase/firestore');
        const statusDoc = await getDoc(statusRef);

        if (statusDoc.exists()) {
          const status = statusDoc.data() as MigrationStatus;
          if (status.completed) {
            console.log('[useDataMigration] Migration already completed');
            setMigrationStatus(status);
            return;
          }
        }

        // Migration not completed, run it
        console.log('[useDataMigration] Migration needed, starting...');
        await migrateAllData();
      } catch (error) {
        console.error('[useDataMigration] Error in auto-migration:', error);
        // Don't block the app if migration fails
      }
    };

    // Wait a bit for encryption to initialize
    const timer = setTimeout(runMigrationIfNeeded, 3000);
    return () => clearTimeout(timer);
  }, [user?.uid, encryptionInitialized, isMigrating, migrateAllData]);

  return {
    migrateAllData,
    isMigrating,
    migrationStatus,
    isChecking,
  };
}
