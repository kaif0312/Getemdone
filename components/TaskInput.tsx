'use client';

import { useState, useRef, useEffect } from 'react';
import { FaEye, FaEyeSlash, FaPaperPlane, FaListUl, FaCalendar, FaTimes, FaClock } from 'react-icons/fa';
import TaskTemplates from './TaskTemplates';
import VoiceButton from './VoiceButton';
import RecurrenceChip from './RecurrenceChip';
import ScheduleDeadlinePicker from './ScheduleDeadlinePicker';
import RecurrenceBottomSheet from './RecurrenceBottomSheet';
import { Recurrence } from '@/lib/types';
import { parseRecurrenceFromText } from '@/utils/recurrence';
import { getTodayString } from '@/utils/taskFilter';

interface TaskInputProps {
  onAddTask: (text: string, isPrivate: boolean, dueDate?: number | null, scheduledFor?: string | null, recurrence?: Recurrence | null) => Promise<void>;
  disabled?: boolean;
  recentTasks?: string[];
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function TaskInput({ onAddTask, disabled = false, recentTasks = [], inputRef: externalInputRef }: TaskInputProps) {
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [dueDate, setDueDate] = useState<number | null>(null);
  const [scheduledFor, setScheduledFor] = useState<string | null>(null); // YYYY-MM-DD format
  const [showUnifiedPicker, setShowUnifiedPicker] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'deadline'>('schedule');
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null);
  const [showRecurrenceSheet, setShowRecurrenceSheet] = useState(false);
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (text.trim() && !disabled) {
      try {
        await onAddTask(text.trim(), isPrivate, dueDate, scheduledFor, recurrence);
        setText('');
        setDueDate(null);
        setScheduledFor(null);
        setRecurrence(null);
        setShowUnifiedPicker(false);
        inputRef.current?.focus();
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

            {/* Visibility Toggle - 20px, secondary */}
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              disabled={disabled}
              className="p-2 text-fg-secondary hover:text-fg-primary transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              title={isPrivate ? 'Private (only you can see)' : 'Shared (friends can see)'}
            >
              {isPrivate ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
            </button>

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

          <RecurrenceBottomSheet
            isOpen={showRecurrenceSheet}
            onClose={() => setShowRecurrenceSheet(false)}
            onSelect={(r) => setRecurrence(r)}
            onRemove={recurrence ? () => setRecurrence(null) : undefined}
            currentRecurrence={recurrence}
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
