'use client';

import { useState, useRef, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { TaskWithUser, Attachment, Subtask, TaskVisibility } from '@/lib/types';
import { getEffectiveVisibility } from './VisibilityBottomSheet';
import { FaEye, FaEyeSlash, FaTrash, FaSmile, FaCheck, FaGripVertical, FaStar, FaComment, FaEdit, FaTimes, FaCheck as FaCheckIcon, FaClock, FaStickyNote, FaEllipsisV, FaPlus, FaPaperclip } from 'react-icons/fa';
import { LuChevronDown, LuCalendar, LuHeart, LuUsers } from 'react-icons/lu';
import { LuRepeat, LuCheck, LuMessageCircle, LuSquareCheck, LuClock } from 'react-icons/lu';
import ScheduleDeadlinePicker from './ScheduleDeadlinePicker';
import EmojiPicker from './EmojiPicker';
import TagIconPicker from './TagIconPicker';
import Confetti from './Confetti';
import TaskContextMenu from './TaskContextMenu';
import RecurrenceBottomSheet from './RecurrenceBottomSheet';
import VisibilityBottomSheet from './VisibilityBottomSheet';
import AttachmentUpload from './AttachmentUpload';
import AttachmentGallery from './AttachmentGallery';
import SortableSubtaskList from './SortableSubtaskList';
import { playSound } from '@/utils/sounds';
import { isRolledOver, getTodayString, getDateString } from '@/utils/taskFilter';
import { getIconForTag, normalizeTagToIconId, getTintClassForTag, getTintBgClassForTag } from '@/lib/tagIcons';

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
  showReorderMode: boolean;
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
  showReorderMode,
}: SubtaskRowProps) {
  const [swipeRevealed, setSwipeRevealed] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const isEditing = editingSubtaskId === subtask.id;

  // Tap text to edit (no long-press) — disabled when reorder mode active
  const handleTextTap = () => {
    if (!canEdit || showReorderMode) return;
    onStartEdit(subtask.id, subtask.title);
  };

  const handleSaveEdit = () => {
    if (editingSubtaskTitle.trim()) onEdit(editingSubtaskTitle.trim());
    onFinishEdit();
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 300);
  };

  const handleBlur = () => {
    handleSaveEdit();
  };

  // Focus, cursor at end, and auto-grow when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const len = editingSubtaskTitle.length;
      el.setSelectionRange(len, len);
      if (el.tagName === 'TEXTAREA') {
        (el as HTMLTextAreaElement).style.height = 'auto';
        (el as HTMLTextAreaElement).style.height = `${Math.min((el as HTMLTextAreaElement).scrollHeight, 120)}px`;
      }
    }
  }, [isEditing]);

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onUpdateEditTitle(e.target.value);
    const el = e.target;
    if (el.tagName === 'TEXTAREA') {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  };

  return (
    <div
      className="relative overflow-hidden min-h-[40px] py-0.5 group/subtask"
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={`flex items-center transition-transform duration-200 ease-out rounded-lg ${
          isEditing ? 'bg-primary/[0.04]' : saveFlash ? 'bg-primary/10' : ''
        }`}
        style={{
          transform: swipeRevealed ? 'translateX(-44px)' : undefined,
          transition: saveFlash ? 'background 300ms ease-out' : undefined,
        }}
        onTouchStart={(e) => {
          if (canEdit && isOwnTask) {
            const t = e.touches[0];
            if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
          }
        }}
        onTouchEnd={() => { touchStartRef.current = null; }}
        onTouchMove={(e) => {
          if (touchStartRef.current && canEdit && isOwnTask) {
            const t = e.touches[0];
            if (t) {
              const dx = t.clientX - touchStartRef.current.x;
              const dy = t.clientY - touchStartRef.current.y;
              if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {
                setSwipeRevealed(dx < -30);
              }
            }
          }
        }}
      >
        {showReorderMode && dragHandle}
        {/* Zone 1: Checkbox — 44px left, 8px gap to text */}
        <div className="flex-shrink-0 w-11 min-w-[44px] h-10 flex items-center justify-start pl-0 pr-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            disabled={!isOwnTask}
            className={`w-[18px] h-[18px] rounded-[4px] flex items-center justify-center transition-all border-[1.5px] ${
              subtask.completed
                ? 'bg-primary border-primary'
                : 'border-fg-tertiary bg-transparent hover:border-fg-secondary'
            } ${!isOwnTask ? 'cursor-default opacity-50' : 'cursor-pointer'}`}
          >
            {subtask.completed && (
              <svg className="w-2.5 h-2.5 text-on-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>
        {/* Zone 2: Text — tap to edit (when not in reorder mode) */}
        <div className="flex-1 min-w-0 pl-0 pr-2" style={{ marginLeft: 0 }}>
          {isEditing ? (
            <textarea
              ref={(el) => { inputRef.current = el; }}
              value={editingSubtaskTitle}
              onChange={handleEditInputChange}
              onBlur={handleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelEdit();
                }
              }}
              autoFocus
              rows={1}
              className="w-full min-w-0 px-0 py-0.5 text-[14px] text-fg-primary bg-transparent border-0 border-b border-primary rounded-none focus:outline-none focus:ring-0 placeholder:text-fg-tertiary resize-none overflow-hidden"
              style={{ minHeight: 20 }}
            />
          ) : (
            <div
              onClick={handleTextTap}
              className={`min-h-[24px] py-1 text-[14px] overflow-hidden line-clamp-2 cursor-text ${
                subtask.completed
                  ? 'line-through text-fg-secondary opacity-60'
                  : 'text-fg-primary'
              } ${canEdit && !showReorderMode ? 'hover:bg-primary/[0.04] rounded' : ''}`}
            >
              {subtask.title}
            </div>
          )}
        </div>
      </div>
      {/* Delete: swipe-revealed (mobile) or hover X (desktop) */}
      {canEdit && isOwnTask && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
            setSwipeRevealed(false);
          }}
          className={`absolute right-0 top-0 bottom-0 w-11 flex items-center justify-center text-error transition-opacity ${
            swipeRevealed ? 'opacity-100 bg-error/10' : 'opacity-0 md:group-hover/subtask:opacity-100 md:text-fg-tertiary md:hover:text-error'
          }`}
          style={{ minHeight: 40 }}
          title="Delete subtask"
        >
          <FaTimes size={14} />
        </button>
      )}
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
  onUpdateVisibility?: (taskId: string, visibility: TaskVisibility, visibilityList: string[]) => void;
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
  recordRecentlyUsedTag?: (iconId: string) => Promise<void>;
  recentUsedTags?: string[];
  onUpdateTaskSubtasks?: (taskId: string, subtasks: Subtask[]) => Promise<void>;
  onUpdateTaskRecurrence?: (taskId: string, recurrence: import('@/lib/types').Recurrence | null, completedDateStr?: string) => Promise<void>;
  /** When set (e.g. calendar view), show Set recurrence for completed tasks and pass date when converting */
  recurrenceDateContext?: string;
  userStorageUsed?: number;
  userStorageLimit?: number;
  currentUserId?: string;
  dragHandleProps?: DragHandleProps;
  /** When true (grouped by category), hide category icons on card - section header shows category */
  hideCategoryIcon?: boolean;
  /** When true, show uncheck animation (used for Undo from completion toast) */
  isUndoing?: boolean;
  /** When true, play slide-in animation (task just moved to Completed section) */
  justCompleted?: boolean;
}

