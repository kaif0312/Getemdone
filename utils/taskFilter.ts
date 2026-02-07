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
 */
export function getDateString(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Check if a task should be shown in today's focus view
 * Implements smart rollover logic:
 * - Completed tasks: only show if completed today
 * - Incomplete tasks: show if created today, deferred to today, or should rollover
 */
export function shouldShowInTodayView(task: Task, todayStr: string): boolean {
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
    
    // 3. Created today - always show
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
      
      // Tasks with due dates - rollover until due date passes
      if (task.dueDate) {
        const dueDateStr = getDateString(task.dueDate);
        // Show if due date is today or in the past (overdue)
        return dueDateStr <= todayStr;
      }
      
      // Default: rollover incomplete tasks from previous days
      return true;
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
