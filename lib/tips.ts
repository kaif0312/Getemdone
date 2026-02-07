export interface Tip {
  id: string;
  message: string;
  position: 'above' | 'below' | 'tooltip' | 'inline';
  trigger: string;
  mobileOnly?: boolean;
  desktopOnly?: boolean;
}

export const TIPS: Record<string, Tip> = {
  FIRST_TASK: {
    id: 'first-task',
    message: '💡 Press Enter to add tasks quickly',
    position: 'below',
    trigger: 'onFirstTask',
  },
  SWIPE: {
    id: 'swipe',
    message: '👆 Swipe right to complete, left to delete',
    position: 'tooltip',
    trigger: 'onFirstSwipe',
    mobileOnly: true,
  },
  LONG_PRESS: {
    id: 'long-press',
    message: 'Long-press tasks for more options',
    position: 'tooltip',
    trigger: 'onFirstLongPress',
    mobileOnly: true,
  },
  FRIENDS: {
    id: 'friends',
    message: 'Add friends to see their tasks and stay accountable',
    position: 'tooltip',
    trigger: 'onFirstFriend',
  },
  VOICE_INPUT: {
    id: 'voice-input',
    message: '🎤 Tap the mic icon to add tasks with your voice',
    position: 'tooltip',
    trigger: 'onFirstVoice',
  },
  TEMPLATES: {
    id: 'templates',
    message: '📋 Use templates for common tasks',
    position: 'tooltip',
    trigger: 'onFirstTemplate',
  },
  STREAK: {
    id: 'streak',
    message: '🔥 Complete 70% of tasks daily to build your streak!',
    position: 'tooltip',
    trigger: 'onFirstStreak',
  },
  PRIVATE_TASKS: {
    id: 'private-tasks',
    message: '🔒 Toggle privacy to keep tasks private from friends',
    position: 'tooltip',
    trigger: 'onFirstPrivate',
  },
  DUE_DATES: {
    id: 'due-dates',
    message: '⏰ Set due dates to prioritize important tasks',
    position: 'tooltip',
    trigger: 'onFirstDueDate',
  },
  COMMITMENT: {
    id: 'commitment',
    message: '💪 Mark tasks as commitments to show you\'re serious',
    position: 'tooltip',
    trigger: 'onFirstCommitment',
  },
};

export const FEATURE_BADGES: Record<string, { id: string; label: string; feature: string }> = {
  VOICE: {
    id: 'voice-badge',
    label: 'New!',
    feature: 'voiceInput',
  },
  TEMPLATES: {
    id: 'templates-badge',
    label: 'Try it!',
    feature: 'templates',
  },
  STREAK: {
    id: 'streak-badge',
    label: 'Check it!',
    feature: 'streak',
  },
  FRIENDS: {
    id: 'friends-badge',
    label: 'Add friends!',
    feature: 'friends',
  },
};
