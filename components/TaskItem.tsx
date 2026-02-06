'use client';

import { useState, useRef, useEffect } from 'react';
import { useSwipeable } from 'react-swipeable';
import { TaskWithUser } from '@/lib/types';
import { FaEye, FaEyeSlash, FaTrash, FaSmile, FaCalendarPlus, FaCheck, FaGripVertical } from 'react-icons/fa';
import EmojiPicker from './EmojiPicker';
import Confetti from './Confetti';
import { playSound } from '@/utils/sounds';

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
  onAddReaction?: (taskId: string, emoji: string) => void;
  onDeferTask?: (taskId: string, deferToDate: string) => void;
  currentUserId?: string;
  dragHandleProps?: DragHandleProps;
}

export default function TaskItem({ 
  task, 
  isOwnTask, 
  onToggleComplete, 
  onTogglePrivacy,
  onDelete,
  onAddReaction,
  onDeferTask,
  currentUserId,
  dragHandleProps
}: TaskItemProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeferPicker, setShowDeferPicker] = useState(false);
  const [showCompletionAnimation, setShowCompletionAnimation] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeAction, setSwipeAction] = useState<'complete' | 'delete' | null>(null);

  const handleToggleComplete = async () => {
    if (!isOwnTask) return;
    
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

  const handleDeferTask = (days: number) => {
    if (!onDeferTask) return;
    
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
    
    onDeferTask(task.id, dateStr);
    setShowDeferPicker(false);
  };

  // Swipe handlers
  const swipeHandlers = useSwipeable({
    onSwiping: (eventData) => {
      if (!isOwnTask) return;
      
      const deltaX = eventData.deltaX;
      const deltaY = eventData.deltaY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      
      // Only activate swipe if horizontal movement is significantly more than vertical
      // This prevents interference with vertical scrolling
      if (absY > absX * 0.3) {
        // More vertical than horizontal - allow scrolling, don't swipe
        setSwipeOffset(0);
        setSwipeAction(null);
        return;
      }
      
      // Prevent default to stop screen from moving
      if (eventData.event && absX > absY) {
        eventData.event.preventDefault();
      }
      
      // Only allow swipe if not already completed (for complete action) or if completed (for delete)
      if (deltaX > 0 && !task.completed) {
        // Swipe right - Complete
        setSwipeOffset(Math.min(deltaX, 100));
        setSwipeAction(absX > 50 ? 'complete' : null);
      } else if (deltaX < 0) {
        // Swipe left - Delete
        setSwipeOffset(Math.max(deltaX, -100));
        setSwipeAction(absX > 50 ? 'delete' : null);
      }
    },
    onSwiped: (eventData) => {
      if (!isOwnTask) return;
      
      const absX = Math.abs(eventData.deltaX);
      const absY = Math.abs(eventData.deltaY);
      
      // Only trigger action if it was clearly a horizontal swipe
      if (absY > absX * 0.3) {
        // Was more vertical than horizontal - cancel swipe
        setSwipeOffset(0);
        setSwipeAction(null);
        return;
      }
      
      if (absX > 120) { // Increased threshold for action (was 100)
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
      
      // Reset swipe state
      setSwipeOffset(0);
      setSwipeAction(null);
    },
    trackMouse: false, // Disable mouse swiping on desktop to avoid conflicts with drag-to-reorder
    trackTouch: true,
    preventScrollOnSwipe: false, // Allow vertical scroll to work
    delta: 20, // Require 20px movement before recognizing swipe (prevents accidental triggers)
    swipeDuration: 500, // Maximum swipe duration in ms
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
          {...(isOwnTask ? swipeHandlers : {})}
          style={{
            transform: `translateX(${swipeOffset}px)`,
            transition: swipeOffset === 0 ? 'transform 0.3s ease-out' : 'none',
          }}
          className={`bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border transition-all duration-300 hover:shadow-md ${
            task.completed 
              ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 shadow-green-100' 
              : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600'
          } ${isAnimatingOut ? 'animate-task-complete' : ''} ${
            swipeAction === 'complete' ? 'border-green-400 dark:border-green-600 bg-green-100 dark:bg-green-900/40' : ''
          } ${
            swipeAction === 'delete' ? 'border-red-400 dark:border-red-600 bg-red-100 dark:bg-red-900/40' : ''
          }`}
        >
        <div className="flex items-start gap-3">
          {/* Drag Handle - Mobile-friendly, always visible */}
          {dragHandleProps && (
            <button
              ref={dragHandleProps.ref}
              {...dragHandleProps.attributes}
              {...dragHandleProps.listeners}
              className="flex-shrink-0 p-2 -ml-2 touch-none cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors mt-0.5 min-w-[44px] min-h-[44px] flex items-center justify-center"
              title="Drag to reorder"
              style={{ touchAction: 'none' }}
            >
              <FaGripVertical size={18} />
            </button>
          )}

          <button
            onClick={handleToggleComplete}
            disabled={!isOwnTask}
            className={`min-w-[24px] min-h-[24px] w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all duration-300 mt-1 relative flex-shrink-0 ${
              task.completed 
                ? 'bg-green-500 border-green-500 scale-110 shadow-lg shadow-green-500/50' 
                : 'border-gray-300 hover:border-green-400 hover:scale-105 hover:shadow-md active:scale-95'
            } ${!isOwnTask ? 'cursor-default' : 'cursor-pointer'}`}
          >
            {task.completed && (
              <svg 
                className="w-4 h-4 text-white animate-checkmark-draw" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-semibold text-sm ${
              isOwnTask ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
            }`} suppressHydrationWarning>
              {task.userName}
            </span>
            {task.isPrivate && isOwnTask && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <FaEyeSlash size={12} /> Private
              </span>
            )}
          </div>
          
          <p className={`text-base ${
            task.completed ? 'line-through text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'
          }`} suppressHydrationWarning>
            {task.text}
          </p>
          
          {task.deferredTo && (
            <div className="mt-1 inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
              <FaCalendarPlus size={10} />
              <span>Deferred to {new Date(task.deferredTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
              {formatTime(task.createdAt)}
            </span>
            {task.completed && task.completedAt && (
              <span className="text-xs text-green-600" suppressHydrationWarning>
                ✓ {formatTime(task.completedAt)}
              </span>
            )}
            
            {/* Reactions Display */}
            {task.reactions && task.reactions.length > 0 && (
              <div className="flex items-center gap-1">
                {Object.entries(
                  task.reactions.reduce((acc, r) => {
                    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([emoji, count]) => (
                  <button
                    key={emoji}
                    onClick={() => onAddReaction?.(task.id, emoji)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                      task.reactions?.some(r => r.userId === currentUserId && r.emoji === emoji)
                        ? 'bg-blue-100 border border-blue-300'
                        : 'bg-gray-100 hover:bg-gray-200 border border-gray-300'
                    }`}
                    title={task.reactions
                      ?.filter(r => r.emoji === emoji)
                      .map(r => r.userName)
                      .join(', ')}
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span className="text-gray-600">{count}</span>}
                  </button>
                ))}
              </div>
            )}
            
            {/* Add Reaction Button - Only for completed tasks */}
            {task.completed && onAddReaction && (
              <div className="relative z-[10000]">
                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600 transition-colors"
                  title="Add reaction"
                >
                  <FaSmile size={12} className="text-gray-600 dark:text-gray-300" />
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

        {isOwnTask && (
          <div className="flex items-center gap-1">
            {/* Defer Button - Only for incomplete tasks */}
            {!task.completed && onDeferTask && (
              <div className="relative">
                <button
                  onClick={() => setShowDeferPicker(!showDeferPicker)}
                  className="p-2 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-full transition-colors min-w-[36px] min-h-[36px]"
                  title="Defer task"
                >
                  <FaCalendarPlus className="text-amber-600 dark:text-amber-500" size={16} />
                </button>
                
                {showDeferPicker && (
                  <>
                    {/* Backdrop */}
                    <div 
                      className="fixed inset-0 z-[99998]" 
                      onClick={() => setShowDeferPicker(false)}
                    />
                    
                    {/* Defer Menu - appears below the button */}
                    <div 
                      className="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-2xl p-2 z-[99999] min-w-[150px] animate-in fade-in slide-in-from-top-2 duration-200"
                    >
                      <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 px-2">Defer to:</div>
                      <button
                        onClick={() => handleDeferTask(1)}
                        className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm transition-colors text-gray-900 dark:text-gray-100"
                      >
                        Tomorrow
                      </button>
                      <button
                        onClick={() => handleDeferTask(2)}
                        className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm transition-colors text-gray-900 dark:text-gray-100"
                      >
                        In 2 days
                      </button>
                      <button
                        onClick={() => handleDeferTask(3)}
                        className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm transition-colors text-gray-900 dark:text-gray-100"
                      >
                        In 3 days
                      </button>
                      <button
                        onClick={() => handleDeferTask(7)}
                        className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm transition-colors text-gray-900 dark:text-gray-100"
                      >
                        Next week
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            
            <button
              onClick={() => onTogglePrivacy(task.id, !task.isPrivate)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors min-w-[36px] min-h-[36px]"
              title={task.isPrivate ? 'Make shared' : 'Make private'}
            >
              {task.isPrivate ? (
                <FaEyeSlash className="text-gray-500 dark:text-gray-400" size={16} />
              ) : (
                <FaEye className="text-blue-500 dark:text-blue-400" size={16} />
              )}
            </button>
            
            <button
              onClick={() => onDelete(task.id)}
              className="p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors min-w-[36px] min-h-[36px]"
              title="Delete task"
            >
              <FaTrash className="text-red-500 dark:text-red-400" size={14} />
            </button>
          </div>
        )}
        </div>
      </div>
      </div>

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
    </>
  );
}
