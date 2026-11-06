/**
 * Types the native app needs that the PWA's lib/types.ts does not declare. Every shape here already exists in
 * Firestore (written by the server/bot); nothing new is invented. Sources are named per type.
 */
import type { User } from './types';

/** users/{uid} as the server sees it: User + fields the bot/reminders read (lib/server/users.ts, reminders.ts). */
export interface UserDoc extends User {
  /** IANA zone (e.g. 'Asia/Dubai'). Written when WhatsApp is linked (app/api/wa/link-code). */
  timezone?: string;
  /** Where reminders go (lib/server/reminders.ts). */
  reminderChannel?: 'auto' | 'app' | 'whatsapp' | 'both';
  /**
   * Expo push tokens for this app (docs/NATIVE_APP_PLAN.md section 4). Key = sanitised token, value keeps the raw token.
   * The server-side senders read these; written by src/lib/push.ts.
   */
  expoPushTokens?: Record<string, ExpoPushTokenEntry>;
}

export interface ExpoPushTokenEntry {
  token: string;
  platform: 'ios' | 'android';
  updatedAt: number;
}

/** fitness/{uid}/days/{YYYY-MM-DD}  (lib/server/fitness.ts) */
export interface Workout {
  type: string;
  minutes?: number;
  distanceKm?: number;
  sets?: number;
  reps?: number;
  note?: string;
  source: 'wa' | 'app';
  at: number;
}
export interface FitnessDay {
  date: string;
  workouts: Workout[];
  steps?: number;
  weightKg?: number;
  sleepH?: number;
  waterL?: number;
  updatedAt: number;
}
/** fitnessGoals/{uid}  (lib/server/fitness.ts) */
export interface FitnessGoals {
  workoutsPerWeek?: number;
  stepsPerDay?: number;
  targetWeightKg?: number;
  visibility: 'friends' | 'private';
}
export type FitnessMetric = 'steps' | 'weightKg' | 'sleepH' | 'waterL';

/** Friends' tasks are the PWA Task with the author's name; `hidden` marks tasks the viewer may count but not read. */
export interface FriendTask {
  id: string;
  userId: string;
  userName: string;
  /** Decrypted text, or '[Private Task]' when the viewer is not allowed to see it. */
  text: string;
  hidden: boolean;
  completed: boolean;
  completedAt: number | null;
  createdAt: number;
  deferredTo?: string;
  focusDate?: string | null;
  tags?: string[];
  committed?: boolean;
  reactions?: import('./types').Reaction[];
  comments?: import('./types').Comment[];
  raw: import('./types').Task;
}
