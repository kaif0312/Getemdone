import { User, TaskWithUser } from '@/lib/types';
import { shouldShowInTodayView, getTodayString } from '@/utils/taskFilter';

interface ShareTasksParams {
  userData: User;
  tasks: TaskWithUser[];
}

/**
 * Format a due date for display
 */
function formatDueDate(dueDate: number): string {
  const now = new Date();
  const due = new Date(dueDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  
  const diffTime = dueDay.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    // Overdue
    return `⚠️ Overdue (${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago)`;
  } else if (diffDays === 0) {
    // Due today
    const timeStr = due.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    return `🔥 Due today at ${timeStr}`;
  } else if (diffDays === 1) {
    // Due tomorrow
    const timeStr = due.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    return `⏰ Due tomorrow at ${timeStr}`;
  } else if (diffDays <= 7) {
    // Due this week
    const dayName = due.toLocaleDateString('en-US', { weekday: 'short' });
    const timeStr = due.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    return `📅 Due ${dayName} at ${timeStr}`;
  } else {
    // Due later
    const dateStr = due.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: due.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
    const timeStr = due.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    return `📆 Due ${dateStr} at ${timeStr}`;
  }
}

export const shareMyTasks = async ({ userData, tasks }: ShareTasksParams) => {
  const todayStr = getTodayString();
  
  // Get pending tasks using the same logic as the app
  const pendingTasks = tasks.filter(task => {
    if (task.userId !== userData.id) return false;
    if (task.deleted === true) return false;
    if (task.completed) return false;
    return shouldShowInTodayView(task, todayStr);
  }).sort((a, b) => {
    // Sort by due date: tasks with due dates first, then by due date (earliest first)
    if (a.dueDate && b.dueDate) {
      return a.dueDate - b.dueDate;
    } else if (a.dueDate && !b.dueDate) {
      return -1;
    } else if (!a.dueDate && b.dueDate) {
      return 1;
    } else {
      return (a.order || 0) - (b.order || 0);
    }
  });

  const taskCount = pendingTasks.length;
  const streakCount = userData.streakData?.currentStreak || 0;
  
  // Create elegant share message with task list
  let message = `✨ *My Tasks for Today* ✨\n\n`;
  
  if (taskCount === 0) {
    message += `🎉 All caught up! No pending tasks today.\n\n`;
  } else {
    message += `📋 *${taskCount} ${taskCount === 1 ? 'Task' : 'Tasks'} Pending*\n\n`;
    
    // List all tasks with emojis and formatting
    pendingTasks.forEach((task, index) => {
      const taskEmoji = task.committed ? '💪' : task.dueDate ? '⏳' : '📌';
      let taskLine = `${taskEmoji} ${task.text}`;
      
      // Add due date info if available
      if (task.dueDate) {
        taskLine += `\n   ${formatDueDate(task.dueDate)}`;
      }
      
      // Add commitment indicator
      if (task.committed) {
        taskLine += `\n   🔒 Commitment`;
      }
      
      message += `${taskLine}\n\n`;
    });
  }
  
  // Add streak info if available
  if (streakCount > 0) {
    message += `🔥 *Current Streak:* ${streakCount} ${streakCount === 1 ? 'day' : 'days'}\n\n`;
  }
  
  message += `💪 Hold me accountable! Let's get things done together! 🚀`;

  const shareUrl = `${window.location.origin}`;

  try {
    // Try native share sheet first (works on iOS/Android)
    if (navigator.share) {
      await navigator.share({
        title: `${userData.displayName}'s Daily Tasks`,
        text: message,
        url: shareUrl,
      });
      return true;
    }
  } catch (error) {
    // User cancelled or share failed, fall through to WhatsApp
    if ((error as Error).name === 'AbortError') {
      return false; // User cancelled
    }
  }

  // Fallback: Open WhatsApp directly
  const fullMessage = `${message}\n\n🔗 ${shareUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(fullMessage)}`;
  window.open(whatsappUrl, '_blank');
  return true;
};
