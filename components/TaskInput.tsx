'use client';

import { useState, useRef, useEffect } from 'react';
import { FaEye, FaEyeSlash, FaPaperPlane, FaListUl } from 'react-icons/fa';
import TaskTemplates from './TaskTemplates';
import VoiceButton from './VoiceButton';

interface TaskInputProps {
  onAddTask: (text: string, isPrivate: boolean) => void;
  disabled?: boolean;
  recentTasks?: string[];
}

export default function TaskInput({ onAddTask, disabled = false, recentTasks = [] }: TaskInputProps) {
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-focus on mount
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (text.trim() && !disabled) {
      onAddTask(text.trim(), isPrivate);
      setText('');
      inputRef.current?.focus();
    }
  };

  const handleSelectTemplate = (templateText: string) => {
    setText(templateText);
    inputRef.current?.focus();
  };

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
