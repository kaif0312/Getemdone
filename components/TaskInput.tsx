'use client';

import { useState, useRef, useEffect } from 'react';
import { FaEye, FaEyeSlash, FaPaperPlane, FaListUl, FaCalendar, FaTimes, FaClock } from 'react-icons/fa';
import TaskTemplates from './TaskTemplates';
import VoiceButton from './VoiceButton';

interface TaskInputProps {
  onAddTask: (text: string, isPrivate: boolean, dueDate?: number | null, scheduledFor?: string | null) => Promise<void>;
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
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef || internalInputRef;
  const dateInputRef = useRef<HTMLInputElement>(null);
  const scheduleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (text.trim() && !disabled) {
      try {
        await onAddTask(text.trim(), isPrivate, dueDate, scheduledFor);
        setText('');
        setDueDate(null);
        setScheduledFor(null);
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

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      // Convert date string to timestamp
      const date = new Date(value);
      setDueDate(date.getTime());
      // Don't auto-close - let user see the selected date and manually close
    } else {
      setDueDate(null);
    }
  };

  const clearDueDate = () => {
    setDueDate(null);
    if (dateInputRef.current) {
      dateInputRef.current.value = '';
    }
  };

  const getTomorrowDate = (): string => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  };

  const getTomorrowDateTime = (): string => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // Default to 9:00 AM
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    const hours = String(tomorrow.getHours()).padStart(2, '0');
    const minutes = String(tomorrow.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const getLaterTodayDateTime = (): string => {
    const later = new Date();
    // Set to 1 hour from now, rounded to nearest 15 minutes
    later.setHours(later.getHours() + 1);
    later.setMinutes(Math.ceil(later.getMinutes() / 15) * 15, 0, 0);
    const year = later.getFullYear();
    const month = String(later.getMonth() + 1).padStart(2, '0');
    const day = String(later.getDate()).padStart(2, '0');
    const hours = String(later.getHours()).padStart(2, '0');
    const minutes = String(later.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const getMinDateTime = (): string => {
    // Allow scheduling from current time onwards (same day or future)
    const now = new Date();
    // Round up to next 5 minutes
    now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleScheduleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value) {
      setScheduledFor(value);
    } else {
      setScheduledFor(null);
    }
  };

  const clearSchedule = () => {
    setScheduledFor(null);
    if (scheduleInputRef.current) {
      scheduleInputRef.current.value = '';
    }
  };

  const scheduleForTomorrow = () => {
    setScheduledFor(getTomorrowDateTime());
  };

  const scheduleForLaterToday = () => {
    setScheduledFor(getLaterTodayDateTime());
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
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50"
        style={{ 
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 0px)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 0px)',
          maxHeight: 'calc(100vh - env(safe-area-inset-top, 0px))',
        }}
      >
        {/* Mobile: Compact single row with essential buttons */}
        <div className="max-w-3xl mx-auto px-2 sm:px-3 py-2.5 md:p-4" style={{ 
          width: '100%', 
          maxWidth: '100%',
          paddingLeft: 'max(env(safe-area-inset-left, 0px), 0.5rem)',
          paddingRight: 'max(env(safe-area-inset-right, 0px), 0.5rem)',
        }}>
          <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 flex-nowrap w-full">
            {/* Templates - Hidden on mobile, shown on desktop */}
            <button
              type="button"
              onClick={() => setShowTemplates(true)}
              disabled={disabled}
              className="hidden md:flex p-2.5 md:p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors min-w-[40px] min-h-[40px] md:min-w-[44px] md:min-h-[44px] items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
              title="Quick Templates"
            >
              <FaListUl size={16} className="md:w-[18px] md:h-[18px]" />
            </button>

            {/* Voice Button - Smaller on mobile */}
            <div className="flex-shrink-0">
              <VoiceButton
                onTranscript={(transcript) => {
                  console.log('TaskInput received transcript:', transcript);
                  setText(transcript);
                }}
                disabled={disabled}
              />
            </div>

            {/* Input - Main focus */}
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type or speak a task..."
              disabled={disabled}
              className="flex-1 min-w-0 px-2 sm:px-3 py-2 sm:py-2.5 md:px-4 md:py-3 text-sm md:text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
            />
          
            {/* Unified Date & Schedule Button - Always visible */}
            <div className="relative unified-picker-container flex-shrink-0">
              <button
                type="button"
                onClick={handleOpenUnifiedPicker}
                disabled={disabled}
                className={`p-2 md:p-2.5 md:p-3 rounded-full transition-colors min-w-[36px] min-h-[36px] md:min-w-[44px] md:min-h-[44px] flex items-center justify-center relative ${
                  scheduledFor
                    ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 hover:bg-purple-200 dark:hover:bg-purple-900/70'
                    : dueDate
                    ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/70'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                style={{ display: 'flex' }}
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
                {/* Show clock icon if scheduled, calendar if deadline, calendar if both */}
                {scheduledFor ? (
                  <FaClock size={14} className="md:w-[18px] md:h-[18px]" />
                ) : (
                  <FaCalendar size={14} className="md:w-[18px] md:h-[18px]" />
                )}
                {/* Indicator dot if both are set */}
                {scheduledFor && dueDate && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full border border-white dark:border-gray-800" />
                )}
              </button>
              
              {/* Unified Picker Modal */}
              {showUnifiedPicker && (
                <>
                  <div 
                    className="fixed inset-0 z-[99998]" 
                    onClick={() => setShowUnifiedPicker(false)}
                  />
                  <div className="fixed inset-x-4 bottom-20 md:absolute md:bottom-full md:mb-2 md:right-0 md:inset-x-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-4 z-[99999] min-w-[280px] max-w-[calc(100vw-2rem)] md:max-w-none max-h-[80vh] overflow-y-auto">
                    {/* Tabs */}
                    <div className="flex gap-2 mb-4 border-b border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => setActiveTab('schedule')}
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${
                          activeTab === 'schedule'
                            ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                      >
                        Schedule
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('deadline')}
                        className={`flex-1 py-2 text-sm font-medium transition-colors ${
                          activeTab === 'deadline'
                            ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-600 dark:border-amber-400'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                      >
                        Deadline
                      </button>
                    </div>

                    {/* Schedule Tab */}
                    {activeTab === 'schedule' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Schedule Task</span>
                          {scheduledFor && (
                            <button
                              type="button"
                              onClick={clearSchedule}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                              title="Remove schedule"
                            >
                              <FaTimes size={12} className="text-gray-500 dark:text-gray-400" />
                            </button>
                          )}
                        </div>
                        
                        {/* Quick action buttons */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={scheduleForLaterToday}
                            className="flex-1 px-3 py-2.5 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-lg transition-all font-medium text-sm shadow-sm active:scale-[0.98]"
                          >
                            📅 Later Today
                          </button>
                          <button
                            type="button"
                            onClick={scheduleForTomorrow}
                            className="flex-1 px-3 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-lg transition-all font-medium text-sm shadow-sm active:scale-[0.98]"
                          >
                            🌅 Tomorrow
                          </button>
                        </div>
                        
                        <div className="text-xs text-gray-500 dark:text-gray-400 text-center">or choose date & time</div>
                        
                        <input
                          ref={scheduleInputRef}
                          type="datetime-local"
                          onChange={handleScheduleChange}
                          min={getMinDateTime()}
                          defaultValue={scheduledFor || ''}
                          className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                        />
                        {scheduledFor && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            {(() => {
                              try {
                                const dateTime = scheduledFor.includes('T') 
                                  ? new Date(scheduledFor) 
                                  : new Date(scheduledFor + 'T00:00:00');
                                return dateTime.toLocaleDateString('en-US', { 
                                  weekday: 'short',
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                });
                              } catch {
                                return scheduledFor;
                              }
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Deadline Tab */}
                    {activeTab === 'deadline' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Deadline</span>
                          {dueDate && (
                            <button
                              type="button"
                              onClick={clearDueDate}
                              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                              title="Remove deadline"
                            >
                              <FaTimes size={12} className="text-gray-500 dark:text-gray-400" />
                            </button>
                          )}
                        </div>
                        <input
                          ref={dateInputRef}
                          type="datetime-local"
                          onChange={handleDateChange}
                          min={new Date().toISOString().slice(0, 16)}
                          defaultValue={dueDate ? new Date(dueDate).toISOString().slice(0, 16) : ''}
                          className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 dark:focus:ring-amber-400"
                        />
                        {dueDate && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            {new Date(dueDate).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setShowUnifiedPicker(false)}
                      className="w-full mt-4 px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Privacy Toggle - Smaller on mobile */}
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              disabled={disabled}
              className={`p-2 md:p-2.5 md:p-3 rounded-full transition-colors min-w-[36px] min-h-[36px] md:min-w-[44px] md:min-h-[44px] flex items-center justify-center flex-shrink-0 ${
                isPrivate 
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600' 
                  : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/70'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={isPrivate ? 'Private (only you can see)' : 'Shared (friends can see)'}
            >
              {isPrivate ? <FaEyeSlash size={14} className="md:w-[20px] md:h-[20px]" /> : <FaEye size={14} className="md:w-[20px] md:h-[20px]" />}
            </button>
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={!text.trim() || disabled}
              className="bg-blue-600 dark:bg-blue-500 text-white p-2 md:p-2.5 md:p-3 rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed min-w-[36px] min-h-[36px] md:min-w-[44px] md:min-h-[44px] flex items-center justify-center flex-shrink-0"
            >
              <FaPaperPlane size={14} className="md:w-[18px] md:h-[18px]" />
            </button>
          </div>
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
