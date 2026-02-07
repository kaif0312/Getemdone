'use client';

import { FaTimes, FaCheckCircle, FaHandPaper, FaHandPointer, FaUsers, FaMicrophone, FaListUl, FaFire, FaLock, FaCalendar, FaStar, FaComment } from 'react-icons/fa';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  const sections = [
    {
      title: 'Getting Started',
      icon: <FaCheckCircle className="text-blue-500" />,
      items: [
        { icon: '📝', text: 'Type a task and press Enter to add' },
        { icon: '✓', text: 'Tap the checkbox to complete tasks' },
        { icon: '🗑️', text: 'Swipe left or use delete to remove tasks' },
      ],
    },
    {
      title: 'Gestures (Mobile)',
      icon: <FaHandPaper className="text-green-500" />,
      items: [
        { icon: '👆', text: 'Swipe right → Complete task' },
        { icon: '👆', text: 'Swipe left ← Delete task' },
        { icon: '👆', text: 'Long-press for more options' },
      ],
    },
    {
      title: 'Task Features',
      icon: <FaHandPointer className="text-purple-500" />,
      items: [
        { icon: '🔒', text: 'Toggle privacy to keep tasks private' },
        { icon: '⏰', text: 'Set due dates for important tasks' },
        { icon: '💪', text: 'Mark as commitment for accountability' },
        { icon: '📝', text: 'Add notes to tasks' },
        { icon: '📅', text: 'Defer tasks to another day' },
      ],
    },
    {
      title: 'Social Features',
      icon: <FaUsers className="text-pink-500" />,
      items: [
        { icon: '👥', text: 'Add friends to see their tasks' },
        { icon: '💬', text: 'Comment on friends\' tasks' },
        { icon: '👍', text: 'React to completed tasks' },
        { icon: '📤', text: 'Share your tasks on WhatsApp' },
      ],
    },
    {
      title: 'Quick Actions',
      icon: <FaMicrophone className="text-orange-500" />,
      items: [
        { icon: '🎤', text: 'Voice input for hands-free task entry' },
        { icon: '📋', text: 'Use templates for common tasks' },
        { icon: '🔥', text: 'Check your streak in the calendar' },
        { icon: '🗑️', text: 'View deleted tasks in recycle bin' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Quick Help
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
            aria-label="Close help"
          >
            <FaTimes className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {sections.map((section, index) => (
            <div key={index} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-xl">{section.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {section.title}
                </h3>
              </div>
              <ul className="space-y-2 ml-7">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
                    <span className="text-lg flex-shrink-0">{item.icon}</span>
                    <span className="text-sm">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Keyboard Shortcuts */}
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Keyboard Shortcuts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                <span className="text-gray-700 dark:text-gray-300">Add task</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-600 rounded text-xs font-mono">Enter</kbd>
              </div>
              <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
                <span className="text-gray-700 dark:text-gray-300">Focus input</span>
                <kbd className="px-2 py-1 bg-white dark:bg-gray-600 rounded text-xs font-mono">/</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            💡 Tips appear automatically as you use features. You can dismiss them anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
