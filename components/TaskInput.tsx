'use client';

import { useState, useRef, useEffect } from 'react';
import { FaEye, FaEyeSlash, FaPaperPlane, FaListUl, FaCalendar, FaTimes, FaClock } from 'react-icons/fa';
import TaskTemplates from './TaskTemplates';
import VoiceButton from './VoiceButton';
import RecurrenceChip from './RecurrenceChip';
import ScheduleDeadlinePicker from './ScheduleDeadlinePicker';
import RecurrenceBottomSheet from './RecurrenceBottomSheet';
import VisibilityBottomSheet from './VisibilityBottomSheet';
import { Recurrence, TaskVisibility } from '@/lib/types';
import { parseRecurrenceFromText } from '@/utils/recurrence';
import { getTodayString } from '@/utils/taskFilter';

const VISIBILITY_TOOLTIP_SHOWN_KEY = 'visibility_tooltip_shown';
const VISIBILITY_EYE_INTERACTED_KEY = 'visibility_eye_interacted';
const VISIBILITY_PRIVATE_NUDGE_COUNT_KEY = 'visibility_private_nudge_count';
const VISIBILITY_FEATURE_SHIP_MS = new Date('2025-02-23').getTime(); // Feature ship date — NEW badge shows for 3 days

interface TaskInputProps {
  onAddTask: (text: string, visibility: TaskVisibility, visibilityList: string[], dueDate?: number | null, scheduledFor?: string | null, recurrence?: Recurrence | null) => Promise<void>;
  disabled?: boolean;
  recentTasks?: string[];
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** User's default visibility (from "Set as default for new tasks") - used when input bar loads */
  defaultVisibility?: TaskVisibility;
  defaultVisibilityList?: string[];
}

