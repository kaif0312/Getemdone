/**
 * Hook for automatic recycle bin cleanup
 * Runs cleanup on mount and periodically
 */

import { useEffect, useRef } from 'react';
import { cleanupExpiredTasks } from '@/utils/recycleCleanup';

// Check every 6 hours
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function useRecycleCleanup(userId: string | null | undefined) {
  const lastCleanupRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!userId) return;

    const performCleanup = async () => {
      const now = Date.now();
      
      // Only run cleanup if enough time has passed since last cleanup
      // This prevents multiple cleanups when component re-renders
      if (now - lastCleanupRef.current < CLEANUP_INTERVAL_MS) {
        return;
      }

      try {
        const deletedCount = await cleanupExpiredTasks(userId);
        
        if (deletedCount > 0 && process.env.NODE_ENV === 'development') {
          console.log(`Auto-cleanup: Removed ${deletedCount} expired task(s)`);
        }
        
        lastCleanupRef.current = now;
      } catch (error) {
        console.error('Auto-cleanup failed:', error);
      }
    };

    // Run cleanup on mount
    performCleanup();

    // Set up periodic cleanup
    intervalRef.current = setInterval(performCleanup, CLEANUP_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [userId]);
}
