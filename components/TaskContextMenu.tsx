'use client';

import { useEffect, useRef } from 'react';
import { FaEdit, FaClock, FaCalendarPlus, FaStickyNote, FaStar, FaEye, FaEyeSlash, FaTrash, FaTimes } from 'react-icons/fa';
import { Task } from '@/lib/types';

interface TaskContextMenuProps {
  task: Task;
  isOwnTask: boolean;
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit?: () => void;
  onSetDeadline?: () => void;
  onDefer?: () => void;
  onToggleNotes?: () => void;
  onToggleCommitment?: () => void;
  onTogglePrivacy?: () => void;
  onDelete?: () => void;
  hasNotes?: boolean;
  isCommitted?: boolean;
  isPrivate?: boolean;
}

export default function TaskContextMenu({
  task,
  isOwnTask,
  isOpen,
  position,
  onClose,
  onEdit,
  onSetDeadline,
  onDefer,
  onToggleNotes,
  onToggleCommitment,
  onTogglePrivacy,
  onDelete,
  hasNotes = false,
  isCommitted = false,
  isPrivate = false,
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
      
      {/* Context Menu */}
      <div
        ref={menuRef}
        className="fixed z-[99999] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden min-w-[200px] animate-in fade-in zoom-in duration-200"
        style={{
          left: `${x}px`,
          top: `${y}px`,
        }}
      >
        <div className="py-1">
          {/* Edit Task - Only for incomplete tasks */}
          {onEdit && !task.completed && (
            <button
              onClick={() => {
                onEdit();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FaEdit size={16} className="text-gray-500 dark:text-gray-400" />
              <span className="text-sm font-medium">Edit task</span>
            </button>
          )}

          {/* Set Deadline - Only for incomplete tasks */}
          {onSetDeadline && !task.completed && (
            <button
              onClick={() => {
                onSetDeadline();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FaClock size={16} className={task.dueDate ? 'text-amber-500' : 'text-gray-500 dark:text-gray-400'} />
              <span className="text-sm font-medium">
                {task.dueDate ? 'Change deadline' : 'Set deadline'}
              </span>
            </button>
          )}

          {/* Defer Task - Only for incomplete tasks */}
          {onDefer && !task.completed && (
            <button
              onClick={() => {
                onDefer();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FaCalendarPlus size={16} className="text-amber-500" />
              <span className="text-sm font-medium">Defer task</span>
            </button>
          )}

          {/* Notes */}
          {onToggleNotes && (
            <button
              onClick={() => {
                onToggleNotes();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FaStickyNote size={16} className={hasNotes ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'} />
              <span className="text-sm font-medium">
                {hasNotes ? 'Edit notes' : 'Add notes'}
              </span>
            </button>
          )}

          {/* Toggle Commitment - Only for incomplete tasks */}
          {onToggleCommitment && !task.completed && (
            <button
              onClick={() => {
                onToggleCommitment();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FaStar size={16} className={isCommitted ? 'text-yellow-500' : 'text-gray-500 dark:text-gray-400'} />
              <span className="text-sm font-medium">
                {isCommitted ? 'Remove commitment' : 'Commit to complete'}
              </span>
            </button>
          )}

          {/* Toggle Privacy - Only for incomplete tasks (privacy doesn't matter for completed) */}
          {onTogglePrivacy && !task.completed && (
            <button
              onClick={() => {
                onTogglePrivacy();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isPrivate ? (
                <FaEyeSlash size={16} className="text-gray-500 dark:text-gray-400" />
              ) : (
                <FaEye size={16} className="text-blue-500" />
              )}
              <span className="text-sm font-medium">
                {isPrivate ? 'Make shared' : 'Make private'}
              </span>
            </button>
          )}

          {/* Divider */}
          {onDelete && (
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
          )}

          {/* Delete */}
          {onDelete && (
            <button
              onClick={() => {
                onDelete();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              <FaTrash size={16} />
              <span className="text-sm font-medium">Delete task</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
