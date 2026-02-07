'use client';

import { useState, useRef, useEffect } from 'react';
import { FaEye, FaEyeSlash, FaPaperPlane, FaListUl, FaCalendar, FaTimes } from 'react-icons/fa';
import TaskTemplates from './TaskTemplates';
import VoiceButton from './VoiceButton';

interface TaskInputProps {
  onAddTask: (text: string, isPrivate: boolean, dueDate?: number | null) => void;
  disabled?: boolean;
  recentTasks?: string[];
}

export default function TaskInput({ onAddTask, disabled = false, recentTasks = [] }: TaskInputProps) {
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [dueDate, setDueDate] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (text.trim() && !disabled) {
      try {
        await onAddTask(text.trim(), isPrivate, dueDate);
        setText('');
        setDueDate(null);
        setShowDatePicker(false);
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

  const handleSelectTemplate = (templateText: string) => {
    setText(templateText);
    inputRef.current?.focus();
  };

  // Close date picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showDatePicker && dateInputRef.current && !dateInputRef.current.contains(e.target as Node)) {
        const target = e.target as HTMLElement;
        if (!target.closest('.date-picker-container')) {
          setShowDatePicker(false);
        }
      }
    };

    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showDatePicker]);

  return (
    <>
      <form 
        onSubmit={handleSubmit} 
        className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 shadow-lg"
      >
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTemplates(true)}
            disabled={disabled}
            className="p-3 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            title="Quick Templates"
          >
            <FaListUl size={18} />
          </button>

          <VoiceButton
            onTranscript={(transcript) => {
              console.log('TaskInput received transcript:', transcript);
              setText(transcript);
            }}
            disabled={disabled}
          />

          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or speak a task..."
            disabled={disabled}
            className="flex-1 px-4 py-3 text-base text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
          />
        
        {/* Due Date Button - Minimal, only shows when set */}
        <div className="relative date-picker-container">
          <button
            type="button"
            onClick={() => setShowDatePicker(!showDatePicker)}
            disabled={disabled}
            className={`p-3 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
              dueDate
                ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/70'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={dueDate ? 'Change deadline' : 'Set deadline'}
          >
            <FaCalendar size={18} />
          </button>
          
          {/* Minimal Date Picker Popup */}
          {showDatePicker && (
            <>
              <div 
                className="fixed inset-0 z-[99998]" 
                onClick={() => setShowDatePicker(false)}
              />
              <div className="absolute bottom-full mb-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3 z-[99999] min-w-[200px]">
                <div className="flex items-center justify-between mb-2">
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
                  className="w-full px-3 py-2 text-sm text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 mb-2"
                />
                {dueDate && (
                  <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(dueDate).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowDatePicker(false)}
                  className="w-full px-3 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsPrivate(!isPrivate)}
          disabled={disabled}
          className={`p-3 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center ${
            isPrivate 
              ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600' 
              : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/70'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={isPrivate ? 'Private (only you can see)' : 'Shared (friends can see)'}
        >
          {isPrivate ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
        </button>
        
        <button
          type="submit"
          disabled={!text.trim() || disabled}
          className="bg-blue-600 dark:bg-blue-500 text-white p-3 rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <FaPaperPlane size={18} />
        </button>
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
