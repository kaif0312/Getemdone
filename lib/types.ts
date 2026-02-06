export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastCompletionDate: string; // YYYY-MM-DD format
  completionHistory: { [date: string]: number }; // date -> count of completed tasks
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

export interface Task {
  id: string;
  userId: string;
  text: string;
  isPrivate: boolean;
  completed: boolean;
  createdAt: number;
  completedAt: number | null;
  reactions?: Reaction[];
  deferredTo?: string; // YYYY-MM-DD format - date this task is deferred to
  order?: number; // For drag-and-drop ordering
}

export interface TaskWithUser extends Task {
  userName: string;
}
