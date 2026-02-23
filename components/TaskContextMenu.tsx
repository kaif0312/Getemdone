'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LuPencil, LuClock, LuRepeat, LuStar, LuEye, LuEyeOff, LuTrash2, LuTag, LuUsers } from 'react-icons/lu';
import { Task } from '@/lib/types';

const MENU_WIDTH = 220;
const MENU_ITEM_HEIGHT = 44;
const MENU_PADDING = 4;
const GAP = 8;

interface TaskContextMenuProps {
  task: Task;
  isOwnTask: boolean;
  isOpen: boolean;
  /** Anchor rect of the three-dot icon (top-right of card). Used for positioning regardless of trigger. */
  anchorRect: DOMRect | null;
  onClose: () => void;
  onEdit?: () => void;
  onSetDeadline?: () => void;
  onSetRecurrence?: () => void;
  onToggleCommitment?: () => void;
  onTogglePrivacy?: () => void;
  onSetVisibility?: () => void;
  onChangeIcon?: () => void;
  onDelete?: () => void;
  isCommitted?: boolean;
  isPrivate?: boolean;
  showRecurrenceForCompleted?: boolean;
}

export default function TaskContextMenu({
  task,
  isOwnTask,
  isOpen,
  anchorRect,
  onClose,
  onEdit,
  onSetDeadline,
  onSetRecurrence,
  onToggleCommitment,
  onTogglePrivacy,
  onSetVisibility,
  onChangeIcon,
  onDelete,
  isCommitted = false,
  isPrivate = false,
  showRecurrenceForCompleted = false,
}: TaskContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 100);
  }, [onClose]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleClose]);

  const wrapAction = (fn?: () => void) => {
    return () => {
      fn?.();
      handleClose();
    };
  };

  if (!isOpen || !isOwnTask) return null;

  const itemClass = 'w-full flex items-center gap-3 px-[14px] min-h-[44px] text-left text-[14px] font-normal text-fg-primary rounded-lg transition-colors hover:bg-primary/[0.06] active:bg-primary/[0.06]';
  const iconClass = 'text-fg-secondary shrink-0';
  const iconSize = 18;

  const menuContent = (
    <>
      {onEdit && !task.completed && (
        <button onClick={wrapAction(onEdit)} className={itemClass}>
          <LuPencil size={iconSize} className={iconClass} strokeWidth={1.5} />
          Edit task
        </button>
      )}
      {onSetDeadline && !task.completed && (
        <button onClick={wrapAction(onSetDeadline)} className={itemClass}>
          <LuClock size={iconSize} className={iconClass} strokeWidth={1.5} />
          {task.dueDate || task.deferredTo ? 'Schedule & deadline' : 'Schedule or set deadline'}
        </button>
      )}
      {onSetRecurrence && (!task.completed || showRecurrenceForCompleted) && (
        <button onClick={wrapAction(onSetRecurrence)} className={itemClass}>
          <LuRepeat size={iconSize} className={iconClass} strokeWidth={1.5} />
          {task.recurrence ? 'Change recurrence' : 'Set recurrence'}
        </button>
      )}
      {onToggleCommitment && !task.completed && (
        <button onClick={wrapAction(onToggleCommitment)} className={itemClass}>
          <LuStar size={iconSize} className={iconClass} strokeWidth={1.5} />
          {isCommitted ? 'Remove commitment' : 'Commit to complete'}
        </button>
      )}
      {onSetVisibility && !task.completed && (
        <button onClick={wrapAction(onSetVisibility)} className={itemClass}>
          <LuUsers size={iconSize} className={iconClass} strokeWidth={1.5} />
          Set visibility
        </button>
      )}
      {onTogglePrivacy && !task.completed && (
        <button onClick={wrapAction(onTogglePrivacy)} className={itemClass}>
          {isPrivate ? (
            <LuEyeOff size={iconSize} className={iconClass} strokeWidth={1.5} />
          ) : (
            <LuEye size={iconSize} className={iconClass} strokeWidth={1.5} />
          )}
          {isPrivate ? 'Make shared' : 'Make private'}
        </button>
      )}
      {onChangeIcon && !task.completed && (
        <button onClick={wrapAction(onChangeIcon)} className={itemClass}>
          <LuTag size={iconSize} className={iconClass} strokeWidth={1.5} />
          Change icon
        </button>
      )}
      {onDelete && (
        <>
          <div className="border-t border-border-subtle mt-1 mb-1" aria-hidden="true" />
          <button
            onClick={wrapAction(onDelete)}
            className="w-full flex items-center gap-3 px-[14px] min-h-[44px] text-left text-[14px] font-normal text-error rounded-lg transition-colors active:bg-error/10"
          >
            <LuTrash2 size={iconSize} className="text-error shrink-0" strokeWidth={1.5} />
            Delete task
          </button>
        </>
      )}
    </>
  );

  if (isMobile) {
    return (
      <>
        <div
          className={`fixed inset-0 z-[99998] transition-opacity duration-100 ${
            isClosing ? 'opacity-0' : 'opacity-100'
          }`}
          style={{
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
          onClick={handleClose}
          aria-hidden="true"
        />
        <div
          ref={menuRef}
          className={`fixed inset-x-0 bottom-0 z-[99999] bg-elevated rounded-t-xl border-t border-border-subtle p-1 ${
            isClosing
              ? 'translate-y-full transition-transform duration-100 ease-out'
              : 'animate-in slide-in-from-bottom duration-200'
          }`}
          style={{
            boxShadow: '0 4px 16px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.1)',
            paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
          }}
        >
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 rounded-full bg-fg-tertiary/30" />
          </div>
          <div className="px-1 pb-2">{menuContent}</div>
        </div>
      </>
    );
  }

  // Desktop: floating dropdown anchored to three-dot (top-right of anchor rect)
  const rect = anchorRect ?? (typeof window !== 'undefined'
    ? { right: window.innerWidth - 16, bottom: 80 } as DOMRect
    : null);
  const itemCount = [
    onEdit && !task.completed,
    onSetDeadline && !task.completed,
    onSetRecurrence && (!task.completed || showRecurrenceForCompleted),
    onToggleCommitment && !task.completed,
    onTogglePrivacy && !task.completed,
    onChangeIcon && !task.completed,
    onDelete,
  ].filter(Boolean).length;
  const menuHeight = itemCount * MENU_ITEM_HEIGHT + MENU_PADDING * 2 + (onDelete ? GAP + 1 : 0);

  let left = rect ? rect.right - MENU_WIDTH : 0;
  let top = rect ? rect.bottom + 8 : 0;
  let transformOrigin = 'top right';

  if (typeof window !== 'undefined') {
    if (left + MENU_WIDTH > window.innerWidth - 10) {
      left = rect ? rect.right - MENU_WIDTH : window.innerWidth - MENU_WIDTH - 10;
    }
    if (left < 10) left = 10;

    if (top + menuHeight > window.innerHeight - 10) {
      top = rect ? rect.top - menuHeight - 8 : window.innerHeight - menuHeight - 10;
      transformOrigin = 'bottom right';
    }
    if (top < 10) top = 10;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[99998] bg-transparent"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        ref={menuRef}
        className={`fixed z-[99999] bg-elevated rounded-xl border border-border-subtle p-1 min-w-[220px] ${
          isClosing ? 'animate-context-menu-out' : 'animate-context-menu-in'
        }`}
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: MENU_WIDTH,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2), 0 1px 4px rgba(0,0,0,0.1)',
          transformOrigin,
        }}
      >
        {menuContent}
      </div>
    </>
  );
}
