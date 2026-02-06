'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskItem from './TaskItem';
import { TaskWithUser } from '@/lib/types';
import { MdDragIndicator } from 'react-icons/md';

interface SortableTaskItemProps {
  task: TaskWithUser;
  isOwnTask: boolean;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onTogglePrivacy: (taskId: string, isPrivate: boolean) => void;
  onDelete: (taskId: string) => void;
  onAddReaction?: (taskId: string, emoji: string) => void;
  onDeferTask?: (taskId: string, deferToDate: string) => void;
  currentUserId?: string;
}

export default function SortableTaskItem(props: SortableTaskItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
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
    opacity: isDragging ? 0.7 : 1,
  };

  const canDrag = props.isOwnTask && !props.task.completed;

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`relative group ${isDragging ? 'z-50 shadow-2xl' : ''}`}
    >
      {canDrag && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
          style={{ touchAction: 'none' }}
        >
          <div className="bg-gray-200 hover:bg-gray-300 rounded p-1">
            <MdDragIndicator size={20} className="text-gray-600" />
          </div>
        </div>
      )}
      <TaskItem {...props} />
    </div>
  );
}
