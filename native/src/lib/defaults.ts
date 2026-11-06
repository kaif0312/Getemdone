import type { NotificationSettings } from './types';

/** Same as DEFAULT_NOTIFICATION_SETTINGS in hooks/useNotifications.ts (PWA). */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  deadlineReminders: true,
  deadlineMinutesBefore: 60,
  noonCheckIn: true,
  commitmentReminders: true,
  friendCompletions: true,
  friendComments: true,
  friendEncouragement: true,
  sound: false,
  vibrate: true,
};
