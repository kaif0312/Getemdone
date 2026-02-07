import { Task } from '@/lib/types';

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function getTodayString(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

/**
 * Get date string from timestamp in YYYY-MM-DD format
 * Uses local timezone to ensure consistency
 */
export function getDateString(timestamp: number): string {
  const date = new Date(timestamp);
  // Use local date components to avoid timezone issues
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Check if a task should be shown in today's focus view
 * Implements smart rollover logic:
 * - Completed tasks: only show if completed today
 * - Incomplete tasks: show if created today, deferred to today, or should rollover
 */
export function shouldShowInTodayView(task: Task, todayStr: string): boolean {
  // Skip deleted tasks
  if (task.deleted === true) {
    return false;
  }

  // Completed tasks: only show if completed today
  if (task.completed && task.completedAt) {
    const completedDate = getDateString(task.completedAt);
    return completedDate === todayStr;
  }

  // Incomplete tasks: apply smart rollover rules
  if (!task.completed) {
    const createdDate = getDateString(task.createdAt);
    
    // 1. Deferred to today - always show
    if (task.deferredTo === todayStr) {
      return true;
    }
    
    // 2. Deferred to future - don't show
    if (task.deferredTo && task.deferredTo > todayStr) {
      return false;
    }
    
    // 3. Created today - always show (most important check)
    if (createdDate === todayStr) {
      return true;
    }
    
    // 4. Created before today - apply rollover rules
    if (createdDate < todayStr) {
      // If skipRollover is true, don't show
      if (task.skipRollover) {
        return false;
      }
      
      // Committed tasks - always rollover until completed
      if (task.committed) {
        return true;
      }
      
      // Tasks with due dates - show if due date is today, in the past (overdue), or in the future (upcoming)
      // This allows users to see upcoming deadlines and plan ahead
      if (task.dueDate) {
        const dueDateStr = getDateString(task.dueDate);
        // Show if due date is today, past (overdue), or future (upcoming deadline)
        // This ensures tasks with deadlines are always visible so users can plan
        return true;
      }
      
      // Default: rollover incomplete tasks from previous days
      return true;
    }
    
    // 5. Created in the future (shouldn't happen, but handle gracefully)
    // This might happen due to timezone issues - show it anyway to avoid losing tasks
    if (createdDate > todayStr) {
      console.warn('[taskFilter] Task created in future:', task.id, 'createdDate:', createdDate, 'todayStr:', todayStr, 'createdAt:', task.createdAt);
      return true; // Show it to avoid losing tasks
    }
  }
  
  return false;
}

/**
 * Check if a task was rolled over from a previous day
 */
export function isRolledOver(task: Task, todayStr: string): boolean {
  if (task.completed) return false;
  
  const createdDate = getDateString(task.createdAt);
  return createdDate < todayStr && !task.skipRollover;
}

/**
 * Count how many tasks were rolled over
 */
export function countRolledOverTasks(tasks: Task[], todayStr: string): number {
  return tasks.filter(task => isRolledOver(task, todayStr)).length;
}