export default function TaskItem({ 
  task, 
  isOwnTask, 
  onToggleComplete, 
  onTogglePrivacy,
  onUpdateVisibility,
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
  dragHandleProps,
  hideCategoryIcon = false,
  isUndoing = false,
  justCompleted = false,
}: TaskItemProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showUnifiedDatePicker, setShowUnifiedDatePicker] = useState(false);
  const [unifiedDatePickerTab, setUnifiedDatePickerTab] = useState<'schedule' | 'deadline'>('schedule');
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
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
  const [contextMenuAnchorRect, setContextMenuAnchorRect] = useState<DOMRect | null>(null);
  const contextMenuAnchorRef = useRef<HTMLButtonElement>(null);
  const [isLongPressing, setIsLongPressing] = useState(false); // Track long-press state for animation
  const [showRecurrenceSheet, setShowRecurrenceSheet] = useState(false);
  const [showVisibilitySheet, setShowVisibilitySheet] = useState(false);
  const visibilityIconLongPressRef = useRef<NodeJS.Timeout | null>(null);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [removingTag, setRemovingTag] = useState<string | null>(null);
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [subtaskReorderMode, setSubtaskReorderMode] = useState(false);
  const [subtaskInputValue, setSubtaskInputValue] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const subtaskSectionRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
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

  // Reset reorder mode when collapsing subtasks
  useEffect(() => {
    if (!showSubtasks) setSubtaskReorderMode(false);
  }, [showSubtasks]);

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

  const [isCompleting, setIsCompleting] = useState(false);
  const [isUnchecking, setIsUnchecking] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const hapticTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const fn = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const handleToggleComplete = async () => {
    if (!isOwnTask || isEditing) return;
    const newCompletedState = !task.completed;

    if (prefersReducedMotion) {
      onToggleComplete(task.id, newCompletedState);
      return;
    }

    if (newCompletedState) {
      setIsCompleting(true);
      setShowCompletionAnimation(true);
      playSound(true);
      hapticTimerRef.current = setTimeout(() => {
        if ('vibrate' in navigator) navigator.vibrate(10);
        hapticTimerRef.current = null;
      }, 150);
      // Delay toggle to 500ms so task stays in place during full animation (Phase 4)
      setTimeout(() => onToggleComplete(task.id, true), 500);
      setTimeout(() => setIsCompleting(false), 500);
    } else {
      setIsUnchecking(true);
      setTimeout(() => {
        onToggleComplete(task.id, false);
        setTimeout(() => setIsUnchecking(false), 250);
      }, 0);
    }
  };

  useEffect(() => () => {
    if (hapticTimerRef.current) clearTimeout(hapticTimerRef.current);
  }, []);

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
      const element = e.currentTarget as HTMLElement; // Capture before async - React nullifies currentTarget after handler
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
          
          const rect = contextMenuAnchorRef.current?.getBoundingClientRect();
          setContextMenuAnchorRect(rect ?? null);
          setShowContextMenu(true);
          
          // Prevent text selection only when long-press is confirmed
          if (element?.style) {
            element.style.userSelect = 'none';
            element.style.webkitUserSelect = 'none';
            element.style.setProperty('-webkit-touch-callout', 'none');
          }
          
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
      const element = e.currentTarget as HTMLElement | null;
      if (element?.style) {
        element.style.userSelect = '';
        element.style.webkitUserSelect = '';
        element.style.removeProperty('-webkit-touch-callout');
      }
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
          const element = e.currentTarget as HTMLElement | null;
          if (element?.style) {
            element.style.userSelect = '';
            element.style.webkitUserSelect = '';
            element.style.removeProperty('-webkit-touch-callout');
          }
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
          const element = e.currentTarget as HTMLElement | null;
          if (element?.style) {
            element.style.userSelect = '';
            element.style.webkitUserSelect = '';
            element.style.removeProperty('-webkit-touch-callout');
          }
        }
      }
    }
  };

  // Desktop: Right-click for context menu, double-click to edit
  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isOwnTask) return; // Allow for completed tasks too
    e.preventDefault();
    const rect = contextMenuAnchorRef.current?.getBoundingClientRect();
    setContextMenuAnchorRect(rect ?? null);
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
  const formatRelativeTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today.getTime() - dateOnly.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays > 1 && diffDays < 14) return `${diffDays}d ago`;
    if (diffDays >= 14) return `${Math.floor(diffDays / 7)}w ago`;
    return 'today';
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
      return 'text-error bg-error/12 border-0';
    } else if (hours < 2) {
      return 'text-warning bg-warning-bg border-warning-border';
    } else if (hours < 24) {
      return 'text-warning bg-warning-bg border-warning-border';
    } else {
      return 'text-primary bg-primary/10 border-primary/30';
    }
  };

  const isOverdue = task.dueDate && !task.completed && task.dueDate < Date.now();

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
                <div className="w-10 h-10 rounded-full bg-success flex items-center justify-center">
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
                <div className="w-10 h-10 rounded-full bg-error flex items-center justify-center">
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
          className={`group task-card select-none task-item-touchable relative rounded-[12px] p-4 overflow-hidden ${
            justCompleted ? 'task-complete-slide-in ' : ''
          } ${
            /* Light: white + shadow, no border. Dark: surface + 1px border */
            'bg-white dark:bg-surface border-0 dark:border dark:border-border-subtle'
          } shadow-elevation-1 dark:shadow-none ${
            swipeAction === 'complete' ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/40' : ''
          } ${
            swipeAction === 'delete' ? 'border-red-400 dark:border-red-600 bg-red-100 dark:bg-red-900/40' : ''
          } ${
            isEditing ? 'border-primary ring-2 ring-primary/20' : ''
          } ${
            isLongPressing ? 'ring-2 ring-primary ring-offset-2 scale-[0.98]' : ''
          }           ${
            (task.completed || isCompleting || isUndoing) ? 'opacity-60' : ''
          } transition-opacity duration-200`}
        >
        <div className="flex items-start gap-1">
          {dragHandleProps && (
            <button
              ref={dragHandleProps.ref}
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              className="flex-shrink-0 p-1 -ml-1 touch-none cursor-grab active:cursor-grabbing text-fg-tertiary opacity-30 md:opacity-0 md:group-hover:opacity-100 hover:bg-surface-muted rounded transition-opacity flex items-center justify-center"
              title="Drag to reorder"
              style={{ touchAction: 'none', minWidth: '28px', minHeight: '28px' }}
            >
              <FaGripVertical size={14} />
            </button>
          )}

          {/* Checkbox + particle burst wrapper - particles originate from checkbox center */}
          <div className="relative flex-shrink-0">
            {isCompleting && (
              <>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <span
                    key={i}
                    className={`absolute w-[3px] h-[3px] rounded-full bg-primary left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 task-complete-particle-${i}`}
                    style={{ willChange: 'transform, opacity' }}
                  />
                ))}
              </>
            )}
            {/* Checkbox - fill, checkmark draw, bounce on complete; reverse on uncheck */}
            <button
            onClick={handleToggleComplete}
            disabled={!isOwnTask}
            className={`relative flex-shrink-0 w-5 h-5 rounded-lg flex items-center justify-center overflow-visible border-2 ${
              (task.completed || isCompleting || isUnchecking || isUndoing)
                ? 'border-primary'
                : 'border-fg-tertiary bg-transparent hover:border-fg-secondary'
            } ${!isOwnTask ? 'cursor-default opacity-50' : 'cursor-pointer'} ${
              isCompleting ? 'task-complete-checkbox-bounce' : ''
            } ${task.completed && !isCompleting && !isUnchecking ? 'checkbox-checked' : ''}`}
            style={{ marginTop: '2px' }}
          >
            {(task.completed || isCompleting || isUnchecking || isUndoing) && (
              <>
                <span
                  className={`absolute inset-0 rounded-md bg-primary ${
                    isCompleting ? 'task-complete-checkbox-fill' : (isUnchecking || isUndoing) ? 'task-uncheck-fill' : ''
                  }`}
                  style={!isCompleting && !isUnchecking && !isUndoing ? { clipPath: 'circle(100% at 50% 50%)' } : undefined}
                />
                <svg
                  className={`w-3 h-3 text-on-accent relative z-10 ${
                    isCompleting ? 'task-complete-checkmark-draw' : (isUnchecking || isUndoing) ? 'task-uncheck-draw' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                    style={
                    !isCompleting && !isUnchecking && !isUndoing
                      ? { strokeDasharray: 24, strokeDashoffset: 0 }
                      : undefined
                  }
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </>
            )}
          </button>
          </div>

        <div className="flex-1 min-w-0 pr-8">
          {!isOwnTask && (
            <div className="flex items-center gap-1 mb-0">
              <span className="font-semibold text-xs text-fg-secondary" suppressHydrationWarning>
                {task.userName}
              </span>
              {task.isPrivate && (
                <span className="text-xs text-fg-tertiary flex items-center gap-0.5">
                  <FaEyeSlash size={8} /> Private
                </span>
              )}
            </div>
          )}
          <div 
            className="flex items-start gap-1"
            onDoubleClick={handleDoubleClick}
          >
            {task.committed && (
              <FaStar 
                className="text-warning mt-0.5 flex-shrink-0 z-10" 
                size={12} 
                title="Committed Task - Must Complete Today!" 
                style={{ minWidth: '12px', minHeight: '12px' }}
              />
            )}
            {task.recurrence && (
              <LuRepeat className="mt-0.5 flex-shrink-0 text-sm text-fg-tertiary" size={14} title="Recurring task" />
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
                  className="flex-1 px-2 py-1.5 bg-surface-muted border-2 border-primary rounded-lg text-sm text-fg-primary focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleSaveEdit}
                    disabled={isSaving || !editText.trim() || editText.trim() === task.text}
                    className="p-1.5 bg-success hover:bg-success/90 disabled:bg-surface-muted disabled:cursor-not-allowed text-on-accent rounded-lg transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
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
                    className="p-1.5 bg-surface-muted hover:bg-surface-muted/80 text-fg-secondary rounded-lg transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
                    title="Cancel"
                  >
                    <FaTimes size={11} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p 
                  className={`text-base font-medium leading-[1.4] ${
                    (task.completed || isCompleting || isUnchecking || isUndoing) ? 'text-fg-secondary' : 'text-fg-primary'
                  } ${
                    isCompleting ? 'task-complete-strikethrough' : ''
                  } ${
                    task.completed && !isCompleting && !isUnchecking && !isUndoing ? 'task-complete-strikethrough strikethrough-expanded' : ''
                  } ${
                    (isUnchecking || isUndoing) ? 'task-uncheck-strikethrough' : ''
                  } ${isOwnTask && !task.completed && onUpdateTask ? 'cursor-text select-text touch-none' : ''}`} 
                  suppressHydrationWarning
                  title={isOwnTask && !task.completed && onUpdateTask ? 'Long-press or double-click to edit' : undefined}
                >
                  {task.text}
                </p>
                {/* Tags + progress chip - compact row below title (hidden when grouped by category) */}
                {!hideCategoryIcon && ((task.tags?.length ?? 0) > 0 || (task.subtasks?.length ?? 0) > 0 || (isOwnTask && onUpdateTaskTags)) && (
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {(() => {
                      const displayTags = [...new Map((task.tags || []).map((t) => [normalizeTagToIconId(t), t])).values()];
                      return displayTags.map((rawTag) => {
                        const iconId = normalizeTagToIconId(rawTag);
                        const Icon = getIconForTag(rawTag);
                        const tintClass = getTintClassForTag(rawTag);
                        const tintBgClass = getTintBgClassForTag(rawTag);
                        return isOwnTask && onUpdateTaskTags ? (
                          <button
                            key={iconId}
                            onClick={async (e) => {
                              e.stopPropagation();
                              setRemovingTag(iconId);
                              await new Promise((r) => setTimeout(r, 150));
                              const next = (task.tags || []).filter((t) => normalizeTagToIconId(t) !== iconId);
                              await onUpdateTaskTags(task.id, next);
                              setRemovingTag(null);
                              if ('vibrate' in navigator) navigator.vibrate(30);
                            }}
                            className={`w-7 h-7 flex items-center justify-center text-sm rounded-lg transition-all duration-150 ${tintClass} ${
                              removingTag === iconId
                                ? 'scale-75 opacity-0'
                                : `hover:bg-surface-muted active:scale-95 ${tintBgClass}`
                            }`}
                          >
                            <Icon size={16} strokeWidth={1.5} />
                          </button>
                        ) : (
                          <span
                            key={iconId}
                            className={`w-7 h-7 flex items-center justify-center text-sm rounded-lg ${tintBgClass} ${tintClass}`}
                          >
                            <Icon size={16} strokeWidth={1.5} />
                          </span>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Badges row - Ultra-compact inline layout */}
          {((task.deferredTo || task.dueDate) || (isOwnTask && !task.completed && (() => {
            const v = getEffectiveVisibility(task.visibility, task.isPrivate);
            return (v === 'only' || v === 'except') && (task.visibilityList?.length ?? 0) > 0;
          })())) && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {/* Only show scheduled/deferred badge if there's no deadline */}
              {task.deferredTo && !task.dueDate && (() => {
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
                
                const badgeClass = 'inline-flex items-center gap-1.5 py-1 px-2 rounded-[6px] text-[12px] text-fg-secondary bg-elevated border border-border-subtle shrink-0';
                const badgeContent = (
                  <>
                    <LuCalendar size={12} className="text-fg-secondary flex-shrink-0" />
                    <span>{displayText}</span>
                  </>
                );
                if (isOwnTask && onDeferTask) {
                  return (
                    <button
                      type="button"
                      onClick={() => handleOpenUnifiedDatePicker()}
                      className={`${badgeClass} transition-colors hover:bg-surface-muted due-date-picker-container`}
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
                <div className="relative due-date-picker-container inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => (showUnifiedDatePicker ? setShowUnifiedDatePicker(false) : handleOpenUnifiedDatePicker())}
                    className={`inline-flex items-center gap-1.5 py-1 px-2 rounded-[6px] text-xs transition-colors hover:opacity-80 ${isOverdue ? 'bg-error/12 text-error' : `border ${getDueDateColor(task.dueDate)}`}`}
                    title="Tap to change deadline"
                  >
                    {isOverdue ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-error flex-shrink-0" />
                    ) : (
                      <FaClock size={8} />
                    )}
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
                    className="ml-2 w-6 h-6 flex items-center justify-center hover:bg-surface-muted rounded transition-colors min-w-[24px]"
                    title="Remove deadline"
                  >
                    <FaTimes size={14} className="text-fg-tertiary" />
                  </button>
                </div>
              ) : task.dueDate && !task.completed ? (
                <div className={`inline-flex items-center gap-1.5 py-1 px-2 rounded-[6px] text-xs ${isOverdue ? 'bg-error/12 text-error' : `border ${getDueDateColor(task.dueDate)}`}`}>
                  {isOverdue ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-error flex-shrink-0" />
                  ) : (
                    <FaClock size={8} />
                  )}
                  <span className="font-medium">{formatDueDate(task.dueDate)}</span>
                </div>
              ) : null}
              {/* Custom visibility indicator - subtle, tappable to edit */}
              {isOwnTask && !task.completed && onUpdateVisibility && (() => {
                const v = getEffectiveVisibility(task.visibility, task.isPrivate);
                const count = task.visibilityList?.length ?? 0;
                if ((v !== 'only' && v !== 'except') || count === 0) return null;
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowVisibilitySheet(true);
                    }}
                    className="inline-flex items-center gap-1 py-1 px-2 rounded-[6px] text-[12px] text-fg-tertiary hover:text-fg-secondary hover:bg-surface-muted transition-colors shrink-0"
                    title="Tap to change who can see this"
                  >
                    <LuUsers size={12} />
                    <span>{count}</span>
                  </button>
                );
              })()}
            </div>
          )}

          {/* Quick-action row: + Subtask, Note, Attach - fades out on complete */}
          {isOwnTask && (!task.completed || isCompleting) && (onUpdateNotes || onUpdateTaskSubtasks || onAddAttachment) && (
            <div className={`flex items-center gap-4 mt-2 transition-opacity duration-150 ${isCompleting ? 'opacity-0' : ''}`}>
              {onUpdateTaskSubtasks && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSubtasks(true);
                    if ((task.subtasks?.length ?? 0) === 0) {
                      setIsAddingSubtask(true);
                      setTimeout(() => subtaskInputRef.current?.focus(), 100);
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-fg-tertiary hover:text-fg-secondary transition-colors"
                >
                  <FaPlus size={10} />
                  <span>Subtask</span>
                </button>
              )}
              {onUpdateNotes && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNotes(!showNotes);
                    if (!showNotes && !task.notes) setIsEditingNotes(true);
                  }}
                  className="flex items-center gap-1 text-xs text-fg-tertiary hover:text-fg-secondary transition-colors"
                >
                  <FaStickyNote size={10} className={task.notes ? 'text-primary' : ''} />
                  <span>Note</span>
                </button>
              )}
              {onAddAttachment && (!task.attachments || task.attachments.length === 0) && (
                <AttachmentUpload
                  taskId={task.id}
                  currentAttachments={task.attachments || []}
                  onUploadComplete={(attachment) => onAddAttachment(task.id, attachment)}
                  maxAttachments={3}
                  userStorageUsed={userStorageUsed}
                  userStorageLimit={userStorageLimit}
                  variant="ghost"
                />
              )}
            </div>
          )}

          {/* Expandable Notes - content when expanded */}
          {isOwnTask && onUpdateNotes && showNotes && (
            <div className="mt-1 bg-surface-muted rounded-lg p-2 border border-border-subtle">
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
                        className="w-full px-3 py-2 text-sm text-fg-primary bg-surface border border-border-subtle rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                        autoFocus
                        disabled={isSavingNotes}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-fg-tertiary">
                          {notesText.length}/1000
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleCancelNotes}
                            disabled={isSavingNotes}
                            className="px-3 py-1.5 text-xs text-fg-tertiary hover:text-fg-primary transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveNotes}
                            disabled={isSavingNotes || notesText.trim() === (task.notes || '')}
                            className="px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 disabled:bg-surface-muted disabled:cursor-not-allowed text-on-accent rounded-lg transition-colors font-medium"
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
                          <span className="text-fg-tertiary italic">No notes yet</span>
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

          {/* Expanded subtasks - 200ms ease height animation, 1px top border, full width within card */}
          {((isOwnTask && onUpdateTaskSubtasks && (showSubtasks || (task.subtasks?.length ?? 0) > 0)) ||
            (!isOwnTask && showSubtasks && (task.subtasks?.length ?? 0) > 0)) && (
            <div
              ref={subtaskSectionRef}
              className={`transition-[max-height] duration-200 ease-out overflow-hidden ${
                showSubtasks ? 'max-h-[min(50vh,500px)]' : 'max-h-0'
              }`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div className="w-full border-t border-border-subtle pt-2 mt-2">
                {/* Reorder mode: tappable button with grip icon */}
                {isOwnTask && onUpdateTaskSubtasks && (task.subtasks?.length ?? 0) > 1 && (
                  <div className="flex items-center justify-between mb-1">
                    <button
                      type="button"
                      onClick={() => setSubtaskReorderMode((s) => !s)}
                      className={`flex items-center gap-1.5 text-[12px] py-1 -ml-1 px-1 rounded hover:bg-surface-muted transition-colors ${
                        subtaskReorderMode
                          ? 'text-primary'
                          : 'text-fg-secondary hover:text-fg-primary'
                      }`}
                    >
                      <FaGripVertical size={12} />
                      {subtaskReorderMode ? 'Done' : 'Reorder'}
                    </button>
                  </div>
                )}
                {/* Subtask list: max 5 visible (200px) then scroll + bottom fade */}
                <div className={`relative ${(task.subtasks?.length ?? 0) > 5 ? 'subtask-scroll-fade' : ''}`}>
                  <div
                    className={`flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden ${
                      (task.subtasks?.length ?? 0) > 5 ? 'max-h-[200px] subtask-scrollbar' : ''
                    }`}
                  >
                    <SortableSubtaskList
                      taskId={task.id}
                      subtasks={task.subtasks || []}
                      isOwnTask={isOwnTask}
                      taskCompleted={!!task.completed}
                      showReorderMode={subtaskReorderMode}
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
                          showReorderMode={subtaskReorderMode}
                        />
                      )}
                    />
                  </div>
                </div>
                {/* Add subtask: "+ Add subtask" → rapid entry (Enter saves + new row, Enter on empty exits) */}
                {isOwnTask && onUpdateTaskSubtasks && !task.completed && (
                  <div className="mt-1">
                    {isAddingSubtask ? (
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
                              setTimeout(() => subtaskInputRef.current?.focus(), 50);
                            } else {
                              setIsAddingSubtask(false);
                              subtaskInputRef.current?.blur();
                            }
                          } else if (e.key === 'Escape') {
                            setSubtaskInputValue('');
                            setIsAddingSubtask(false);
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
                          setIsAddingSubtask(false);
                        }}
                        placeholder=""
                        autoFocus
                        className="w-full min-w-0 px-0 py-1 text-[14px] text-fg-primary bg-transparent border-0 border-b border-primary rounded-none focus:outline-none focus:ring-0 placeholder:text-fg-tertiary"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingSubtask(true);
                          setSubtaskInputValue('');
                          setTimeout(() => subtaskInputRef.current?.focus(), 50);
                        }}
                        className="text-[13px] text-fg-tertiary hover:text-fg-secondary transition-colors py-1"
                      >
                        + Add subtask
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Metadata row - 12px icons, tertiary text, 12px gaps */}
          <div className="flex items-center gap-3 mt-1 flex-wrap text-[12px] text-fg-tertiary leading-[1.4]">
            <span className="flex items-center gap-1" suppressHydrationWarning>
              <LuClock size={12} className="flex-shrink-0" />
              {formatRelativeTime(task.createdAt)}
            </span>
            {task.completed && task.completedAt && (
              <span className="text-success flex items-center gap-1" suppressHydrationWarning>
                <LuCheck size={12} className="flex-shrink-0" />
                {formatRelativeTime(task.completedAt)}
              </span>
            )}
            {onOpenComments && (
              <button
                onClick={() => onOpenComments(task.id)}
                className="flex items-center gap-1 hover:text-fg-secondary transition-colors"
                title="View comments"
              >
                <LuMessageCircle size={12} className="flex-shrink-0" />
                {task.comments?.length ?? 0}
              </button>
            )}
            {(task.subtasks?.length ?? 0) > 0 && (
              <button
                onClick={() => setShowSubtasks((s) => !s)}
                className="flex items-center gap-1 hover:text-fg-secondary transition-colors tabular-nums"
              >
                <LuSquareCheck size={12} className="flex-shrink-0" />
                {task.subtasks!.filter((s) => s.completed).length}/{task.subtasks!.length}
                <LuChevronDown
                  size={12}
                  className={`flex-shrink-0 transition-transform duration-200 ease-out ${
                    showSubtasks ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}
            {/* Reactions - pill style with icon + count, subtle border */}
            {task.reactions && task.reactions.length > 0 && (
              <div className="flex items-center gap-1 ml-0.5">
                {Object.entries(
                  task.reactions.reduce((acc, r) => {
                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([emoji, count]) => {
                  const isHeart = /❤|💕|💗|💖|💘|♥/.test(emoji);
                  const hasUserReaction = task.reactions?.some(r => r.userId === currentUserId && r.emoji === emoji);
                  return (
                    <button
                      key={emoji}
                      onClick={() => onAddReaction?.(task.id, emoji)}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                        hasUserReaction
                          ? 'bg-primary/8 border-primary/30 text-primary'
                          : 'bg-surface-muted border-border-subtle text-fg-secondary hover:bg-surface-muted/80'
                      }`}
                      title={task.reactions?.filter(r => r.emoji === emoji).map(r => r.userName).join(', ')}
                    >
                      {isHeart ? (
                        <LuHeart size={10} className={hasUserReaction ? 'fill-current' : ''} />
                      ) : (
                        <span>{emoji}</span>
                      )}
                      <span className="tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {task.completed && onAddReaction && (
              <div className="relative z-[10000] ml-0.5">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-surface-muted transition-colors"
                  title="Add reaction"
                >
                  <FaSmile size={10} className="text-fg-tertiary" />
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

          {/* Progress bar - 3px, track=border-subtle, fill=primary. When expanded: show count + chevron */}
          {(task.subtasks?.length ?? 0) > 0 && (
            <button
              onClick={() => setShowSubtasks((s) => !s)}
              className="w-full mt-2 -mx-4 -mb-4 py-0 flex flex-col items-stretch gap-1 rounded-b-[12px] overflow-hidden"
            >
              <div className="w-full flex items-center justify-between gap-2">
                {showSubtasks && (
                  <span className="text-[12px] text-fg-tertiary tabular-nums">
                    {task.subtasks!.filter((s) => s.completed).length}/{task.subtasks!.length}
                  </span>
                )}
                <div className="flex-1 min-w-0 h-[3px] bg-border-subtle rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-primary transition-all duration-200 ease-out"
                    style={{
                      width: `${((task.subtasks?.filter((s) => s.completed).length ?? 0) / (task.subtasks?.length ?? 1)) * 100}%`,
                    }}
                  />
                </div>
                <LuChevronDown
                  size={14}
                  className={`flex-shrink-0 text-fg-tertiary transition-transform duration-200 ease-out ${
                    showSubtasks ? 'rotate-180' : ''
                  }`}
                />
              </div>
            </button>
          )}
        </div>

        {/* Visibility icon + Context Menu Button - top-right */}
        {isOwnTask && (
          <div className="absolute top-4 right-4 flex items-center gap-0.5">
            {!task.completed && (() => {
              const effVisibility = getEffectiveVisibility(task.visibility, task.isPrivate);
              const isCustom = effVisibility === 'only' || effVisibility === 'except';
              const visibleCount = task.visibilityList?.length ?? 0;
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (effVisibility === 'everyone' || effVisibility === 'private') {
                      onTogglePrivacy(task.id, effVisibility === 'everyone');
                    } else {
                      setShowVisibilitySheet(true);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowContextMenu(false);
                    setShowVisibilitySheet(true);
                  }}
                  onTouchStart={() => {
                    visibilityIconLongPressRef.current = setTimeout(() => {
                      visibilityIconLongPressRef.current = null;
                      if ('vibrate' in navigator) navigator.vibrate(10);
                      setShowContextMenu(false);
                      setShowVisibilitySheet(true);
                    }, 500);
                  }}
                  onTouchEnd={() => {
                    if (visibilityIconLongPressRef.current) {
                      clearTimeout(visibilityIconLongPressRef.current);
                      visibilityIconLongPressRef.current = null;
                    }
                  }}
                  onTouchMove={() => {
                    if (visibilityIconLongPressRef.current) {
                      clearTimeout(visibilityIconLongPressRef.current);
                      visibilityIconLongPressRef.current = null;
                    }
                  }}
                  className={`p-1.5 rounded transition-opacity opacity-30 md:opacity-0 md:group-hover:opacity-100 hover:bg-surface-muted relative ${
                    isCustom ? 'text-primary' : 'text-fg-tertiary hover:text-fg-secondary'
                  }`}
                  title={effVisibility === 'private' ? 'Private' : effVisibility === 'everyone' ? 'Everyone' : 'Custom visibility (long-press to edit)'}
                >
                  {effVisibility === 'private' ? (
                    <FaEyeSlash size={12} />
                  ) : (
                    <>
                      <FaEye size={12} />
                      {isCustom && visibleCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center text-[10px] font-medium text-on-accent bg-primary rounded-full">
                          {visibleCount}
                        </span>
                      )}
                    </>
                  )}
                </button>
              );
            })()}
            {!task.completed && <div className="w-px h-4 bg-border-subtle" />}
            <button
              ref={contextMenuAnchorRef}
              onClick={(e) => {
                e.stopPropagation();
                const rect = contextMenuAnchorRef.current?.getBoundingClientRect();
                setContextMenuAnchorRect(rect ?? null);
                setShowContextMenu(true);
                if ('vibrate' in navigator) navigator.vibrate(10);
              }}
              className="p-1.5 rounded transition-opacity text-fg-tertiary hover:text-fg-secondary opacity-30 md:opacity-0 md:group-hover:opacity-100 hover:bg-surface-muted"
              title="More options"
            >
              <FaEllipsisV size={12} />
            </button>
          </div>
        )}
        </div>
      </div>
      </div>

      {/* Schedule/Deadline Picker - Bottom Sheet */}
      {showUnifiedDatePicker && isOwnTask && !task.completed && (onUpdateDueDate || onDeferTask) && (
        <ScheduleDeadlinePicker
          isOpen={showUnifiedDatePicker}
          onClose={() => setShowUnifiedDatePicker(false)}
          activeTab={unifiedDatePickerTab}
          onTabChange={setUnifiedDatePickerTab}
          scheduledFor={task.deferredTo ?? null}
          dueDate={task.dueDate ?? null}
          onScheduleChange={(v) => onDeferTask?.(task.id, v)}
          onDeadlineChange={(v) => onUpdateDueDate?.(task.id, v)}
          onConfirm={() => {}}
        />
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
        anchorRect={contextMenuAnchorRect}
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
        onToggleCommitment={() => {
          if (onToggleCommitment) {
            onToggleCommitment(task.id, !task.committed);
          }
        }}
        onSetVisibility={onUpdateVisibility ? () => setShowVisibilitySheet(true) : undefined}
        onTogglePrivacy={() => {
          onTogglePrivacy(task.id, !task.isPrivate);
        }}
        onChangeIcon={onUpdateTaskTags ? () => setShowTagPicker(true) : undefined}
        onDelete={() => {
          onDelete(task.id);
        }}
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
        scheduledDate={recurrenceDateContext ?? task.deferredTo ?? (task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : undefined)}
      />

      {/* Visibility selector - opened from eye icon long-press or context menu "Set visibility" */}
      {isOwnTask && onUpdateVisibility && (
        <VisibilityBottomSheet
          isOpen={showVisibilitySheet}
          onClose={() => setShowVisibilitySheet(false)}
          onSelect={(visibility, visibilityList) => {
            onUpdateVisibility(task.id, visibility, visibilityList);
            setShowVisibilitySheet(false);
          }}
          currentVisibility={getEffectiveVisibility(task.visibility, task.isPrivate)}
          currentVisibilityList={task.visibilityList || []}
          showSetAsDefault={true}
        />
      )}

      {/* Tag icon picker - opened from context menu "Change icon" */}
      {isOwnTask && onUpdateTaskTags && (
        <TagIconPicker
          isOpen={showTagPicker}
          onClose={() => setShowTagPicker(false)}
          onApply={async (iconId, tintId) => {
            const tagValue = iconId === null
              ? []
              : [tintId && tintId !== 'primary' ? `${iconId}:${tintId}` : iconId];
            await onUpdateTaskTags(task.id, tagValue);
            if (iconId) await recordRecentlyUsedTag?.(iconId);
            setShowTagPicker(false);
            if ('vibrate' in navigator) navigator.vibrate(30);
          }}
          recentlyUsed={recentUsedTags}
          currentTaskIcon={task.tags?.[0]}
        />
      )}

    </>
  );
}
