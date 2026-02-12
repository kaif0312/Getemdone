'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskItem from './TaskItem';
import { TaskWithUser, Attachment } from '@/lib/types';
import { MdDragIndicator } from 'react-icons/md';

interface SortableTaskItemProps {
  task: TaskWithUser;
  isOwnTask: boolean;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onTogglePrivacy: (taskId: string, isPrivate: boolean) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask?: (taskId: string, text: string) => Promise<void>;
  onUpdateDueDate?: (taskId: string, dueDate: number | null) => Promise<void>;
  onUpdateNotes?: (taskId: string, notes: string, existingSubtasks?: { id: string; title: string; completed: boolean }[]) => Promise<void>;
  onToggleCommitment?: (taskId: string, committed: boolean) => void;
  onToggleSkipRollover?: (taskId: string, skipRollover: boolean) => void;
  onAddReaction?: (taskId: string, emoji: string) => void;
  onOpenComments?: (taskId: string) => void;
  onDeferTask?: (taskId: string, deferToDate: string) => void;
  onAddAttachment?: (taskId: string, attachment: Attachment) => void;
  onDeleteAttachment?: (taskId: string, attachmentId: string) => void;
  onUpdateTaskTags?: (taskId: string, tags: string[]) => Promise<void>;
  recordRecentlyUsedTag?: (emoji: string) => Promise<void>;
  recentUsedTags?: string[];
  onUpdateTaskSubtasks?: (taskId: string, subtasks: { id: string; title: string; completed: boolean }[]) => Promise<void>;
  userStorageUsed?: number;
  userStorageLimit?: number;
  currentUserId?: string;
}

export default function SortableTaskItem(props: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: props.task.id,
    disabled: props.task.completed || !props.isOwnTask, // Can't drag completed tasks or others' tasks
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const canDrag = props.isOwnTask && !props.task.completed;

  const handleDragStart = () => {
    // Haptic feedback when drag starts
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`relative ${isDragging ? 'z-50 shadow-2xl scale-105' : ''} transition-transform`}
    >
      <TaskItem 
        {...props} 
        dragHandleProps={canDrag ? {
          ref: setActivatorNodeRef,
          attributes,
          listeners: {
            ...listeners,
            onPointerDown: (e: React.PointerEvent) => {
              handleDragStart();
              listeners?.onPointerDown?.(e as any);
            }
          }
        } : undefined}
      />
    </div>
  );
}
