import { Task, TaskVisibility } from '@/lib/types';

/**
 * Check if a viewer (friend) can see a task's content.
 * Owner always sees. For friends: everyone = yes, private = no, only = if in list, except = if not in list.
 */
export function canViewTask(task: Task, viewerId: string, isOwner: boolean): boolean {
  if (isOwner) return true;
  const effVisibility: TaskVisibility = task.visibility ?? (task.isPrivate ? 'private' : 'everyone');
  if (effVisibility === 'private') return false;
  if (effVisibility === 'everyone') return true;
  const list = task.visibilityList || [];
  if (effVisibility === 'only') return list.includes(viewerId);
  return !list.includes(viewerId); // except
}
