export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastCompletionDate: string; // YYYY-MM-DD format
  completionHistory: { [date: string]: number }; // date -> count of completed tasks
  missedCommitments: { [date: string]: number }; // date -> count of missed committed tasks
}

export interface User {
  id: string;
  displayName: string;
  email: string;
  friendCode: string;
  friends: string[];
  createdAt: number;
  streakData?: StreakData;
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
  text: string;
  timestamp: number;
}

export interface Task {
  id: string;
  userId: string;
  text: string;
  isPrivate: boolean;
  completed: boolean;
  createdAt: number;
  completedAt: number | null;
  reactions?: Reaction[];
  comments?: Comment[];
  deferredTo?: string; // YYYY-MM-DD format - date this task is deferred to
  order?: number; // For drag-and-drop ordering
  deleted?: boolean; // Soft delete flag
  deletedAt?: number | null; // Timestamp when deleted
  committed?: boolean; // Commitment Mode - must complete today!
}

export interface TaskWithUser extends Task {
  userName: string;
}
