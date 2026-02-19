'use client';

import { useEffect, useRef } from 'react';
import { FaEdit, FaClock, FaStar, FaEye, FaEyeSlash, FaTrash } from 'react-icons/fa';
import { LuRepeat } from 'react-icons/lu';
import { Task } from '@/lib/types';

interface TaskContextMenuProps {
  task: Task;
  isOwnTask: boolean;
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit?: () => void;
  onSetDeadline?: () => void;
  onSetRecurrence?: () => void;
  onToggleCommitment?: () => void;
  onTogglePrivacy?: () => void;
  onDelete?: () => void;
  isCommitted?: boolean;
  isPrivate?: boolean;
  /** When true, show Set recurrence even for completed tasks (e.g. calendar view) */
  showRecurrenceForCompleted?: boolean;
}

export default function TaskContextMenu({
  task,
  isOwnTask,
  isOpen,
  position,
  onClose,
  onEdit,
  onSetDeadline,
  onSetRecurrence,
  onToggleCommitment,
  onTogglePrivacy,
  onDelete,
  isCommitted = false,
  isPrivate = false,
  showRecurrenceForCompleted = false,
}: TaskContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Close on outside click
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !isOwnTask) return null;

  // Calculate position to keep menu on screen
  const menuWidth = 200;
  const menuHeight = 300;
  const x = Math.min(position.x, window.innerWidth - menuWidth - 10);
  const y = Math.min(position.y, window.innerHeight - menuHeight - 10);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-[99998] bg-black/20 dark:bg-black/40"
        onClick={onClose}
      />
      
      {/* Context Menu - surface-elevated, 12px radius, 8px padding, 44px touch targets */}
      <div
        ref={menuRef}
        className="fixed z-[99999] bg-elevated rounded-xl p-2 min-w-[220px] animate-in fade-in zoom-in duration-200 shadow-elevation-2 border border-border-subtle"
        style={{
          left: `${x}px`,
          top: `${y}px`,
        }}
      >
        {/* Edit Task - Only for incomplete tasks */}
        {onEdit && !task.completed && (
          <button
            onClick={() => { onEdit(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] text-left text-fg-primary hover:bg-surface-muted rounded-lg transition-colors"
          >
            <FaEdit size={18} className="text-fg-secondary shrink-0" />
            <span className="text-sm">Edit task</span>
          </button>
        )}

        {/* Schedule & Deadline - Only for incomplete tasks */}
        {onSetDeadline && !task.completed && (
          <button
            onClick={() => { onSetDeadline(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] text-left text-fg-primary hover:bg-surface-muted rounded-lg transition-colors"
          >
            <FaClock size={18} className={task.dueDate || task.deferredTo ? 'text-amber-500' : 'text-fg-secondary shrink-0'} />
            <span className="text-sm">
              {task.dueDate || task.deferredTo ? 'Schedule & deadline' : 'Schedule or set deadline'}
            </span>
          </button>
        )}

        {/* Set Recurrence */}
        {onSetRecurrence && (!task.completed || showRecurrenceForCompleted) && (
          <button
            onClick={() => { onSetRecurrence(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] text-left text-fg-primary hover:bg-surface-muted rounded-lg transition-colors"
          >
            <LuRepeat className="text-base shrink-0" size={16} />
            <span className="text-sm">
              {task.recurrence ? 'Change recurrence' : 'Set recurrence'}
            </span>
          </button>
        )}

        {/* Toggle Commitment - Only for incomplete tasks */}
        {onToggleCommitment && !task.completed && (
          <button
            onClick={() => { onToggleCommitment(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] text-left text-fg-primary hover:bg-surface-muted rounded-lg transition-colors"
          >
            <FaStar size={18} className={isCommitted ? 'text-yellow-500' : 'text-fg-secondary shrink-0'} />
            <span className="text-sm">
              {isCommitted ? 'Remove commitment' : 'Commit to complete'}
            </span>
          </button>
        )}

        {/* Toggle Privacy - Only for incomplete tasks */}
        {onTogglePrivacy && !task.completed && (
          <button
            onClick={() => { onTogglePrivacy(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] text-left text-fg-primary hover:bg-surface-muted rounded-lg transition-colors"
          >
            {isPrivate ? (
              <FaEyeSlash size={18} className="text-fg-secondary shrink-0" />
            ) : (
              <FaEye size={18} className="text-primary shrink-0" />
            )}
            <span className="text-sm">
              {isPrivate ? 'Make shared' : 'Make private'}
            </span>
          </button>
        )}

        {/* Delete - destructive, error color */}
        {onDelete && (
          <>
            <div className="border-t border-border-subtle my-1" />
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-3 min-h-[44px] text-left text-error hover:bg-error/10 rounded-lg transition-colors"
            >
              <FaTrash size={18} className="text-error shrink-0" />
              <span className="text-sm font-medium">Delete task</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}
