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
          className={`group bg-white dark:bg-gray-800 rounded-lg p-2.5 transition-all duration-200 select-none task-item-touchable ${
            task.completed 
              ? 'bg-green-50 dark:bg-green-900/20 shadow-sm' 
              : 'shadow-sm hover:shadow-md'
          } ${isAnimatingOut ? 'animate-task-complete' : ''} ${
            swipeAction === 'complete' ? 'bg-green-100 dark:bg-green-900/40 shadow-md' : ''
          } ${
            swipeAction === 'delete' ? 'bg-red-100 dark:bg-red-900/40 shadow-md' : ''
          } ${
            isEditing ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-400 dark:ring-blue-600' : ''
          } ${
            isLongPressing ? 'ring-2 ring-blue-500 dark:ring-blue-400 scale-[0.98]' : ''
          }`}
        >
        {/* LINE 1: Checkbox + Title + Due Badge Inline */}
        <div className="flex items-center gap-2 mb-1">
          {/* Drag Handle - Ultra-compact, hidden until hover */}
          {dragHandleProps && (
            <button
              ref={dragHandleProps.ref}
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              className="flex-shrink-0 p-0.5 -ml-1 touch-none cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Drag to reorder"
              style={{ touchAction: 'none', minWidth: '24px', minHeight: '24px' }}
            >
              <FaGripVertical size={12} />
            </button>
          )}

          {/* Checkbox - Ultra-compact */}
          <button
            onClick={handleToggleComplete}
            disabled={!isOwnTask}
            className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all duration-200 ${
              task.completed 
                ? 'bg-green-500 border-green-500' 
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-green-400 dark:hover:border-green-500'
            } ${!isOwnTask ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
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

          {/* Star badge if committed */}
          {task.committed && (
            <FaStar 
              className="text-yellow-500 dark:text-yellow-400 flex-shrink-0" 
              size={12} 
              title="Committed" 
            />
          )}

          {/* Task Title - Inline with everything */}
          <div 
            className="flex-1 min-w-0"
            onDoubleClick={handleDoubleClick}
          >
            {isEditing ? (
              <div className="flex items-center gap-1">
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
                  className="flex-1 px-2 py-1 text-sm bg-white dark:bg-gray-700 border border-blue-500 dark:border-blue-400 rounded text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleSaveEdit}
                  disabled={isSaving || !editText.trim() || editText.trim() === task.text}
                  className="p-1 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors"
                  title="Save"
                >
                  {isSaving ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FaCheckIcon size={10} />
                  )}
                </button>
                <button
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="p-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded transition-colors"
                  title="Cancel"
                >
                  <FaTimes size={10} />
                </button>
              </div>
            ) : (
              <p 
                className={`text-sm truncate ${
                  task.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'
                }`} 
                suppressHydrationWarning
                title={task.text}
              >
                {task.text}
              </p>
            )}
          </div>

          {/* Due Badge - Inline on same line */}
          {task.dueDate && !task.completed && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => isOwnTask && onUpdateDueDate && setShowDueDatePicker(!showDueDatePicker)}
                className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded-full border transition-colors ${getDueDateColor(task.dueDate)} ${isOwnTask && onUpdateDueDate ? 'hover:opacity-80' : ''}`}
                title={isOwnTask && onUpdateDueDate ? "Tap to change deadline" : formatDueDate(task.dueDate)}
                disabled={!isOwnTask || !onUpdateDueDate}
              >
                <FaClock size={8} />
                <span className="font-medium">{formatDueDate(task.dueDate)}</span>
              </button>
              {isOwnTask && onUpdateDueDate && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (onUpdateDueDate) {
                      await onUpdateDueDate(task.id, null);
                      setShowDueDatePicker(false);
                    }
                  }}
                  className="w-3 h-3 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove deadline"
                >
                  <FaTimes size={7} className="text-gray-500 dark:text-gray-400" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* LINE 2: Subtle Metadata Row - Right-aligned */}
        <div className="flex items-center justify-between text-[9px] text-gray-500 dark:text-gray-400">
          {/* Left side: Username + Private badge */}
          <div className="flex items-center gap-1.5">
            <span className={isOwnTask ? 'text-blue-600 dark:text-blue-400 font-medium' : ''} suppressHydrationWarning>
              {task.userName}
            </span>
            {task.isPrivate && isOwnTask && (
              <span className="flex items-center gap-0.5 opacity-60">
                <FaEyeSlash size={8} /> Private
              </span>
            )}
            {task.deferredTo && (
              <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                <FaCalendarPlus size={8} />
                {new Date(task.deferredTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {/* Right side: Icons + Timestamp */}
          <div className="flex items-center gap-2">
            {/* Attachments indicator */}
            {task.attachments && task.attachments.length > 0 && (
              <span className="flex items-center gap-0.5" title={`${task.attachments.length} attachment(s)`}>
                📎 {task.attachments.length}
              </span>
            )}

            {/* Reactions */}
            {task.reactions && task.reactions.length > 0 && (
              <div className="flex items-center gap-0.5">
                {Object.entries(
                  task.reactions.reduce((acc, r) => {
                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).slice(0, 2).map(([emoji, count]) => (
                  <span key={emoji} className="flex items-center">
                    {emoji}{count > 1 && count}
                  </span>
                ))}
              </div>
            )}

            {/* Comments */}
            {task.comments && task.comments.length > 0 && (
              <button
                onClick={() => onOpenComments?.(task.id)}
                className="flex items-center gap-0.5 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <FaComment size={8} /> {task.comments.length}
              </button>
            )}

            {/* Timestamp */}
            <span suppressHydrationWarning>
              {formatTime(task.createdAt)}
            </span>
            {task.completed && task.completedAt && (
              <span className="text-green-600 dark:text-green-400 font-medium" suppressHydrationWarning>
                ✓ {formatTime(task.completedAt)}
              </span>
            )}
          </div>
        </div>

        {/* Hidden Actions - Show on Hover/Long-press */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          {/* Notes toggle */}
          {isOwnTask && onUpdateNotes && !task.notes && (
            <button
              onClick={() => {
                setShowNotes(true);
                setIsEditingNotes(true);
              }}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Add notes"
            >
              <FaStickyNote size={10} />
            </button>
          )}

          {/* Attachment upload */}
          {isOwnTask && !task.completed && onAddAttachment && (
            <AttachmentUpload
              taskId={task.id}
              currentAttachments={task.attachments || []}
              onUploadComplete={(attachment) => onAddAttachment(task.id, attachment)}
              maxAttachments={3}
              userStorageUsed={userStorageUsed}
              userStorageLimit={userStorageLimit}
              compact={true}
            />
          )}

          {/* Add reaction */}
          {task.completed && onAddReaction && (
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title="Add reaction"
            >
              <FaSmile size={10} />
            </button>
          )}
        </div>

        {/* Expandable Notes Section - Hidden by default, shows when toggled */}
        {showNotes && isOwnTask && onUpdateNotes && (
          <div className="mt-2 relative">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2 border border-gray-200 dark:border-gray-600">
              {isEditingNotes ? (
                <div className="space-y-2">
                  <textarea
                    ref={notesTextareaRef}
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveNotes();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelNotes();
                      }
                    }}
                    placeholder="Add notes..."
                    rows={3}
                    maxLength={1000}
                    className="w-full px-2 py-1 text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    autoFocus
                    disabled={isSavingNotes}
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-gray-500 dark:text-gray-400">
                      {notesText.length}/1000
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleCancelNotes}
                        disabled={isSavingNotes}
                        className="px-2 py-1 text-[9px] text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveNotes}
                        disabled={isSavingNotes || notesText.trim() === (task.notes || '')}
                        className="px-2 py-1 text-[9px] bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors font-medium"
                      >
                        {isSavingNotes ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                    {task.notes}
                  </div>
                  <button
                    onClick={() => setIsEditingNotes(true)}
                    className="text-[9px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Expanded Attachments - Shows existing attachments */}
        {task.attachments && task.attachments.length > 0 && (
          <div className="mt-2">
            <AttachmentGallery
              attachments={task.attachments}
              onDelete={isOwnTask && onDeleteAttachment ? (attachmentId) => onDeleteAttachment(task.id, attachmentId) : undefined}
              canDelete={isOwnTask && !task.completed}
              compact={true}
            />
          </div>
        )}
        
        {/* Emoji Picker - Shows on hover actions */}
        {showEmojiPicker && (
          <div className="absolute top-full mt-1 right-2 z-[10000]">
            <EmojiPicker
              onSelect={(emoji) => {
                onAddReaction?.(task.id, emoji);
                setShowEmojiPicker(false);
              }}
              onClose={() => setShowEmojiPicker(false)}
              position="bottom"
            />
          </div>
        )}

        {/* Context Menu */}
        {showContextMenu && (
          <TaskContextMenu
            task={task}
            isOwnTask={isOwnTask}
            isOpen={showContextMenu}
            position={contextMenuPosition}
            onClose={() => setShowContextMenu(false)}
            onEdit={isOwnTask && !task.completed && onUpdateTask ? () => {
              setIsEditing(true);
              setShowContextMenu(false);
            } : undefined}
            onDelete={isOwnTask ? () => {
              onDelete(task.id);
              setShowContextMenu(false);
            } : undefined}
            onTogglePrivacy={isOwnTask ? () => {
              onTogglePrivacy(task.id, !task.isPrivate);
              setShowContextMenu(false);
            } : undefined}
            onToggleCommitment={isOwnTask && !task.completed && onToggleCommitment ? () => {
              onToggleCommitment(task.id, !task.committed);
              setShowContextMenu(false);
            } : undefined}
            onSetDeadline={isOwnTask && !task.completed && onUpdateDueDate ? () => {
              setShowDueDatePicker(true);
              setShowContextMenu(false);
            } : undefined}
            onToggleNotes={isOwnTask && onUpdateNotes ? () => {
              setShowNotes(!showNotes);
              if (!showNotes && !task.notes) {
                setIsEditingNotes(true);
              }
              setShowContextMenu(false);
            } : undefined}
            onDefer={isOwnTask && !task.completed && onDeferTask ? () => {
              setShowDeferPicker(true);
              setShowContextMenu(false);
            } : undefined}
            hasNotes={!!task.notes}
            isCommitted={task.committed}
            isPrivate={task.isPrivate}
          />
        )}

        {/* Defer Picker */}
        {showDeferPicker && onDeferTask && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/50" onClick={() => setShowDeferPicker(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Defer Task</h3>
              <div className="space-y-2">
                {['tomorrow', 'this-weekend', 'next-week', 'next-month'].map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      let deferDate = '';
                      const today = new Date();
                      if (option === 'tomorrow') {
                        const tomorrow = new Date(today);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        deferDate = tomorrow.toISOString().split('T')[0];
                      } else if (option === 'this-weekend') {
                        const weekend = new Date(today);
                        weekend.setDate(weekend.getDate() + (6 - weekend.getDay()));
                        deferDate = weekend.toISOString().split('T')[0];
                      } else if (option === 'next-week') {
                        const nextWeek = new Date(today);
                        nextWeek.setDate(nextWeek.getDate() + 7);
                        deferDate = nextWeek.toISOString().split('T')[0];
                      } else if (option === 'next-month') {
                        const nextMonth = new Date(today);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);
                        deferDate = nextMonth.toISOString().split('T')[0];
                      }
                      onDeferTask(task.id, deferDate);
                      setShowDeferPicker(false);
                    }}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-900 dark:text-white"
                  >
                    {option.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
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
