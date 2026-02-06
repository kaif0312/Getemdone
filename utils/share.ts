import { User, TaskWithUser } from '@/lib/types';

interface ShareTasksParams {
  userData: User;
  tasks: TaskWithUser[];
}

export const shareMyTasks = async ({ userData, tasks }: ShareTasksParams) => {
  // Get today's incomplete tasks
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const myIncompleteTasks = tasks.filter(task => {
    if (task.userId !== userData.id) return false;
    if (task.completed) return false;
    if (task.deferredTo && task.deferredTo > todayStr) return false;
    return true;
  });

  const taskCount = myIncompleteTasks.length;
  const streakCount = userData.streakData?.currentStreak || 0;
  
  // Create share message
  const message = `🌅 Good morning! I just posted my tasks for today:

✅ ${taskCount} ${taskCount === 1 ? 'task' : 'tasks'} to complete
${streakCount > 0 ? `🔥 Current streak: ${streakCount} ${streakCount === 1 ? 'day' : 'days'}` : ''}

Hold me accountable! 👊`;

  const shareUrl = `${window.location.origin}`;

  try {
    // Try native share sheet first (works on iOS/Android)
    if (navigator.share && navigator.canShare) {
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
  const fullMessage = `${message}\n\n${shareUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(fullMessage)}`;
  window.open(whatsappUrl, '_blank');
  return true;
};
