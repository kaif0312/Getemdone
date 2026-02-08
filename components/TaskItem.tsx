'use client';

import { useState, useRef, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { TaskWithUser, Attachment } from '@/lib/types';
import { FaEye, FaEyeSlash, FaTrash, FaSmile, FaCalendarPlus, FaCheck, FaGripVertical, FaStar, FaComment, FaEdit, FaTimes, FaCheck as FaCheckIcon, FaClock, FaStickyNote, FaChevronDown, FaChevronUp, FaEllipsisV } from 'react-icons/fa';
import EmojiPicker from './EmojiPicker';
import Confetti from './Confetti';
import TaskContextMenu from './TaskContextMenu';
import AttachmentUpload from './AttachmentUpload';
import AttachmentGallery from './AttachmentGallery';
import { playSound } from '@/utils/sounds';
import { isRolledOver, getTodayString } from '@/utils/taskFilter';

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
  onUpdateNotes?: (taskId: string, notes: string) => Promise<void>;
  onToggleCommitment?: (taskId: string, committed: boolean) => void;
  onToggleSkipRollover?: (taskId: string, skipRollover: boolean) => void;
  onAddReaction?: (taskId: string, emoji: string) => void;
  onOpenComments?: (taskId: string) => void;
  onDeferTask?: (taskId: string, deferToDate: string) => void;
  onAddAttachment?: (taskId: string, attachment: Attachment) => void;
  onDeleteAttachment?: (taskId: string, attachmentId: string) => void;
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
  userStorageUsed,
  userStorageLimit,
  currentUserId,
  dragHandleProps
}: TaskItemProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeferPicker, setShowDeferPicker] = useState(false);
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
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState(task.notes || '');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const [isLongPressing, setIsLongPressing] = useState(false); // Track long-press state for animation
  const editInputRef = useRef<HTMLInputElement>(null);
  const dueDateInputRef = useRef<HTMLInputElement>(null);
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
      await onUpdateNotes(task.id, trimmedNotes);
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
      if (showDueDatePicker && dueDateInputRef.current && !dueDateInputRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('.due-date-picker-container')) {
          setShowDueDatePicker(false);
        }
      }
    };

    if (showDueDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDueDatePicker]);

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

  const handleDeferTask = (days: number) => {
    if (!onDeferTask) return;
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    
    onDeferTask(task.id, dateStr);
    setShowDeferPicker(false);
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
          className={`bg-white dark:bg-gray-800 rounded-lg p-1.5 shadow-sm border transition-all duration-300 hover:shadow-md select-none task-item-touchable ${
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
        <div className="flex items-start gap-1.5">
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
                size={14} 
                title="Committed Task - Must Complete Today!" 
                style={{ minWidth: '14px', minHeight: '14px' }}
              />
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
              <p 
                className={`text-sm flex-1 leading-tight ${
                  task.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'
                } ${isOwnTask && !task.completed && onUpdateTask ? 'cursor-text select-text touch-none' : ''}`} 
                suppressHydrationWarning
                title={isOwnTask && !task.completed && onUpdateTask ? 'Long-press or double-click to edit' : undefined}
              >
                {task.text}
              </p>
            )}
          </div>
          
          {/* Badges row - Ultra-compact inline layout */}
          {(task.deferredTo || task.dueDate) && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {task.deferredTo && (
                <div className="inline-flex items-center gap-0.5 text-[9px] bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-1 py-0.5 rounded-full">
                  <FaCalendarPlus size={8} />
                  <span>Deferred to {new Date(task.deferredTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              )}
              
              {/* Due Date Indicator - Ultra-compact */}
              {task.dueDate && !task.completed && isOwnTask && onUpdateDueDate ? (
                <div className="relative due-date-picker-container inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowDueDatePicker(!showDueDatePicker)}
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
                        setShowDueDatePicker(false);
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
                <button
                  onClick={() => {
                    setShowNotes(!showNotes);
                    if (!showNotes && !task.notes) {
                      setIsEditingNotes(true);
                    }
                  }}
                  className="flex items-center gap-0.5 text-[9px] text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  <FaStickyNote size={9} className={task.notes ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500'} />
                  <span className="font-medium">
                    {task.notes ? 'Notes' : 'Add notes'}
                  </span>
                  {showNotes ? (
                    <FaChevronUp size={7} className="text-gray-400" />
                  ) : (
                    <FaChevronDown size={7} className="text-gray-400" />
                  )}
                </button>
              )}

              {/* Expanded Notes Content */}
              {showNotes && (
                <div className="mt-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                  {isEditingNotes ? (
                    <div className="space-y-2">
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
                        placeholder="Add notes, reminders, or details..."
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
                <button
                  onClick={() => {
                    setShowNotes(true);
                    setIsEditingNotes(true);
                  }}
                  className="flex items-center gap-0.5 text-[9px] text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  <FaStickyNote size={9} />
                  <span>Add notes</span>
                </button>
              )}
            </div>
          )}

          {/* Attachments & Upload - Consolidated section */}
          {(isOwnTask && ((task.attachments && task.attachments.length > 0) || (!task.completed && onAddAttachment))) && (
            <div className="mt-1 space-y-1">
              {/* Existing Attachments */}
              {task.attachments && task.attachments.length > 0 && (
                <AttachmentGallery
                  attachments={task.attachments}
                  onDelete={isOwnTask && onDeleteAttachment ? (attachmentId) => onDeleteAttachment(task.id, attachmentId) : undefined}
                  canDelete={isOwnTask && !task.completed}
                  compact={true}
                />
              )}

              {/* Attachment Upload Button - Show only for own incomplete tasks */}
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
          
          {/* Metadata row - Ultra-compact */}
          <div className="flex items-center gap-1 mt-1 flex-wrap text-[9px]">
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
            
            {/* Comment Button - Ultra-compact */}
            {onOpenComments && (
              <button
                onClick={() => onOpenComments(task.id)}
                className="flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 transition-colors"
                title="View comments"
              >
                <FaComment size={8} className="text-gray-600 dark:text-gray-300" />
                {task.comments && task.comments.length > 0 && (
                  <span className="text-gray-700 dark:text-gray-200 font-medium">
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
        </div>

        {/* Context Menu Button - Ultra-compact */}
        {isOwnTask && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenuPosition({ x: e.clientX, y: e.clientY });
              setShowContextMenu(true);
              if ('vibrate' in navigator) {
                navigator.vibrate(10);
              }
            }}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center text-gray-500 dark:text-gray-400"
            title="More options (long-press or right-click)"
          >
            <FaEllipsisV size={12} />
          </button>
        )}
        </div>
      </div>
      </div>

      {/* Due Date Picker Modal - Centered, works for both badge and button */}
      {showDueDatePicker && isOwnTask && !task.completed && onUpdateDueDate && (
        <>
          <div 
            className="fixed inset-0 z-[99998] bg-black/50 backdrop-blur-sm" 
            onClick={() => setShowDueDatePicker(false)}
          />
          <div className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none p-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl p-4 w-full max-w-[90vw] sm:min-w-[320px] sm:max-w-md pointer-events-auto animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-base font-semibold text-gray-700 dark:text-gray-300">
                  {task.dueDate ? 'Change Deadline' : 'Set Deadline'}
                </span>
                {task.dueDate && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (onUpdateDueDate) {
                        await onUpdateDueDate(task.id, null);
                        setShowDueDatePicker(false);
                      }
                    }}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    title="Remove deadline"
                  >
                    <FaTimes size={14} className="text-gray-500 dark:text-gray-400" />
                  </button>
                )}
              </div>
              <div className="w-full mb-3">
                <input
                  ref={dueDateInputRef}
                  type="datetime-local"
                  onChange={async (e) => {
                    const value = e.target.value;
                    if (value && onUpdateDueDate) {
                      const date = new Date(value);
                      await onUpdateDueDate(task.id, date.getTime());
                      // Don't auto-close - let user see the selected date and click Done
                    }
                  }}
                  min={new Date().toISOString().slice(0, 16)}
                  defaultValue={task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : ''}
                  className="w-full px-3 py-2.5 text-base text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                  style={{
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    boxSizing: 'border-box',
                    minHeight: '44px', // iOS touch target minimum
                  }}
                />
              </div>
              {task.dueDate && (
                <div className="mb-3 text-sm text-gray-600 dark:text-gray-400 text-center">
                  Current: {new Date(task.dueDate).toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowDueDatePicker(false)}
                className="w-full px-4 py-2.5 text-base bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
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
          if (onUpdateDueDate && !task.completed) {
            setShowDueDatePicker(true);
          }
        }}
        onDefer={() => {
          if (onDeferTask && !task.completed) {
            setShowDeferPicker(true);
          }
        }}
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
      {showDeferPicker && onDeferTask && !task.completed && (
        <>
          <div 
            className="fixed inset-0 z-[99998]" 
            onClick={() => setShowDeferPicker(false)}
          />
          <div className="fixed inset-0 z-[99999] flex items-center justify-center pointer-events-none">
            <div 
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-2xl p-3 min-w-[180px] pointer-events-auto animate-in fade-in zoom-in duration-200"
            >
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 px-2 text-center">⏰ Defer task to:</div>
              <button
                onClick={() => handleDeferTask(1)}
                className="block w-full text-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-base transition-colors text-gray-900 dark:text-gray-100 font-medium"
              >
                Tomorrow
              </button>
              <button
                onClick={() => handleDeferTask(2)}
                className="block w-full text-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-base transition-colors text-gray-900 dark:text-gray-100 font-medium"
              >
                In 2 days
              </button>
              <button
                onClick={() => handleDeferTask(3)}
                className="block w-full text-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-base transition-colors text-gray-900 dark:text-gray-100 font-medium"
              >
                In 3 days
              </button>
              <button
                onClick={() => handleDeferTask(7)}
                className="block w-full text-center px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-base transition-colors text-gray-900 dark:text-gray-100 font-medium"
              >
                Next week
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
