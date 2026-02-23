import { Task, TaskVisibility, CalendarEvent } from '@/lib/types';

/**
 * Check if a viewer (friend) can see a calendar event's full details.
 * Returns 'full' = show details, 'busy' = show time block only (hidden), 'none' = hide.
 */
export function canViewEvent(event: CalendarEvent, viewerId: string, isOwner: boolean): 'full' | 'busy' | 'none' {
  if (isOwner) return 'full';
  const vis = event.visibility ?? 'private';
  if (vis === 'private') return 'none';
  if (vis === 'everyone') return 'full';
  const list = event.visibilityList || [];
  if (vis === 'only') return list.includes(viewerId) ? 'full' : 'busy';
  return list.includes(viewerId) ? 'none' : 'full';
}

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