export default function TaskInput({ onAddTask, disabled = false, recentTasks = [], inputRef: externalInputRef, defaultVisibility, defaultVisibilityList }: TaskInputProps) {
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<TaskVisibility>('everyone');
  const [visibilityList, setVisibilityList] = useState<string[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [dueDate, setDueDate] = useState<number | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null); // YYYY-MM-DD format
  const [showUnifiedPicker, setShowUnifiedPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'deadline'>('schedule');
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const [showRecurrenceSheet, setShowRecurrenceSheet] = useState(false);
  const [showVisibilitySheet, setShowVisibilitySheet] = useState(false);
  const [visibilityAnchorRect, setVisibilityAnchorRect] = useState<DOMRect | null>(null);
  const [showFirstTaskTooltip, setShowFirstTaskTooltip] = useState(false);
  const [showPrivateNudge, setShowPrivateNudge] = useState(false);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const eyeIconRef = useRef<HTMLButtonElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressFiredRef = useRef(false);

  // Load visibility from user defaults when they become available
  useEffect(() => {
    if (defaultVisibility) {
      setVisibility(defaultVisibility);
      setVisibilityList(defaultVisibilityList ?? []);
    }
  }, [defaultVisibility, defaultVisibilityList]);

  // NEW badge: first 3 days after feature ships, disappears on first eye interaction
  const [showNewBadge, setShowNewBadge] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (localStorage.getItem(VISIBILITY_EYE_INTERACTED_KEY)) return false;
    if (Date.now() - VISIBILITY_FEATURE_SHIP_MS > 3 * 24 * 60 * 60 * 1000) return false;
    return true;
  });

  const markEyeInteracted = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(VISIBILITY_EYE_INTERACTED_KEY, '1');
      setShowNewBadge(false);
    }
  };

  // Dismiss first-task tooltip on any tap (document listener)
  useEffect(() => {
    if (!showFirstTaskTooltip) return;
    const dismiss = () => {
      setShowFirstTaskTooltip(false);
      if (typeof window !== 'undefined') localStorage.setItem(VISIBILITY_TOOLTIP_SHOWN_KEY, 'true');
    };
    const t = setTimeout(dismiss, 5000);
    const onTap = () => {
      dismiss();
      document.removeEventListener('click', onTap);
      document.removeEventListener('touchstart', onTap);
    };
    document.addEventListener('click', onTap);
    document.addEventListener('touchstart', onTap);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onTap);
      document.removeEventListener('touchstart', onTap);
    };
  }, [showFirstTaskTooltip]);

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (text.trim() && !disabled) {
      try {
        await onAddTask(text.trim(), visibility, visibilityList, dueDate, scheduledFor, recurrence);
        setText('');
        setDueDate(null);
        setScheduledFor(null);
        setRecurrence(null);
        setShowUnifiedPicker(false);
        // Visibility persists for batch creation
        inputRef.current?.focus();
        // First-time tooltip: show after first task created (progressive disclosure)
        if (typeof window !== 'undefined' && !localStorage.getItem(VISIBILITY_TOOLTIP_SHOWN_KEY)) {
          setShowFirstTaskTooltip(true);
        }
      } catch (error: any) {
        console.error('Error adding task:', error);
        const errorMessage = error.message || 'Failed to add task. Please try again.';
        alert(errorMessage);
        // Don't clear input on error so user can retry
      }
    }
  };

  const handleOpenUnifiedPicker = () => {
    // Set active tab based on what's already set
    if (scheduledFor && !dueDate) {
      setActiveTab('schedule');
    } else if (dueDate && !scheduledFor) {
      setActiveTab('deadline');
    } else {
      setActiveTab('schedule'); // Default to schedule
    }
    setShowUnifiedPicker(true);
  };

  const handleSelectTemplate = (templateText: string) => {
    setText(templateText);
    inputRef.current?.focus();
  };

  // Parse recurrence from text as user types
  const handleTextChange = (value: string) => {
    const parsed = parseRecurrenceFromText(value);
    if (parsed) {
      setRecurrence(parsed.recurrence);
      setText(parsed.cleanedText);
    } else {
      setText(value);
    }
  };

  // Parse recurrence when voice input is received
  const handleVoiceTranscript = (transcript: string) => {
    const parsed = parseRecurrenceFromText(transcript);
    if (parsed) {
      setRecurrence(parsed.recurrence);
      setText(parsed.cleanedText);
    } else {
      setText(transcript);
    }
  };

  // Close unified picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showUnifiedPicker) {
        if (!target.closest('.unified-picker-container')) {
          setShowUnifiedPicker(false);
        }
      }
    };

    if (showUnifiedPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showUnifiedPicker]);

  return (
    <>
      <form 
        onSubmit={handleSubmit} 
        className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border-subtle z-50 dark:shadow-none shadow-elevation-top"
        style={{ 
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)',
          paddingTop: '8px',
          maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px))',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div className="max-w-3xl mx-auto" style={{ width: '100%', maxWidth: '100%' }}>
          <div className="flex items-center gap-2 flex-nowrap w-full">
            {/* Templates - desktop only, 20px secondary */}
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              disabled={disabled}
              className="hidden md:flex p-2 text-fg-secondary hover:text-fg-primary transition-colors flex-shrink-0 disabled:opacity-50"
              title="Quick Templates"
            >
              <FaListUl size={20} />
            </button>

            {/* Calendar - 20px, secondary, left of input */}
            <div className="relative unified-picker-container flex-shrink-0">
              <button
                type="button"
                onClick={handleOpenUnifiedPicker}
                disabled={disabled}
                className="p-2 text-fg-secondary hover:text-fg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  scheduledFor && dueDate
                    ? 'Schedule & Deadline'
                    : scheduledFor
                    ? 'Scheduled'
                    : dueDate
                    ? 'Deadline set'
                    : 'Schedule or set deadline'
                }
              >
                {scheduledFor ? (
                  <FaClock size={20} />
                ) : (
                  <FaCalendar size={20} />
                )}
                {scheduledFor && dueDate && (
                  <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-primary rounded-full" />
                )}
              </button>
              
              {/* Schedule/Deadline Picker - Bottom Sheet */}
              <ScheduleDeadlinePicker
                isOpen={showUnifiedPicker}
                onClose={() => setShowUnifiedPicker(false)}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                scheduledFor={scheduledFor}
                dueDate={dueDate}
                onScheduleChange={setScheduledFor}
                onDeadlineChange={setDueDate}
                onConfirm={() => {}}
              />
            </div>

            {/* Visibility Selector - tap: Everyone↔Private, long-press/right-click: full selector */}
            <div className="relative flex-shrink-0">
              <button
                ref={eyeIconRef}
                type="button"
                onClick={() => {
                  markEyeInteracted();
                  if (showFirstTaskTooltip) {
                    setShowFirstTaskTooltip(false);
                    if (typeof window !== 'undefined') localStorage.setItem(VISIBILITY_TOOLTIP_SHOWN_KEY, 'true');
                  }
                  if (longPressFiredRef.current) {
                    longPressFiredRef.current = false;
                    return;
                  }
                  if (visibility === 'everyone' || (visibility === 'only' || visibility === 'except')) {
                    setVisibility('private');
                    setVisibilityList([]);
                    // Contextual nudge: first 2 times they toggle to private
                    const count = parseInt(localStorage.getItem(VISIBILITY_PRIVATE_NUDGE_COUNT_KEY) || '0', 10);
                    if (count < 2) {
                      localStorage.setItem(VISIBILITY_PRIVATE_NUDGE_COUNT_KEY, String(count + 1));
                      setShowPrivateNudge(true);
                      setTimeout(() => setShowPrivateNudge(false), 3000);
                    }
                  } else {
                    setVisibility('everyone');
                    setVisibilityList([]);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  markEyeInteracted();
                  if (showFirstTaskTooltip) {
                    setShowFirstTaskTooltip(false);
                    if (typeof window !== 'undefined') localStorage.setItem(VISIBILITY_TOOLTIP_SHOWN_KEY, 'true');
                  }
                  setVisibilityAnchorRect(eyeIconRef.current?.getBoundingClientRect() ?? null);
                  setShowVisibilitySheet(true);
                }}
                onTouchStart={() => {
                  longPressFiredRef.current = false;
                  longPressTimerRef.current = setTimeout(() => {
                    longPressTimerRef.current = null;
                    longPressFiredRef.current = true;
                    markEyeInteracted();
                    if (showFirstTaskTooltip) {
                      setShowFirstTaskTooltip(false);
                      if (typeof window !== 'undefined') localStorage.setItem(VISIBILITY_TOOLTIP_SHOWN_KEY, 'true');
                    }
                    if ('vibrate' in navigator) navigator.vibrate(10);
                    setVisibilityAnchorRect(eyeIconRef.current?.getBoundingClientRect() ?? null);
                    setShowVisibilitySheet(true);
                  }, 500);
                }}
                onTouchEnd={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onTouchMove={() => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onPointerDown={(e) => {
                  if (e.pointerType === 'mouse' && e.button === 0) {
                    longPressFiredRef.current = false;
                    const onDocPointerUp = () => {
                      if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                      }
                      document.removeEventListener('pointerup', onDocPointerUp);
                    };
                    document.addEventListener('pointerup', onDocPointerUp);
                    longPressTimerRef.current = setTimeout(() => {
                      longPressTimerRef.current = null;
                      document.removeEventListener('pointerup', onDocPointerUp);
                      longPressFiredRef.current = true;
                      markEyeInteracted();
                      setShowFirstTaskTooltip(false);
                      if (typeof window !== 'undefined') localStorage.setItem(VISIBILITY_TOOLTIP_SHOWN_KEY, 'true');
                      if ('vibrate' in navigator) navigator.vibrate(10);
                      setVisibilityAnchorRect(eyeIconRef.current?.getBoundingClientRect() ?? null);
                      setShowVisibilitySheet(true);
                    }, 500);
                  }
                }}
                onPointerUp={(e) => {
                  if (e.pointerType === 'mouse' && longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                onPointerLeave={(e) => {
                  if (e.pointerType === 'mouse' && longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                }}
                disabled={disabled}
                className={`p-2 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed relative ${
                  visibility === 'private'
                    ? 'text-fg-tertiary hover:text-fg-secondary'
                    : visibility === 'only' || visibility === 'except'
                    ? 'text-primary hover:text-primary/90'
                    : 'text-fg-tertiary hover:text-fg-secondary'
                }`}
                title={visibility === 'private' ? 'Private' : visibility === 'everyone' ? 'Everyone' : 'Custom visibility (hold for more)'}
              >
                {visibility === 'private' ? (
                  <FaEyeSlash size={20} />
                ) : (
                  <>
                    <FaEye size={20} />
                    {(visibility === 'only' || visibility === 'except') && visibilityList.length > 0 && (
                      <span className="absolute top-1 right-1 w-[4px] h-[4px] bg-primary rounded-full" />
                    )}
                  </>
                )}
                {showNewBadge && (
                  <span className="absolute -top-0.5 -right-0.5 px-1.5 py-0.5 text-[8px] font-semibold text-white bg-primary rounded-full leading-none">
                    NEW
                  </span>
                )}
              </button>
              {showFirstTaskTooltip && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[99999] animate-in fade-in duration-200"
                  style={{ pointerEvents: 'none' }}
                >
                  <div
                    className="relative bg-elevated border border-border-subtle shadow-elevation-2"
                    style={{ borderRadius: 8, padding: '8px 12px' }}
                  >
                    <p className="text-[13px] text-fg-primary font-medium">New: Control who sees your tasks</p>
                    <p className="text-[11px] text-fg-secondary mt-0.5">Tap to toggle · Hold for options</p>
                    <div
                      className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-0 h-0"
                      style={{
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: '6px solid var(--color-bg-elevated)',
                        filter: 'drop-shadow(0 1px 0 var(--color-border-subtle))',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            <VisibilityBottomSheet
              isOpen={showVisibilitySheet}
              onClose={() => setShowVisibilitySheet(false)}
              onSelect={(v, list) => {
                setVisibility(v);
                setVisibilityList(list);
                setShowVisibilitySheet(false);
              }}
              currentVisibility={visibility}
              currentVisibilityList={visibilityList}
              showSetAsDefault={true}
              anchorRect={typeof window !== 'undefined' && window.innerWidth >= 768 ? visibilityAnchorRect : null}
            />

            {/* Voice - matches icon styling when idle */}
            <div className="flex-shrink-0">
              <VoiceButton onTranscript={handleVoiceTranscript} disabled={disabled} variant="ghost" />
            </div>

            {/* Input with send inside - pill shape, recessed well */}
            <div className="flex-1 min-w-0 relative flex items-center">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => handleTextChange(e.target.value)}
                placeholder="Add a task..."
                disabled={disabled}
                className="w-full min-w-0 py-2.5 pl-4 pr-12 text-sm text-fg-primary placeholder:text-fg-tertiary bg-background rounded-[24px] focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-surface-muted disabled:cursor-not-allowed"
              />
              {/* Send - inside input right, 32px circle, primary, only when text */}
              {text.trim() && (
                <button
                  type="submit"
                  disabled={disabled}
                  className="absolute right-1 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Add task"
                >
                  <FaPaperPlane size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Recurrence chip - shown when recurrence is set */}
          {recurrence && (
            <RecurrenceChip
              recurrence={recurrence}
              onEdit={() => setShowRecurrenceSheet(true)}
              onRemove={() => setRecurrence(null)}
            />
          )}

          {/* Contextual nudge: when toggling to private (first 2 times) */}
          {showPrivateNudge && (
            <p className="mt-2 text-[12px] text-fg-secondary animate-in fade-in duration-200">
              Tip: Hold the eye icon to share with select friends
            </p>
          )}

          <RecurrenceBottomSheet
            isOpen={showRecurrenceSheet}
            onClose={() => setShowRecurrenceSheet(false)}
            onSelect={(r) => setRecurrence(r)}
            onRemove={recurrence ? () => setRecurrence(null) : undefined}
            currentRecurrence={recurrence}
            scheduledDate={scheduledFor ?? undefined}
          />
        </div>
      </form>

      {/* Templates Modal */}
      {showTemplates && (
        <TaskTemplates
          onSelectTemplate={handleSelectTemplate}
          onClose={() => setShowTemplates(false)}
          recentTasks={recentTasks}
        />
      )}
    </>
  );
}
