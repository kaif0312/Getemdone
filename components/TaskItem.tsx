'use client';

import { useState, useRef, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { TaskWithUser, Attachment, Subtask } from '@/lib/types';
import { FaEye, FaEyeSlash, FaTrash, FaSmile, FaCalendarPlus, FaCheck, FaGripVertical, FaStar, FaComment, FaEdit, FaTimes, FaCheck as FaCheckIcon, FaClock, FaStickyNote, FaChevronDown, FaChevronUp, FaEllipsisV } from 'react-icons/fa';
import EmojiPicker from './EmojiPicker';
import EmojiTagPicker from './EmojiTagPicker';
import Confetti from './Confetti';
import TaskContextMenu from './TaskContextMenu';
import RecurrenceBottomSheet from './RecurrenceBottomSheet';
import AttachmentUpload from './AttachmentUpload';
import AttachmentGallery from './AttachmentGallery';
import SortableSubtaskList from './SortableSubtaskList';
import { playSound } from '@/utils/sounds';
import { isRolledOver, getTodayString, getDateString } from '@/utils/taskFilter';

interface SubtaskRowProps {
  subtask: Subtask;
  isOwnTask: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: (title: string) => void;
  editingSubtaskId: string | null;
  editingSubtaskTitle: string;
  onStartEdit: (id: string, title: string) => void;
  onUpdateEditTitle: (title: string) => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
  dragHandle?: React.ReactNode;
}

function SubtaskRow({
  subtask,
  isOwnTask,
  canEdit,
  onToggle,
  onDelete,
  onEdit,
  editingSubtaskId,
  editingSubtaskTitle,
  onStartEdit,
  onUpdateEditTitle,
  onFinishEdit,
  onCancelEdit,
  dragHandle,
}: SubtaskRowProps) {
  const [isLongPressing, setIsLongPressing] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLongPress = () => {
    if (!canEdit || !isOwnTask) return;
    onStartEdit(subtask.id, subtask.title);
    setIsLongPressing(false);
  };

  const isEditing = editingSubtaskId === subtask.id;

  return (
    <div className="rounded-lg">
      <div className="flex items-center gap-1.5 py-0.5 pl-3 bg-white dark:bg-gray-800"
      >
        {dragHandle}
        <button
          onClick={onToggle}
          disabled={!isOwnTask}
          className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all ${
            subtask.completed
              ? 'bg-green-500 border-green-500'
              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
          } ${!isOwnTask ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
        >
          {subtask.completed && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
        {isEditing ? (
          <input
            type="text"
            value={editingSubtaskTitle}
            onChange={(e) => onUpdateEditTitle(e.target.value)}
            onBlur={() => {
              if (editingSubtaskTitle.trim()) onEdit(editingSubtaskTitle.trim());
              onFinishEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (editingSubtaskTitle.trim()) onEdit(editingSubtaskTitle.trim());
                onFinishEdit();
              } else if (e.key === 'Escape') {
                onCancelEdit();
              }
            }}
            autoFocus
            className="flex-1 px-2 py-1 text-sm bg-gray-50 dark:bg-gray-700 border border-blue-500 rounded min-h-[44px]"
          />
        ) : (
          <div
            onTouchStart={() => {
              if (canEdit && isOwnTask)
                longPressTimerRef.current = setTimeout(handleLongPress, 500);
            }}
            onTouchEnd={() => {
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onMouseDown={() => {
              if (canEdit && isOwnTask)
                longPressTimerRef.current = setTimeout(handleLongPress, 500);
            }}
            onMouseUp={() => {
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            onMouseLeave={() => {
              if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
              }
            }}
            className={`flex-1 text-sm min-h-[36px] flex items-center ${
              subtask.completed
                ? 'line-through text-gray-500 dark:text-gray-400 opacity-70'
                : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {subtask.title}
          </div>
        )}
        {canEdit && isOwnTask && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Delete subtask"
          >
            <FaTimes size={10} />
          </button>
        )}
      </div>
    </div>
  );
}

interface DragHandleProps {
  ref: (element: HTMLElement | null) => void;
  attributes: any;
  listeners: any;
}

interface TaskItemProps {
  task: TaskWithUser;
  isOwnTask: boolean;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onTogglePrivacy: (taskId: string, isPrivate: boolean) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask?: (taskId: string, text: string) => Promise<void>;
  onUpdateDueDate?: (taskId: string, dueDate: number | null) => Promise<void>;
  onUpdateNotes?: (taskId: string, notes: string, existingSubtasks?: Subtask[]) => Promise<void>;
  onToggleCommitment?: (taskId: string, committed: boolean) => void;
  onToggleSkipRollover?: (taskId: string, skipRollover: boolean) => void;
  onAddReaction?: (taskId: string, emoji: string) => void;
  onOpenComments?: (taskId: string) => void;
  onDeferTask?: (taskId: string, deferToDate: string | null) => void;
  onAddAttachment?: (taskId: string, attachment: Attachment) => void;
  onDeleteAttachment?: (taskId: string, attachmentId: string) => void;
  onUpdateTaskTags?: (taskId: string, tags: string[]) => Promise<void>;
  recordRecentlyUsedTag?: (emoji: string) => Promise<void>;
  recentUsedTags?: string[];
  onUpdateTaskSubtasks?: (taskId: string, subtasks: Subtask[]) => Promise<void>;
  onUpdateTaskRecurrence?: (taskId: string, recurrence: import('@/lib/types').Recurrence | null, completedDateStr?: string) => Promise<void>;
  /** When set (e.g. calendar view), show Set recurrence for completed tasks and pass date when converting */
  recurrenceDateContext?: string;
  userStorageUsed?: number;
  userStorageLimit?: number;
  currentUserId?: string;
  dragHandleProps?: DragHandleProps;
}

export default function TaskItem({ 
  task, 
  isOwnTask, 
  onToggleComplete, 
  onTogglePrivacy,
  onDelete,
  onUpdateTask,
  onUpdateDueDate,
  onUpdateNotes,
  onToggleCommitment,
  onToggleSkipRollover,
  onAddReaction,
  onOpenComments,
  onDeferTask,
  onAddAttachment,
  onDeleteAttachment,
  onUpdateTaskTags,
  recordRecentlyUsedTag,
  recentUsedTags = [],
  onUpdateTaskSubtasks,
  onUpdateTaskRecurrence,
  recurrenceDateContext,
  userStorageUsed,
  userStorageLimit,
  currentUserId,
  dragHandleProps
}: TaskItemProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showUnifiedDatePicker, setShowUnifiedDatePicker] = useState(false);
  const [unifiedDatePickerTab, setUnifiedDatePickerTab] = useState<'schedule' | 'deadline'>('schedule');
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeAction, setSwipeAction] = useState<'complete' | 'delete' | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const swipeThreshold = 80; // Threshold for triggering action
  const maxSwipeDistance = 120; // Maximum swipe distance
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [isSaving, setIsSaving] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(task.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isLongPressing, setIsLongPressing] = useState(false); // Track long-press state for animation
  const [showRecurrenceSheet, setShowRecurrenceSheet] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [removingTag, setRemovingTag] = useState<string | null>(null);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [subtaskInputValue, setSubtaskInputValue] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const tagPickerAnchorRef = useRef<HTMLButtonElement>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const subtaskLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const subtaskSectionRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const dueDateInputRef = useRef<HTMLInputElement>(null);
  const scheduleDateRef = useRef<HTMLInputElement>(null);
  const scheduleTimeRef = useRef<HTMLInputElement>(null);
  const unifiedDatePickerRef = useRef<HTMLDivElement>(null);
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const taskItemRef = useRef<HTMLDivElement>(null);

  // Sync editText with task.text when task changes
  useEffect(() => {
    if (!isEditing) {
      setEditText(task.text);
    }
  }, [task.text, isEditing]);

  // Sync notesText with task.notes when task changes
  useEffect(() => {
    if (!isEditingNotes) {
      setNotesText(task.notes || '');
    }
  }, [task.notes, isEditingNotes]);

  // Collapse subtasks when tapping outside the expanded area
  useEffect(() => {
    if (!showSubtasks || !subtaskSectionRef.current) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (subtaskSectionRef.current?.contains(target)) return;
      setShowSubtasks(false);
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler, { passive: true });
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showSubtasks]);

  // Handle notes save
  const handleSaveNotes = async () => {
    if (!onUpdateNotes || isSavingNotes) return;
    
    // Prevent saving if nothing changed
    const trimmedNotes = notesText.trim();
    if (trimmedNotes === (task.notes || '')) {
      setIsEditingNotes(false);
      setShowNotes(false);
      return;
    }
    
    setIsSavingNotes(true);
    try {
      await onUpdateNotes(task.id, trimmedNotes, task.subtasks);
      // Close immediately after save completes - no need to wait
      setIsEditingNotes(false);
      setShowNotes(false);
      if ('vibrate' in navigator) navigator.vibrate(30);
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes. Please try again.');
      // Don't close on error - let user retry
    } finally {
      setIsSavingNotes(false); // Always clear saving state
    }
  };

  const handleCancelNotes = () => {
    setNotesText(task.notes || '');
    setIsEditingNotes(false);
  };

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditing]);

  // Focus textarea when entering notes edit mode
  useEffect(() => {
    if (isEditingNotes && notesTextareaRef.current) {
      notesTextareaRef.current.focus();
    }
  }, [isEditingNotes]);

  // Cleanup long press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Reset swipe state if it gets stuck (safety mechanism)
  useEffect(() => {
    if (isSwiping && swipeOffset !== 0) {
      // If swiping state is active but no recent updates, reset after 1 second
      const timeout = setTimeout(() => {
        setIsSwiping(false);
        setSwipeOffset(0);
        setSwipeAction(null);
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [isSwiping, swipeOffset]);

  // Close due date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showUnifiedDatePicker && unifiedDatePickerRef.current && !unifiedDatePickerRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('.due-date-picker-container') && !target.closest('.unified-date-picker')) {
          setShowUnifiedDatePicker(false);
        }
      }
    };

    if (showUnifiedDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUnifiedDatePicker]);

  const handleToggleComplete = async () => {
    if (!isOwnTask || isEditing) return;
    
    const newCompletedState = !task.completed;
    
    // If marking as complete, show celebration animation
    if (newCompletedState) {
      setShowCompletionAnimation(true);
      playSound(true); // Play success sound
      // Wait for animation to start before updating task
      setTimeout(() => {
        onToggleComplete(task.id, newCompletedState);
      }, 100);
    } else {
      // If uncompleting, just update immediately
      onToggleComplete(task.id, newCompletedState);
    }
  };

  // Long-press detection for mobile - show context menu
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isOwnTask || isEditing) return; // Allow for completed tasks too
    
    // Don't trigger on buttons, inputs, or interactive elements
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' || 
      target.tagName === 'INPUT' || 
      target.tagName === 'TEXTAREA' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('textarea') ||
      target.closest('.swipe-action') ||
      target.closest('[role="button"]')
    ) {
      return;
    }
    
    // DON'T prevent default immediately - allow scrolling to work normally
    // We'll only prevent default if we actually detect a long-press
    
    const touch = e.touches[0];
    if (touch) {
      longPressStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
      
      // Start timer for long-press detection
      longPressTimerRef.current = setTimeout(() => {
        // Only proceed if touch hasn't moved significantly (user is still pressing)
        if (longPressStartRef.current) {
          // Long press detected - now prevent default and show menu
          // Haptic feedback
          if ('vibrate' in navigator) {
            navigator.vibrate([10, 50, 10]); // iOS-style haptic pattern
          }
          
          // Start long-press animation
          setIsLongPressing(true);
          
          setContextMenuPosition({ 
            x: longPressStartRef.current.x, 
            y: longPressStartRef.current.y 
          });
          setShowContextMenu(true);
          
          // Prevent text selection only when long-press is confirmed
          const element = e.currentTarget as HTMLElement;
          element.style.userSelect = 'none';
          element.style.webkitUserSelect = 'none';
          element.style.setProperty('-webkit-touch-callout', 'none');
          
          longPressStartRef.current = null;
        }
      }, 500); // Increased to 500ms to reduce accidental triggers
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Cancel long-press if user lifts finger before timer completes
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // Stop long-press animation if it was active
    if (isLongPressing) {
      setIsLongPressing(false);
      // Restore text selection
      const element = e.currentTarget as HTMLElement;
      element.style.userSelect = '';
      element.style.webkitUserSelect = '';
      element.style.removeProperty('-webkit-touch-callout');
    }
    
    longPressStartRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Cancel long press if user moves finger (scrolling)
    // Use a smaller threshold to detect scrolling early
    if (longPressTimerRef.current && longPressStartRef.current) {
      const touch = e.touches[0];
      if (touch) {
        const moveDistance = Math.sqrt(
          Math.pow(touch.clientX - longPressStartRef.current.x, 2) + 
          Math.pow(touch.clientY - longPressStartRef.current.y, 2)
        );
        // Reduced threshold to 8px to detect scrolling earlier
        // This prevents long-press from triggering during scroll
        if (moveDistance > 8) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
          longPressStartRef.current = null;
          // Stop long-press animation
          setIsLongPressing(false);
          // Restore text selection since long-press was cancelled
          const element = e.currentTarget as HTMLElement;
          element.style.userSelect = '';
          element.style.webkitUserSelect = '';
          element.style.removeProperty('-webkit-touch-callout');
        }
      }
    }
    
    // Also cancel if long-press animation is active and user moves
    if (isLongPressing && longPressStartRef.current) {
      const touch = e.touches[0];
      if (touch) {
        const moveDistance = Math.sqrt(
          Math.pow(touch.clientX - longPressStartRef.current.x, 2) + 
          Math.pow(touch.clientY - longPressStartRef.current.y, 2)
        );
        if (moveDistance > 10) {
          setIsLongPressing(false);
          setShowContextMenu(false);
          const element = e.currentTarget as HTMLElement;
          element.style.userSelect = '';
          element.style.webkitUserSelect = '';
          element.style.removeProperty('-webkit-touch-callout');
        }
      }
    }
  };

  // Desktop: Right-click for context menu, double-click to edit
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isOwnTask) return; // Allow for completed tasks too
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleDoubleClick = () => {
    if (!isOwnTask || task.completed || isEditing || !onUpdateTask) return;
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!onUpdateTask || isSaving) return;
    
    const trimmedText = editText.trim();
    if (!trimmedText || trimmedText === task.text) {
      setIsEditing(false);
      setEditText(task.text);
      return;
    }

    setIsSaving(true);
    try {
      await onUpdateTask(task.id, trimmedText);
      setIsEditing(false);
      playSound(true);
      if ('vibrate' in navigator) {
        navigator.vibrate(20);
      }
    } catch (error) {
      console.error('Failed to update task:', error);
      alert('Failed to update task. Please try again.');
      setEditText(task.text);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditText(task.text);
  };

  // Auto-save on blur (mobile-friendly)
  const handleBlur = () => {
    // Small delay to allow save button click to register
    setTimeout(() => {
      if (isEditing) {
        handleSaveEdit();
      }
    }, 150);
  };
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
  };

  const formatDueDate = (dueDate: number) => {
    const now = Date.now();
    const diff = dueDate - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    const minutes = Math.floor(diff / (1000 * 60));

    if (diff < 0) {
      // Overdue
      if (Math.abs(days) > 0) {
        return `Overdue by ${Math.abs(days)} day${Math.abs(days) > 1 ? 's' : ''}`;
      } else if (Math.abs(hours) > 0) {
        return `Overdue by ${Math.abs(hours)} hour${Math.abs(hours) > 1 ? 's' : ''}`;
      } else {
        return 'Overdue';
      }
    } else if (minutes < 60) {
      return `Due in ${minutes} min${minutes !== 1 ? 's' : ''}`;
    } else if (hours < 24) {
      return `Due in ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (days === 1) {
      return 'Due tomorrow';
    } else if (days < 7) {
      return `Due in ${days} days`;
    } else {
      return new Date(dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getDueDateColor = (dueDate: number) => {
    const now = Date.now();
    const diff = dueDate - now;
    const hours = diff / (1000 * 60 * 60);

    if (diff < 0) {
      return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
    } else if (hours < 2) {
      return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800';
    } else if (hours < 24) {
      return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
    } else {
      return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  const getTomorrowDateTime = (): string => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T${String(tomorrow.getHours()).padStart(2, '0')}:${String(tomorrow.getMinutes()).padStart(2, '0')}`;
  };

  const getLaterTodayDateTime = (): string => {
    const later = new Date();
    later.setHours(later.getHours() + 1);
    later.setMinutes(Math.ceil(later.getMinutes() / 15) * 15, 0, 0);
    return `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-${String(later.getDate()).padStart(2, '0')}T${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
  };

  const getMinDateTime = (): string => {
    const now = new Date();
    now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0);
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const handleOpenUnifiedDatePicker = () => {
    if (task.deferredTo && !task.dueDate) {
      setUnifiedDatePickerTab('schedule');
    } else if (task.dueDate) {
      setUnifiedDatePickerTab('deadline');
    } else {
      setUnifiedDatePickerTab('schedule');
    }
    setShowUnifiedDatePicker(true);
  };

  // Swipe handlers with smooth animations and undo support
  const swipeHandlers = useSwipeable({
    onSwiping: (eventData) => {
      if (!isOwnTask || isEditing) return;
      
      const deltaX = eventData.deltaX;
      const deltaY = eventData.deltaY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      
      // Only activate swipe if horizontal movement is significantly more than vertical
      // This prevents interference with vertical scrolling
      if (absY > absX * 0.5) {
        // More vertical than horizontal - allow scrolling, don't swipe
        if (isSwiping) {
          setIsSwiping(false);
          setSwipeOffset(0);
          setSwipeAction(null);
        }
        return;
      }
      
      // Mark as swiping
      if (!isSwiping) {
        setIsSwiping(true);
      }
      
      // Prevent default to stop screen from moving during horizontal swipe
      if (eventData.event && absX > absY) {
        eventData.event.preventDefault();
      }
      
      // Calculate swipe distance with resistance (easing) after threshold
      let swipeDistance = deltaX;
      if (absX > maxSwipeDistance) {
        // Add resistance - make it harder to swipe beyond max
        const excess = absX - maxSwipeDistance;
        swipeDistance = deltaX > 0 
          ? maxSwipeDistance + excess * 0.3 
          : -maxSwipeDistance - excess * 0.3;
      }
      
      // Only allow swipe if not already completed (for complete action) or if completed (for delete)
      if (deltaX > 0 && !task.completed) {
        // Swipe right - Complete
        setSwipeOffset(swipeDistance);
        setSwipeAction(absX > swipeThreshold ? 'complete' : null);
      } else if (deltaX < 0) {
        // Swipe left - Delete
        setSwipeOffset(swipeDistance);
        setSwipeAction(absX > swipeThreshold ? 'delete' : null);
      } else {
        // Swipe back towards center - allow undo
        setSwipeOffset(swipeDistance);
        setSwipeAction(null);
      }
    },
    onSwiped: (eventData) => {
      if (!isOwnTask) {
        // Always reset if not own task
        setIsSwiping(false);
        setSwipeOffset(0);
        setSwipeAction(null);
        return;
      }
      
      const absX = Math.abs(eventData.deltaX);
      const absY = Math.abs(eventData.deltaY);
      
      // Only trigger action if it was clearly a horizontal swipe
      if (absY > absX * 0.5) {
        // Was more vertical than horizontal - cancel swipe and reset
        setIsSwiping(false);
        setSwipeOffset(0);
        setSwipeAction(null);
        return;
      }
      
      // Check if swipe exceeded threshold
      if (absX > swipeThreshold) {
        if (eventData.deltaX > 0 && !task.completed) {
          // Complete task
          handleToggleComplete();
          if ('vibrate' in navigator) {
            navigator.vibrate(50);
          }
        } else if (eventData.deltaX < 0) {
          // Delete task
          onDelete(task.id);
          if ('vibrate' in navigator) {
            navigator.vibrate([30, 50]);
          }
        }
      }
      
      // ALWAYS reset swipe state after any swipe ends (whether action triggered or not)
      // Use setTimeout to ensure state updates happen after any action handlers
      setTimeout(() => {
        setIsSwiping(false);
        setSwipeOffset(0);
        setSwipeAction(null);
      }, 0);
    },
    onSwipedDown: () => {
      // Cancel swipe on vertical scroll
      if (isSwiping) {
        setIsSwiping(false);
        setSwipeOffset(0);
        setSwipeAction(null);
      }
    },
    trackMouse: false, // Disable mouse swiping on desktop to avoid conflicts with drag-to-reorder
    trackTouch: true,
    preventScrollOnSwipe: false, // Allow vertical scroll to work
    delta: 10, // Reduced threshold for more responsive swiping
    swipeDuration: 600, // Increased duration for smoother feel
    touchEventOptions: { passive: false }, // Allow preventDefault to work
  });

  return (
    <>
      {/* Completion Animations */}
      {showCompletionAnimation && (
        <Confetti onComplete={() => setShowCompletionAnimation(false)} />
      )}

      <div className="relative rounded-lg" style={{ overflow: 'visible' }}>
        {/* Swipe Action Background */}
        {swipeOffset !== 0 && isOwnTask && (
          <div className="absolute inset-0 flex items-center justify-between px-6 pointer-events-none">
            {swipeOffset > 0 && (
              <div className={`flex items-center gap-2 transition-all duration-200 ${
                swipeAction === 'complete' ? 'scale-110' : 'scale-100'
              }`}>
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
                  <FaCheck className="text-white" size={18} />
                </div>
                <span className="text-green-600 dark:text-green-400 font-semibold">Complete</span>
              </div>
            )}
            {swipeOffset < 0 && (
              <div className={`ml-auto flex items-center gap-2 transition-all duration-200 ${
                swipeAction === 'delete' ? 'scale-110' : 'scale-100'
              }`}>
                <span className="text-red-600 dark:text-red-400 font-semibold">Delete</span>
                <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
                  <FaTrash className="text-white" size={16} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Task Item with Swipe */}
        <div 
          {...(isOwnTask && !isEditing ? swipeHandlers : {})}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchMove}
          onContextMenu={handleContextMenu}
          onMouseDown={(e) => {
            // Prevent text selection on mouse down (for desktop)
            if (isOwnTask && !isEditing && e.button === 0) {
              // Only prevent for left click, allow right click for context menu
              const target = e.target as HTMLElement;
              if (!target.closest('button') && !target.closest('input') && !target.closest('textarea')) {
                e.preventDefault();
              }
            }
          }}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)', // Smooth spring-back animation
            touchAction: 'pan-y pinch-zoom', // Allow vertical scrolling and pinch zoom
            willChange: isSwiping ? 'transform' : 'auto', // Optimize for smooth animations
          } as React.CSSProperties}
          className={`group bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm border transition-all duration-300 hover:shadow-md select-none task-item-touchable ${
            task.completed 
              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 shadow-green-100' 
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
          } ${isAnimatingOut ? 'animate-task-complete' : ''} ${
            swipeAction === 'complete' ? 'border-green-400 dark:border-green-600 bg-green-100 dark:bg-green-900/40' : ''
          } ${
            swipeAction === 'delete' ? 'border-red-400 dark:border-red-600 bg-red-100 dark:bg-red-900/40' : ''
          } ${
            isEditing ? 'border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20' : ''
          } ${
            isLongPressing ? 'ring-2 ring-blue-500 dark:ring-blue-400 ring-offset-2 bg-blue-50 dark:bg-blue-900/30 scale-[0.98]' : ''
          }`}
        >
        <div className="flex items-start gap-1">
          {/* Drag Handle - Ultra-compact */}
          {dragHandleProps && (
            <button
              ref={dragHandleProps.ref}
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              className="flex-shrink-0 p-1 -ml-1 touch-none cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-center"
              title="Drag to reorder"
              style={{ touchAction: 'none', minWidth: '28px', minHeight: '28px' }}
            >
              <FaGripVertical size={14} />
            </button>
          )}

          {/* Checkbox - Compact */}
          <button
            onClick={handleToggleComplete}
            disabled={!isOwnTask}
            className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all duration-200 ${
              task.completed 
                ? 'bg-green-500 border-green-500 shadow-sm' 
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-green-400 dark:hover:border-green-500'
            } ${!isOwnTask ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
            style={{ marginTop: '2px' }}
          >
            {task.completed && (
              <svg 
                className="w-2.5 h-2.5 text-white" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0">
            <span className={`font-semibold text-[10px] ${
              isOwnTask ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
            }`} suppressHydrationWarning>
              {task.userName}
            </span>
            {task.isPrivate && isOwnTask && (
              <span className="text-[9px] text-gray-500 flex items-center gap-0.5">
                <FaEyeSlash size={8} /> Private
              </span>
            )}
          </div>
          
          <div 
            className="flex items-start gap-1"
            onDoubleClick={handleDoubleClick}
          >
            {task.committed && (
              <FaStar 
                className="text-yellow-500 dark:text-yellow-400 mt-0.5 flex-shrink-0 z-10" 
                size={12} 
                title="Committed Task - Must Complete Today!" 
                style={{ minWidth: '12px', minHeight: '12px' }}
              />
            )}
            {task.recurrence && (
              <span className="mt-0.5 flex-shrink-0 text-sm" title="Recurring task">🔁</span>
            )}
            {isEditing ? (
              <div className="flex-1 flex items-center gap-1.5">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={handleBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      handleCancelEdit();
                    }
                  }}
                  maxLength={500}
                  disabled={isSaving}
                  className="flex-1 px-2 py-1.5 bg-gray-50 dark:bg-gray-700 border-2 border-blue-500 dark:border-blue-400 rounded text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving || !editText.trim() || editText.trim() === task.text}
                    className="p-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
                    title="Save"
                  >
                    {isSaving ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FaCheckIcon size={11} />
                    )}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="p-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
                    title="Cancel"
                  >
                    <FaTimes size={11} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p 
                  className={`text-sm leading-snug ${
                    task.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'
                  } ${isOwnTask && !task.completed && onUpdateTask ? 'cursor-text select-text touch-none' : ''}`} 
                  suppressHydrationWarning
                  title={isOwnTask && !task.completed && onUpdateTask ? 'Long-press or double-click to edit' : undefined}
                >
                  {task.text}
                </p>
                {/* Tags + progress chip - compact row below title */}
                {((task.tags?.length ?? 0) > 0 || (task.subtasks?.length ?? 0) > 0 || (isOwnTask && onUpdateTaskTags)) && (
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {(task.tags || []).map((emoji) =>
                      isOwnTask && onUpdateTaskTags ? (
                        <button
                          key={emoji}
                          onClick={async (e) => {
                            e.stopPropagation();
                            setRemovingTag(emoji);
                            await new Promise((r) => setTimeout(r, 150));
                            const next = (task.tags || []).filter((t) => t !== emoji);
                            await onUpdateTaskTags(task.id, next);
                            setRemovingTag(null);
                            if ('vibrate' in navigator) navigator.vibrate(30);
                          }}
                          className={`w-7 h-7 flex items-center justify-center text-sm rounded-md transition-all duration-150 ${
                            removingTag === emoji
                              ? 'scale-75 opacity-0'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 bg-gray-100/50 dark:bg-gray-700/50'
                          }`}
                        >
                          {emoji}
                        </button>
                      ) : (
                        <span
                          key={emoji}
                          className="w-7 h-7 flex items-center justify-center text-sm bg-gray-100/50 dark:bg-gray-700/50 rounded-md"
                        >
                          {emoji}
                        </span>
                      )
                    )}
                    {isOwnTask && onUpdateTaskTags && (task.tags?.length ?? 0) < 5 && (
                      <>
                        <button
                          ref={tagPickerAnchorRef}
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowTagPicker(true);
                          }}
                          className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm"
                        >
                          +
                        </button>
                        <EmojiTagPicker
                      anchorRef={tagPickerAnchorRef}
                      isOpen={showTagPicker}
                      onClose={() => setShowTagPicker(false)}
                      onSelect={async (emoji) => {
                        const current = task.tags || [];
                        if (current.includes(emoji) || current.length >= 5) return;
                        const next = [...current, emoji];
                        await onUpdateTaskTags(task.id, next);
                        await recordRecentlyUsedTag?.(emoji);
                        setShowTagPicker(false);
                        if ('vibrate' in navigator) navigator.vibrate(30);
                      }}
                      recentlyUsed={recentUsedTags}
                      currentTags={task.tags || []}
                      maxTags={5}
                    />
                      </>
                    )}
                    {(task.subtasks?.length ?? 0) > 0 && (
                      <button
                        onClick={() => setShowSubtasks((s) => !s)}
                        className="text-[9px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 tabular-nums"
                      >
                        {task.subtasks!.filter((s) => s.completed).length}/{task.subtasks!.length}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Badges row - Ultra-compact inline layout */}
          {(task.deferredTo || task.dueDate) && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {/* Only show scheduled/deferred badge if there's no deadline */}
              {task.deferredTo && !task.dueDate && (() => {
                // All tasks with deferredTo shown on today's list use "Scheduled for" (new or existing)
                let displayText: string;
                try {
                  const dateTime = task.deferredTo.includes('T') 
                    ? new Date(task.deferredTo) 
                    : new Date(task.deferredTo + 'T00:00:00');
                  const hasTime = task.deferredTo.includes('T') && !task.deferredTo.endsWith('T00:00') && !task.deferredTo.endsWith('T00:00:00');
                  const today = new Date();
                  const isToday = dateTime.toDateString() === today.toDateString();
                  
                  if (hasTime && isToday) {
                    displayText = dateTime.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    });
                  } else if (hasTime) {
                    displayText = dateTime.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    });
                  } else {
                    displayText = dateTime.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric'
                    });
                  }
                } catch {
                  displayText = task.deferredTo || '';
                }
                
                const badgeClass = `inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300`;
                const badgeContent = (
                  <>
                    <FaCalendarPlus size={8} />
                    <span>
                      Scheduled for {displayText}
                    </span>
                  </>
                );
                if (isOwnTask && onDeferTask) {
                  return (
                    <button
                      type="button"
                      onClick={() => handleOpenUnifiedDatePicker()}
                      className={`${badgeClass} transition-colors hover:opacity-80 due-date-picker-container`}
                      title="Tap to change schedule"
                    >
                      {badgeContent}
                    </button>
                  );
                }
                return <div className={badgeClass}>{badgeContent}</div>;
              })()}
              
              {/* Due Date Indicator - Ultra-compact */}
              {task.dueDate && !task.completed && isOwnTask && onUpdateDueDate ? (
                <div className="relative due-date-picker-container inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => (showUnifiedDatePicker ? setShowUnifiedDatePicker(false) : handleOpenUnifiedDatePicker())}
                    className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded-full border transition-colors hover:opacity-80 ${getDueDateColor(task.dueDate)}`}
                    title="Tap to change deadline"
                  >
                    <FaClock size={8} />
                    <span className="font-medium">{formatDueDate(task.dueDate)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (onUpdateDueDate) {
                        await onUpdateDueDate(task.id, null);
                        setShowUnifiedDatePicker(false);
                      }
                    }}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    title="Remove deadline"
                  >
                    <FaTimes size={7} className="text-gray-500 dark:text-gray-400" />
                  </button>
                </div>
              ) : task.dueDate && !task.completed ? (
                <div className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded-full border ${getDueDateColor(task.dueDate)}`}>
                  <FaClock size={8} />
                  <span className="font-medium">{formatDueDate(task.dueDate)}</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Expandable Notes - Ultra-compact */}
          {isOwnTask && onUpdateNotes && (
            <div className="mt-0.5">
              {/* Notes Toggle Button - Only show if notes exist or user wants to add */}
              {(task.notes || showNotes) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => {
                      setShowNotes(!showNotes);
                      if (!showNotes && !task.notes) setIsEditingNotes(true);
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded transition-colors"
                  >
                    <FaStickyNote size={8} className={task.notes ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400'} />
                    <span>{task.notes ? 'Notes' : 'Add notes'}</span>
                    {showNotes ? <FaChevronUp size={6} /> : <FaChevronDown size={6} />}
                  </button>
                  {!task.completed && onUpdateTaskSubtasks && (
                    <button
                      onClick={() => { setShowSubtasks(true); setTimeout(() => subtaskInputRef.current?.focus(), 100); }}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                    >
                      <span>+ Subtask</span>
                    </button>
                  )}
                </div>
              )}

              {/* Expanded Notes Content */}
              {showNotes && (
                <div className="mt-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 border border-gray-200 dark:border-gray-600">
                  {isEditingNotes ? (
                    <div className="space-y-1.5">
                      <textarea
                        ref={notesTextareaRef}
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        onKeyDown={(e) => {
                          // Save on Ctrl+Enter or Cmd+Enter
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveNotes();
                          }
                          // Close on Escape
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            handleCancelNotes();
                          }
                        }}
                        placeholder="Add notes. Start a line with - for subtasks"
                        rows={4}
                        maxLength={1000}
                        className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 resize-none"
                        autoFocus
                        disabled={isSavingNotes}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {notesText.length}/1000
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleCancelNotes}
                            disabled={isSavingNotes}
                            className="px-3 py-1.5 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveNotes}
                            disabled={isSavingNotes || notesText.trim() === (task.notes || '')}
                            className="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
                          >
                            {isSavingNotes ? (
                              <span className="flex items-center gap-1">
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Saving...
                              </span>
                            ) : (
                              'Save'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                        {task.notes || (
                          <span className="text-gray-400 dark:text-gray-500 italic">No notes yet</span>
                        )}
                      </div>
                      <button
                        onClick={() => setIsEditingNotes(true)}
                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                      >
                        <FaEdit size={10} />
                        <span>{task.notes ? 'Edit' : 'Add notes'}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Add Notes Button - Show if no notes and not expanded */}
              {!task.notes && !showNotes && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => { setShowNotes(true); setIsEditingNotes(true); }}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                  >
                    <FaStickyNote size={8} />
                    <span>Notes</span>
                  </button>
                  {!task.completed && onUpdateTaskSubtasks && (
                    <button
                      onClick={() => { setShowSubtasks(true); setTimeout(() => subtaskInputRef.current?.focus(), 100); }}
                      className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                    >
                      <span>+ Subtask</span>
                    </button>
                  )}
                  
                  {/* Inline Attachment Upload - Show only if no attachments yet */}
                  {isOwnTask && !task.completed && onAddAttachment && (!task.attachments || task.attachments.length === 0) && (
                    <AttachmentUpload
                      taskId={task.id}
                      currentAttachments={task.attachments || []}
                      onUploadComplete={(attachment) => onAddAttachment(task.id, attachment)}
                      maxAttachments={3}
                      userStorageUsed={userStorageUsed}
                      userStorageLimit={userStorageLimit}
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Attachments & Upload - Show when attachments exist or notes are visible */}
          {(isOwnTask && task.attachments && task.attachments.length > 0) && (
            <div className="mt-1 space-y-1">
              {/* Existing Attachments */}
              <AttachmentGallery
                attachments={task.attachments}
                onDelete={isOwnTask && onDeleteAttachment ? (attachmentId) => onDeleteAttachment(task.id, attachmentId) : undefined}
                canDelete={isOwnTask && !task.completed}
                compact={true}
              />

              {/* Attachment Upload Button - Show when attachments exist */}
              {isOwnTask && !task.completed && onAddAttachment && (
                <AttachmentUpload
                  taskId={task.id}
                  currentAttachments={task.attachments || []}
                  onUploadComplete={(attachment) => onAddAttachment(task.id, attachment)}
                  maxAttachments={3}
                  userStorageUsed={userStorageUsed}
                  userStorageLimit={userStorageLimit}
                />
              )}
            </div>
          )}

          {/* Expanded subtasks - inline with 200ms animation. Own: show when expanded or adding first. Friend: show when expanded and has subtasks. */}
          {((isOwnTask && onUpdateTaskSubtasks && (showSubtasks || (task.subtasks?.length ?? 0) > 0)) ||
            (!isOwnTask && showSubtasks && (task.subtasks?.length ?? 0) > 0)) && (
            <div
              ref={subtaskSectionRef}
              className={`overflow-hidden transition-[max-height] duration-200 ease-out ${
                showSubtasks ? 'max-h-[500px]' : 'max-h-0'
              }`}
            >
              <div
                className="mt-1 pt-1 border-t border-gray-200/80 dark:border-gray-600/80"
                onClick={(e) => e.stopPropagation()}
              >
                <SortableSubtaskList
                  taskId={task.id}
                  subtasks={task.subtasks || []}
                  isOwnTask={isOwnTask}
                  taskCompleted={!!task.completed}
                  onReorder={(newSubtasks) => onUpdateTaskSubtasks?.(task.id, newSubtasks)}
                  onToggle={(st) => {
                    const next = (task.subtasks || []).map((s) =>
                      s.id === st.id ? { ...s, completed: !s.completed } : s
                    );
                    onUpdateTaskSubtasks?.(task.id, next);
                  }}
                  onDelete={(st) => {
                    const next = (task.subtasks || []).filter((s) => s.id !== st.id);
                    onUpdateTaskSubtasks?.(task.id, next);
                  }}
                  onEdit={(st, title) => {
                    const next = (task.subtasks || []).map((s) =>
                      s.id === st.id ? { ...s, title } : s
                    );
                    onUpdateTaskSubtasks?.(task.id, next);
                  }}
                  editingSubtaskId={editingSubtaskId}
                  editingSubtaskTitle={editingSubtaskTitle}
                  onStartEdit={(id, title) => {
                    setEditingSubtaskId(id);
                    setEditingSubtaskTitle(title);
                  }}
                  onUpdateEditTitle={setEditingSubtaskTitle}
                  onFinishEdit={(st) => {
                    if (editingSubtaskId === st.id && editingSubtaskTitle.trim()) {
                      const next = (task.subtasks || []).map((s) =>
                        s.id === st.id ? { ...s, title: editingSubtaskTitle.trim() } : s
                      );
                      onUpdateTaskSubtasks?.(task.id, next);
                    }
                    setEditingSubtaskId(null);
                    setEditingSubtaskTitle('');
                  }}
                  onCancelEdit={() => {
                    setEditingSubtaskId(null);
                    setEditingSubtaskTitle('');
                  }}
                  renderSubtaskRow={(st, dragHandle) => (
                    <SubtaskRow
                      subtask={st}
                      isOwnTask={isOwnTask}
                      canEdit={isOwnTask && !task.completed}
                      onToggle={() => {
                        const next = (task.subtasks || []).map((s) =>
                          s.id === st.id ? { ...s, completed: !s.completed } : s
                        );
                        onUpdateTaskSubtasks?.(task.id, next);
                      }}
                      onDelete={() => {
                        const next = (task.subtasks || []).filter((s) => s.id !== st.id);
                        onUpdateTaskSubtasks?.(task.id, next);
                      }}
                      onEdit={(title) => {
                        const next = (task.subtasks || []).map((s) =>
                          s.id === st.id ? { ...s, title } : s
                        );
                        onUpdateTaskSubtasks?.(task.id, next);
                      }}
                      editingSubtaskId={editingSubtaskId}
                      editingSubtaskTitle={editingSubtaskTitle}
                      onStartEdit={(id, title) => {
                        setEditingSubtaskId(id);
                        setEditingSubtaskTitle(title);
                      }}
                      onUpdateEditTitle={setEditingSubtaskTitle}
                      onFinishEdit={() => {
                        if (editingSubtaskId === st.id && editingSubtaskTitle.trim()) {
                          const next = (task.subtasks || []).map((s) =>
                            s.id === st.id ? { ...s, title: editingSubtaskTitle.trim() } : s
                          );
                          onUpdateTaskSubtasks?.(task.id, next);
                        }
                        setEditingSubtaskId(null);
                        setEditingSubtaskTitle('');
                      }}
                      onCancelEdit={() => {
                        setEditingSubtaskId(null);
                        setEditingSubtaskTitle('');
                      }}
                      dragHandle={dragHandle}
                    />
                  )}
                />
                {isOwnTask && onUpdateTaskSubtasks && (
                <div className="pl-4">
                  <input
                    ref={subtaskInputRef}
                    type="text"
                    value={subtaskInputValue}
                    onChange={(e) => setSubtaskInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const t = subtaskInputValue.trim();
                        if (t) {
                          const next = [
                            ...(task.subtasks || []),
                            { id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, title: t, completed: false },
                          ];
                          onUpdateTaskSubtasks?.(task.id, next);
                          setSubtaskInputValue('');
                        } else {
                          subtaskInputRef.current?.blur();
                        }
                      }
                    }}
                    onBlur={() => {
                      const t = subtaskInputValue.trim();
                      if (t) {
                        const next = [
                          ...(task.subtasks || []),
                          { id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, title: t, completed: false },
                        ];
                        onUpdateTaskSubtasks?.(task.id, next);
                        setSubtaskInputValue('');
                      }
                    }}
                    placeholder="Add a step..."
                    className="w-full px-2 py-1 text-[11px] text-gray-900 dark:text-gray-100 bg-transparent border-0 border-b border-gray-200 dark:border-gray-600 rounded-none focus:outline-none focus:ring-0 focus:border-blue-500 dark:focus:border-blue-400 min-h-[32px]"
                  />
                </div>
                )}
              </div>
            </div>
          )}
          
          {/* Metadata row - Ultra-compact */}
          <div className="flex items-center gap-1 mt-0.5 flex-wrap text-[9px]">
            <span className="text-gray-500 dark:text-gray-400" suppressHydrationWarning>
              {formatTime(task.createdAt)}
            </span>
            {task.completed && task.completedAt && (
              <span className="text-green-600 font-medium" suppressHydrationWarning>
                ✓ {formatTime(task.completedAt)}
              </span>
            )}
            
            {/* Reactions Display - Ultra-compact */}
            {task.reactions && task.reactions.length > 0 && (
              <div className="flex items-center gap-0.5">
                {Object.entries(
                  task.reactions.reduce((acc, r) => {
                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([emoji, count]) => (
                  <button
                    key={emoji}
                    onClick={() => onAddReaction?.(task.id, emoji)}
                    className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[9px] transition-colors ${
                      task.reactions?.some(r => r.userId === currentUserId && r.emoji === emoji)
                        ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'
                    }`}
                    title={task.reactions
                      ?.filter(r => r.emoji === emoji)
                      .map(r => r.userName)
                      .join(', ')}
                  >
                    <span className="text-xs">{emoji}</span>
                    {count > 1 && <span className="text-gray-600 dark:text-gray-300 font-medium">{count}</span>}
                  </button>
                ))}
              </div>
            )}
            
            {/* Comment Button - compact */}
            {onOpenComments && (
              <button
                onClick={() => onOpenComments(task.id)}
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                title="View comments"
              >
                <FaComment size={8} className="opacity-80" />
                {task.comments && task.comments.length > 0 && (
                  <span className="text-[9px] font-medium tabular-nums">
                    {task.comments.length}
                  </span>
                )}
              </button>
            )}
            
            {/* Add Reaction Button - Ultra-compact for completed tasks */}
            {task.completed && onAddReaction && (
              <div className="relative z-[10000]">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 transition-colors"
                  title="Add reaction"
                >
                  <FaSmile size={9} className="text-gray-600 dark:text-gray-300" />
                </button>
                
                {showEmojiPicker && (
                  <EmojiPicker
                    onSelect={(emoji) => onAddReaction(task.id, emoji)}
                    onClose={() => setShowEmojiPicker(false)}
                    position="bottom"
                  />
                )}
              </div>
            )}
          </div>

          {/* Progress bar - 3px at bottom, only when subtasks exist */}
          {(task.subtasks?.length ?? 0) > 0 && (
            <button
              onClick={() => setShowSubtasks((s) => !s)}
              className="w-full mt-1 min-h-[32px] flex items-end py-1"
            >
              <div className="w-full h-[3px] bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-[#4ade80] dark:bg-emerald-400 transition-all duration-200 ease-out"
                  style={{
                    width: `${((task.subtasks?.filter((s) => s.completed).length ?? 0) / (task.subtasks?.length ?? 1)) * 100}%`,
                  }}
                />
              </div>
            </button>
          )}
        </div>

        {/* Context Menu Button */}
        {isOwnTask && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenuPosition({ x: e.clientX, y: e.clientY });
              setShowContextMenu(true);
              if ('vibrate' in navigator) navigator.vibrate(10);
            }}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
            title="More options"
          >
            <FaEllipsisV size={10} />
          </button>
        )}
        </div>
      </div>
      </div>

      {/* Unified Schedule & Deadline Picker - Like TaskInput */}
      {showUnifiedDatePicker && isOwnTask && !task.completed && (onUpdateDueDate || onDeferTask) && (
        <>
          <div 
            className="fixed inset-0 z-[99998] bg-black/50 backdrop-blur-sm" 
            onClick={() => setShowUnifiedDatePicker(false)}
          />
          <div className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none p-4">
            <div ref={unifiedDatePickerRef} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl p-4 w-full max-w-[90vw] sm:min-w-[320px] sm:max-w-md pointer-events-auto animate-in fade-in zoom-in duration-200 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-semibold text-gray-700 dark:text-gray-300">
                  Schedule & Deadline
                </span>
                <button
                  type="button"
                  onClick={() => setShowUnifiedDatePicker(false)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                  title="Close"
                >
                  <FaTimes size={14} className="text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              {/* Tabs */}
              <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setUnifiedDatePickerTab('schedule')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    unifiedDatePickerTab === 'schedule'
                      ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setUnifiedDatePickerTab('deadline')}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    unifiedDatePickerTab === 'deadline'
                      ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-600 dark:border-amber-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  Deadline
                </button>
              </div>
              {/* Schedule Tab */}
              {unifiedDatePickerTab === 'schedule' && onDeferTask && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Schedule Task</span>
                    {task.deferredTo && (
                      <button
                        type="button"
                        onClick={async () => {
                          await onDeferTask(task.id, null);
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                        title="Remove schedule"
                      >
                        <FaTimes size={12} className="text-gray-500 dark:text-gray-400" />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeferTask(task.id, getLaterTodayDateTime());
                        setShowUnifiedDatePicker(false);
                      }}
                      className="flex-1 px-3 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-lg font-medium text-sm"
                    >
                      Later Today
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await onDeferTask(task.id, getTomorrowDateTime());
                        setShowUnifiedDatePicker(false);
                      }}
                      className="flex-1 px-3 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg font-medium text-sm"
                    >
                      Tomorrow
                    </button>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center">or choose date (time optional)</div>
                  <div className="unified-date-picker space-y-2">
                    <input
                      ref={scheduleDateRef}
                      type="date"
                      min={getTodayString()}
                      defaultValue={task.deferredTo ? (task.deferredTo.includes('T') ? task.deferredTo.split('T')[0] : task.deferredTo) : ''}
                      className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      onChange={async () => {
                        const dateVal = scheduleDateRef.current?.value;
                        const timeVal = scheduleTimeRef.current?.value;
                        if (dateVal && onDeferTask) {
                          const value = timeVal ? `${dateVal}T${timeVal}` : dateVal;
                          await onDeferTask(task.id, value);
                        }
                      }}
                    />
                    <input
                      ref={scheduleTimeRef}
                      type="time"
                      defaultValue={task.deferredTo && task.deferredTo.includes('T') ? task.deferredTo.split('T')[1]?.slice(0, 5) : ''}
                      className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      onChange={async () => {
                        const dateVal = scheduleDateRef.current?.value;
                        const timeVal = scheduleTimeRef.current?.value;
                        if (dateVal && onDeferTask) {
                          const value = timeVal ? `${dateVal}T${timeVal}` : dateVal;
                          await onDeferTask(task.id, value);
                        }
                      }}
                    />
                  </div>
                </div>
              )}
              {/* Deadline Tab */}
              {unifiedDatePickerTab === 'deadline' && onUpdateDueDate && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Deadline</span>
                    {task.dueDate && (
                      <button
                        type="button"
                        onClick={async () => {
                          await onUpdateDueDate(task.id, null);
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                        title="Remove deadline"
                      >
                        <FaTimes size={12} className="text-gray-500 dark:text-gray-400" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={dueDateInputRef}
                    type="datetime-local"
                    min={new Date().toISOString().slice(0, 16)}
                    defaultValue={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ''}
                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                    onChange={async (e) => {
                      const value = e.target.value;
                      if (value && onUpdateDueDate) {
                        const date = new Date(value);
                        await onUpdateDueDate(task.id, date.getTime());
                      }
                    }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowUnifiedDatePicker(false)}
                className="w-full mt-4 px-4 py-2.5 text-base bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes task-complete {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          25% {
            transform: scale(1.02) rotate(1deg);
          }
          50% {
            transform: scale(1.05) rotate(-1deg);
            opacity: 0.95;
          }
          75% {
            transform: scale(1.02) rotate(0.5deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        @keyframes checkmark-draw {
          0% {
            stroke-dasharray: 0, 100;
          }
          100% {
            stroke-dasharray: 100, 100;
          }
        }

        @keyframes glow-pulse {
          0%, 100% {
            box-shadow: 0 0 5px rgba(34, 197, 94, 0.3);
          }
          50% {
            box-shadow: 0 0 20px rgba(34, 197, 94, 0.6), 0 0 30px rgba(34, 197, 94, 0.4);
          }
        }

        .animate-task-complete {
          animation: task-complete 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .animate-checkmark-draw {
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
          animation: checkmark-draw 0.4s ease-in-out forwards;
        }
      `}</style>

      {/* Context Menu - Long-press or right-click */}
      <TaskContextMenu
        task={task}
        isOwnTask={isOwnTask}
        isOpen={showContextMenu}
        position={contextMenuPosition}
        onClose={() => setShowContextMenu(false)}
        onEdit={() => {
          if (onUpdateTask && !task.completed) {
            setIsEditing(true);
          }
        }}
        onSetDeadline={() => {
          if ((onUpdateDueDate || onDeferTask) && !task.completed) {
            handleOpenUnifiedDatePicker();
          }
        }}
        onSetRecurrence={() => {
          if (onUpdateTaskRecurrence && (!task.completed || recurrenceDateContext)) {
            setShowRecurrenceSheet(true);
          }
        }}
        showRecurrenceForCompleted={!!recurrenceDateContext}
        onToggleNotes={() => {
          if (!showNotes) {
            setShowNotes(true);
            setIsEditingNotes(true);
          } else {
            setIsEditingNotes(true);
          }
        }}
        onToggleCommitment={() => {
          if (onToggleCommitment) {
            onToggleCommitment(task.id, !task.committed);
          }
        }}
        onTogglePrivacy={() => {
          onTogglePrivacy(task.id, !task.isPrivate);
        }}
        onDelete={() => {
          onDelete(task.id);
        }}
        hasNotes={!!task.notes}
        isCommitted={!!task.committed}
        isPrivate={task.isPrivate}
      />

      {/* Defer Picker - Keep existing defer picker logic */}
      <RecurrenceBottomSheet
        isOpen={showRecurrenceSheet}
        onClose={() => setShowRecurrenceSheet(false)}
        onSelect={(r) => {
          onUpdateTaskRecurrence?.(task.id, r, recurrenceDateContext);
          setShowRecurrenceSheet(false);
        }}
        onRemove={task.recurrence ? () => {
          onUpdateTaskRecurrence?.(task.id, null);
          setShowRecurrenceSheet(false);
        } : undefined}
        currentRecurrence={task.recurrence}
      />

    </>
  );
}
