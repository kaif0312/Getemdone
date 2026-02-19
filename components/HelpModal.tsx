'use client';

import { FaTimes, FaCheckCircle, FaHandPaper, FaHandPointer, FaUsers, FaMicrophone } from 'react-icons/fa';
import { LuFileText, LuCheck, LuTrash2, LuHand, LuLock, LuClock, LuTarget, LuCalendar, LuMessageCircle, LuThumbsUp, LuShare2, LuMic, LuClipboardList, LuFlame, LuLightbulb } from 'react-icons/lu';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  const sections = [
    {
      title: 'Getting Started',
      icon: <FaCheckCircle className="text-primary" />,
      items: [
        { icon: <LuFileText size={16} className="text-fg-secondary" />, text: 'Type a task and press Enter to add' },
        { icon: <LuCheck size={16} className="text-fg-secondary" />, text: 'Tap the checkbox to complete tasks' },
        { icon: <LuTrash2 size={16} className="text-fg-secondary" />, text: 'Swipe left or use delete to remove tasks' },
      ],
    },
    {
      title: 'Gestures (Mobile)',
      icon: <FaHandPaper className="text-success" />,
      items: [
        { icon: <LuHand size={16} className="text-fg-secondary" />, text: 'Swipe right → Complete task' },
        { icon: <LuHand size={16} className="text-fg-secondary" />, text: 'Swipe left ← Delete task' },
        { icon: <LuHand size={16} className="text-fg-secondary" />, text: 'Long-press for more options' },
      ],
    },
    {
      title: 'Task Features',
      icon: <FaHandPointer className="text-primary" />,
      items: [
        { icon: <LuLock size={16} className="text-fg-secondary" />, text: 'Toggle privacy to keep tasks private' },
        { icon: <LuClock size={16} className="text-fg-secondary" />, text: 'Set due dates for important tasks' },
        { icon: <LuTarget size={16} className="text-fg-secondary" />, text: 'Mark as commitment for accountability' },
        { icon: <LuFileText size={16} className="text-fg-secondary" />, text: 'Add notes to tasks' },
        { icon: <LuCalendar size={16} className="text-fg-secondary" />, text: 'Defer tasks to another day' },
      ],
    },
    {
      title: 'Social Features',
      icon: <FaUsers className="text-primary" />,
      items: [
        { icon: <FaUsers size={14} className="text-fg-secondary" />, text: 'Add friends to see their tasks' },
        { icon: <LuMessageCircle size={16} className="text-fg-secondary" />, text: 'Comment on friends\' tasks' },
        { icon: <LuThumbsUp size={16} className="text-fg-secondary" />, text: 'React to completed tasks' },
        { icon: <LuShare2 size={16} className="text-fg-secondary" />, text: 'Share your tasks on WhatsApp' },
      ],
    },
    {
      title: 'Quick Actions',
      icon: <FaMicrophone className="text-streak" />,
      items: [
        { icon: <LuMic size={16} className="text-fg-secondary" />, text: 'Voice input for hands-free task entry' },
        { icon: <LuClipboardList size={16} className="text-fg-secondary" />, text: 'Use templates for common tasks' },
        { icon: <LuFlame size={16} className="text-fg-secondary" />, text: 'Check your streak in the calendar' },
        { icon: <LuTrash2 size={16} className="text-fg-secondary" />, text: 'View deleted tasks in recycle bin' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-surface rounded-2xl shadow-elevation-3 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <h2 className="text-2xl font-bold text-fg-primary">
            Quick Help
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-surface-muted hover:bg-surface-muted/80 flex items-center justify-center transition-colors"
            aria-label="Close help"
          >
            <FaTimes className="text-fg-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {sections.map((section, index) => (
            <div key={index} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-xl">{section.icon}</div>
                <h3 className="text-lg font-semibold text-fg-primary">
                  {section.title}
                </h3>
              </div>
              <ul className="space-y-2 ml-7">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex items-start gap-3 text-fg-secondary">
                    {item.icon}
                    <span className="text-sm">{item.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Keyboard Shortcuts */}
          <div className="mt-8 pt-6 border-t border-border-subtle">
            <h3 className="text-lg font-semibold text-fg-primary mb-3">
              Keyboard Shortcuts
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between p-2 bg-surface-muted rounded-lg">
                <span className="text-fg-secondary">Add task</span>
                <kbd className="px-2 py-1 bg-elevated rounded-lg text-xs font-mono">Enter</kbd>
              </div>
              <div className="flex items-center justify-between p-2 bg-surface-muted rounded-lg">
                <span className="text-fg-secondary">Focus input</span>
                <kbd className="px-2 py-1 bg-elevated rounded-lg text-xs font-mono">/</kbd>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border-subtle bg-surface-muted">
          <p className="text-xs text-center text-fg-tertiary flex items-center justify-center gap-1.5">
            <LuLightbulb size={14} className="flex-shrink-0" />
            Tips appear automatically as you use features. You can dismiss them anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
