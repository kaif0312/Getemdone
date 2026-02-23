export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastCompletionDate: string; // YYYY-MM-DD format
  completionHistory: { [date: string]: number }; // date -> count of completed tasks
  missedCommitments: { [date: string]: number }; // date -> count of missed committed tasks
}

export interface NotificationSettings {
  enabled: boolean;
  deadlineReminders: boolean;
  deadlineMinutesBefore: number; // How many minutes before deadline to remind
  noonCheckIn: boolean; // Remind at noon if no tasks completed
  commitmentReminders: boolean;
  friendCompletions: boolean;
  friendComments: boolean; // Notify when friends comment on your tasks
  friendEncouragement: boolean; // Receive encouragement from friends
  sound: boolean;
  vibrate: boolean;
}

export interface InAppNotification {
  id: string;
  userId: string; // Who receives the notification
  type: 'comment' | 'completion' | 'deadline' | 'commitment' | 'encouragement' | 'bugReport' | 'announcement';
  title: string;
  message: string;
  taskId?: string;
  taskText?: string;
  fromUserId?: string;
  fromUserName?: string;
  fromUserPhotoURL?: string;
  commentText?: string;
  reactionEmoji?: string; // For "X reacted [emoji] to your comment" notifications
  bugReportId?: string; // ID of the bug report for bugReport type notifications
  createdAt: number;
  read: boolean;
}

/** Friend group for selective task visibility (e.g. "Close Friends") */
export interface FriendGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  friendCode: string;
  fcmToken?: string; // Firebase Cloud Messaging token for push notifications
  fcmTokenUpdatedAt?: number; // Timestamp when FCM token was last updated
  friends: string[];
  /** Reusable friend groups for task visibility (e.g. Close Friends) */
  friendGroups?: FriendGroup[];
  /** Default visibility for new tasks: everyone | only | except | private */
  defaultVisibility?: 'everyone' | 'only' | 'except' | 'private';
  /** Default visibility list (friend IDs) when defaultVisibility is only/except */
  defaultVisibilityList?: string[];
  createdAt: number;
  streakData?: StreakData;
  isAdmin?: boolean; // Admin users can manage whitelist and view all users
  photoURL?: string; // Profile picture URL (Google profile or custom upload)
  notificationSettings?: NotificationSettings; // User's notification preferences
  storageUsed?: number; // Storage used in bytes
  storageLimit?: number; // Storage limit in bytes (default: 100MB)
  /** Recently used emoji tags for quick selection (max 12) */
  recentlyUsedTags?: string[];
  /** WebAuthn credential ID for Face ID lock (iOS only). Never stores biometric data. */
  biometricCredentialId?: string;
  /** Whether Face ID lock is enabled for this user */
  biometricEnabled?: boolean;
  /** Custom labels for tag/category icons (tagId -> label). Syncs across devices. */
  customTagLabels?: Record<string, string>;
  /** IDs of dismissed one-time banners (e.g. 'visibility_social') */
  dismissedBanners?: string[];
  /** Google Calendar: encrypted tokens (access_token, refresh_token, expires_at) */
  googleCalendarTokens?: string;
  /** Google Calendar: selected calendar IDs to display */
  googleCalendarSelectedIds?: string[];
  /** Google Calendar: default event visibility to friends */
  defaultEventVisibility?: TaskVisibility;
  /** Google Calendar: default visibility list when defaultEventVisibility is only/except */
  defaultEventVisibilityList?: string[];
}

/** Google Calendar event (from API or our overlay) */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  colorId?: string;
  /** Resolved from calendar or colorId */
  backgroundColor?: string;
  htmlLink?: string;
  /** Nudge: visibility to friends (stored in Firestore, not in Google) */
  visibility?: TaskVisibility;
  visibilityList?: string[];
}

/** Google Calendar list item */
export interface GoogleCalendarListItem {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
}

export interface Reaction {
  userId: string;
  emoji: string;
  userName: string;
  timestamp: number;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  /** Commenter's profile picture URL */
  photoURL?: string;
  text: string;
  /** For owner comments on own tasks: encrypted per friend so friends can decrypt. Owner uses text; friends use this. */
  friendContent?: Record<string, string>;
  timestamp: number;
  reactions?: Reaction[]; // Emoji reactions to the comment
  /** Reply to another comment - WhatsApp-style threading */
  replyToId?: string;
  replyToUserName?: string;
  /** Quoted message text for preview when replying */
  replyToText?: string;
}

export interface Attachment {
  id: string;
  type: 'image' | 'document';
  url: string;
  thumbnailUrl?: string;
  name: string;
  size: number; // in bytes
  uploadedAt: number;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface BugReport {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  description: string;
  imageUrl?: string;
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  createdAt: number;
  resolvedAt?: number;
  adminNotes?: string;
}

/** Recurrence: template spawns fresh instance each scheduled day */
export interface Recurrence {
  frequency: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'custom';
  /** For weekly/biweekly/custom weeks: 0=Sun, 1=Mon, ... 6=Sat */
  days?: number[];
  startDate: string; // YYYY-MM-DD
  /** Custom interval: repeat every N days/weeks/months */
  interval?: number; // 1-99
  intervalUnit?: 'days' | 'weeks' | 'months';
  /** For monthly: day of month 1-31, or -1 for last day */
  dayOfMonth?: number;
  /** End condition */
  endType?: 'never' | 'onDate' | 'afterOccurrences';
  endDate?: string; // YYYY-MM-DD
  endAfterOccurrences?: number;
  /** Dates when user completed this recurring task */
  completedDates?: string[];
  /** Dates when user deferred/skipped today's instance */
  skippedDates?: string[];
}

/** Task visibility: who can see this task */
export type TaskVisibility = 'everyone' | 'only' | 'except' | 'private';

export interface Task {
  id: string;
  userId: string;
  text: string;
  /** For friend sharing: task text encrypted per friend (friendId -> encrypted). Owner uses text; friends use this. */
  friendContent?: Record<string, string>;
  /** @deprecated Use visibility instead. Kept for backward compatibility. */
  isPrivate: boolean;
  /** Selective visibility: everyone | only [selected] | except [selected] | private */
  visibility?: TaskVisibility;
  /** Friend IDs for visibility when visibility is 'only' or 'except' */
  visibilityList?: string[];
  /** Optional group ID reference when visibility was set from a group */
  visibilityGroup?: string;
  completed: boolean;
  createdAt: number;
  completedAt: number | null;
  reactions?: Reaction[];
  comments?: Comment[];
  deferredTo?: string; // YYYY-MM-DD format - date this task is deferred to
  dueDate?: number | null; // Timestamp for deadline
  order?: number; // For drag-and-drop ordering
  deleted?: boolean; // Soft delete flag
  deletedAt?: number | null; // Timestamp when deleted
  committed?: boolean; // Commitment Mode - must complete today!
  skipRollover?: boolean; // If true, don't auto-rollover to next day
  notes?: string; // Personal notes/description for the task
  attachments?: Attachment[]; // Media attachments (max 3)
  /** Emoji tags (max 5 per task) */
  tags?: string[];
  /** Subtasks (one level only, no sub-subtasks) */
  subtasks?: Subtask[];
  /** Recurrence: template spawns instance each scheduled day */
  recurrence?: Recurrence;
}

export interface TaskWithUser extends Task {
  userName: string;
}
