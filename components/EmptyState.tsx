'use client';

import { FaCheckCircle, FaUsers, FaLightbulb } from 'react-icons/fa';

interface EmptyStateProps {
  type: 'no-tasks' | 'no-friends' | 'no-completed' | 'no-friend-tasks';
  onAction?: () => void;
  actionLabel?: string;
  showTips?: boolean;
}

export default function EmptyState({ 
  type, 
  onAction, 
  actionLabel,
  showTips = true 
}: EmptyStateProps) {
  const getContent = () => {
    switch (type) {
      case 'no-tasks':
        return {
          icon: '📝',
          title: 'Ready to get things done?',
          description: 'Add your first task below to start tracking your progress',
          tips: [
            'Type a task and press Enter',
            'Swipe right to complete',
            'Long-press for more options',
          ],
          actionLabel: actionLabel || 'Add Your First Task',
        };
      case 'no-friends':
        return {
          icon: '👥',
          title: 'Add friends to stay accountable',
          description: 'See their tasks and motivate each other',
          tips: [
            'Tap the friends button above',
            'Add friends by email',
            'See their public tasks',
          ],
          actionLabel: actionLabel || 'Add Your First Friend',
        };
      case 'no-completed':
        return {
          icon: '✅',
          title: 'No completed tasks yet',
          description: 'Complete a task to see it here',
          tips: [
            'Tap the checkbox to complete',
            'Swipe right on mobile',
            'Build your completion streak!',
          ],
          actionLabel: null,
        };
      case 'no-friend-tasks':
        return {
          icon: '👥',
          title: 'No friend tasks to show',
          description: 'Friends\' tasks will appear here when they add them',
          tips: [
            'Make sure you have friends added',
            'Friends need to add public tasks',
            'Check back later!',
          ],
          actionLabel: null,
        };
      default:
        return {
          icon: '📝',
          title: 'Nothing here yet',
          description: 'Get started by adding your first item',
          tips: [],
          actionLabel: null,
        };
    }
  };

  const content = getContent();

  return (
    <div className="text-center py-12 px-4">
      <div className="text-6xl mb-4">{content.icon}</div>
      <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        {content.title}
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-sm mx-auto">
        {content.description}
      </p>

      {showTips && content.tips.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-3">
            <FaLightbulb className="text-blue-600 dark:text-blue-400" size={16} />
            <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
              Quick Tips
            </span>
          </div>
          <ul className="text-left space-y-2 text-sm text-blue-800 dark:text-blue-200">
            {content.tips.map((tip, index) => (
              <li key={index} className="flex items-start gap-2">
                <FaCheckCircle className="text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" size={12} />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {onAction && content.actionLabel && (
        <button
          onClick={onAction}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors shadow-md"
        >
          {content.actionLabel}
        </button>
      )}
    </div>
  );
}
