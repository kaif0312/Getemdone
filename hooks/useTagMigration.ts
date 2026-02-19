/**
 * Tag Migration Hook
 * Migrates emoji tags to SVG icon IDs in tasks and user recentlyUsedTags.
 * Runs once per user.
 */

import { useEffect, useRef } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeTagToIconId } from '@/lib/tagIcons';
import type { Task } from '@/lib/types';

const MIGRATION_KEY = 'emoji-tag-migration-v1';

/** True if any tag would change when normalized (emoji or legacy format) */
function needsTagMigration(tags: string[] | undefined): boolean {
  if (!tags?.length) return false;
  return tags.some((t) => normalizeTagToIconId(t) !== t.trim());
}

export function useTagMigration() {
  const { user, userData } = useAuth();
  const hasRunRef = useRef(false);

  useEffect(() => {
    const runMigration = async () => {
      if (!user?.uid || hasRunRef.current) return;

      try {
        const statusRef = doc(db, 'migrationStatus', user.uid);
        const { getDoc, setDoc } = await import('firebase/firestore');
        const statusDoc = await getDoc(statusRef);
        const status = statusDoc.data() as Record<string, unknown> | undefined;
        if (status?.[MIGRATION_KEY] === true) {
          hasRunRef.current = true;
          return;
        }

        hasRunRef.current = true;

        // Migrate tasks with emoji tags
        const tasksQuery = query(
          collection(db, 'tasks'),
          where('userId', '==', user.uid)
        );
        const snapshot = await getDocs(tasksQuery);
        const batch = writeBatch(db);
        let count = 0;

        for (const taskDoc of snapshot.docs) {
          const task = taskDoc.data() as Task;
          const tags = task.tags;
          if (!tags?.length || !needsTagMigration(tags)) continue;

          const migrated = [...new Set(tags.map(normalizeTagToIconId))];
          batch.update(taskDoc.ref, { tags: migrated });
          count++;
        }

        if (count > 0) {
          await batch.commit();
          console.log(`[useTagMigration] Migrated ${count} tasks from emoji to icon IDs`);
        }

        // Migrate user recentlyUsedTags
        const recentRaw = userData?.recentlyUsedTags;
        if (recentRaw?.length && needsTagMigration(recentRaw)) {
          const migrated = [...new Map(recentRaw.map((t) => [normalizeTagToIconId(t), 1])).keys()].slice(0, 12);
          await updateDoc(doc(db, 'users', user.uid), { recentlyUsedTags: migrated });
          console.log('[useTagMigration] Migrated user recentlyUsedTags');
        }

        await setDoc(statusRef, { [MIGRATION_KEY]: true }, { merge: true });
      } catch (err) {
        console.error('[useTagMigration] Migration failed:', err);
        hasRunRef.current = false;
      }
    };

    const t = setTimeout(runMigration, 2000);
    return () => clearTimeout(t);
  }, [user?.uid, userData]);
}
