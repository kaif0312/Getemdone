// Types + dependency bundle for the WhatsApp brain. Tests pass fakes for BotDeps.
import type * as Tasks from '@/lib/server/tasks';
import type * as Fitness from '@/lib/server/fitness';
import type * as Social from '@/lib/server/social';
import type * as Reminders from '@/lib/server/reminders';
import type * as Users from '@/lib/server/users';
import type * as Links from '@/lib/wa/links';
import type * as Sessions from '@/lib/wa/sessions';
import type * as Send from '@/lib/wa/send';
import type * as Meds from '@/lib/server/meds';
import type { MemeDeps } from './memes';

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}
export interface FunctionDecl {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}
export interface GeminiRequest {
  /** Static instructions (first in the prompt, cache friendly). */
  system: string;
  /** One user turn; dynamic context (task list, clock) is the LAST part. */
  user: GeminiPart[];
  tools: FunctionDecl[];
}
export interface GeminiResult {
  calls: { name: string; args: Record<string, unknown> }[];
  /** Any plain text the model produced. */
  text: string;
  model?: string;
}

/** The slice of lib/server/meds.ts the bot needs: patient taps (care.ts) and the family member's /meds + tools. */
export interface MedBotDeps {
  openDosesFor: typeof Meds.openDosesFor;
  takeDose: typeof Meds.takeDose;
  snoozeDose: typeof Meds.snoozeDose;
  forwardToOwner: typeof Meds.forwardToOwner;
  statusLines: typeof Meds.statusLines;
  addMedication: typeof Meds.addMedication;
  removeMedication: typeof Meds.removeMedication;
}

/** Calendar sync (lib/server/calendarLink.ts, googleCal.ts). Optional so older test fakes keep compiling. */
export interface CalendarBotDeps {
  status(uid: string): Promise<{ feed: { url: string; webcalUrl: string } | null; google: { connected: boolean; email?: string; lastSyncAt?: number; error?: string; needsReconnect?: boolean } }>;
  /** Create (or with rotate, replace) the personal ICS feed; returns its URLs. */
  ensureFeed(uid: string, rotate?: boolean): Promise<{ url: string; webcalUrl: string }>;
  removeFeed(uid: string): Promise<void>;
  googleAvailable(): boolean;
  /** Signed link that starts the Google consent screen. */
  googleLink(uid: string): string;
  disconnectGoogle(uid: string): Promise<void>;
  syncNow(uid: string): Promise<{ status: string; created: number; updated: number; deleted: number }>;
}

/** One file in the user's Drive vault (from the `vaultUploads` audit collection). */
export interface VaultItem { name: string; bytes: number; at: number }

/** Calendar images (/calendar, /cal week). Optional so older test fakes keep compiling; absent = a text agenda only. */
export interface CalendarDeps {
  tasks(uid: string): Promise<import('@/lib/types').Task[]>;
  /** Render, upload and send the PNG with the caption and buttons. false = could not send an image (caller falls back to text). */
  sendImage(to: string, view: 'month' | 'week', model: import('@/lib/calendar/events').MonthModel | import('@/lib/calendar/events').WeekModel, caption: string, buttons: { id: string; title: string }[]): Promise<boolean>;
}

export interface BotDeps {
  now(): number;
  gemini(req: GeminiRequest): Promise<GeminiResult>;
  // lib/wa
  getLink: typeof Links.getLink;
  redeemLinkCode: typeof Links.redeemLinkCode;
  updateLink: typeof Links.updateLink;
  getSession: typeof Sessions.getSession;
  saveSession: typeof Sessions.saveSession;
  sendText: typeof Send.sendText;
  sendButtons: typeof Send.sendButtons;
  sendList: typeof Send.sendList;
  /** Optional so older test fakes keep compiling; when absent, stickers are simply skipped. */
  sendSticker?: typeof Send.sendSticker;
  calendar?: CalendarDeps;
  /** Meme/GIF/sticker sending; absent = no memes (tests that do not care, or no providers). */
  memes?: MemeDeps;
  /** Medicine reminders (lib/server/meds.ts). Optional so older test fakes keep compiling. */
  meds?: MedBotDeps;
  /** Calendar sync: /sync on WhatsApp. Absent = the command says it is unavailable. */
  calSync?: CalendarBotDeps;
  markRead: typeof Send.markRead;
  fetchMedia: typeof Send.fetchMedia;
  // lib/server
  getUserLite: typeof Users.getUserLite;
  localDate: typeof Users.localDate;
  localTime: typeof Users.localTime;
  addTasks: typeof Tasks.addTasks;
  listToday: typeof Tasks.listToday;
  listOpen: typeof Tasks.listOpen;
  completeTask: typeof Tasks.completeTask;
  uncompleteTask: typeof Tasks.uncompleteTask;
  deferTask: typeof Tasks.deferTask;
  deleteTask: typeof Tasks.deleteTask;
  restoreTask: typeof Tasks.restoreTask;
  findTask: typeof Tasks.findTask;
  setFocus: typeof Tasks.setFocus;
  /** Optional so older test fakes keep compiling; onboarding saves the chosen name / timezone through it. */
  setProfile?(uid: string, patch: { displayName?: string; timezone?: string }): Promise<void>;
  /** Optional so older test fakes keep compiling. Newest first. */
  listVaultFiles?(wa: string, limit: number): Promise<VaultItem[]>;
  /** Optional so older test fakes keep compiling; when absent, reminders are simply not set. */
  setReminder?: typeof Tasks.setReminder;
  setReminderChannel?: typeof Reminders.setReminderChannel;
  daySummary: typeof Tasks.daySummary;
  logWorkout: typeof Fitness.logWorkout;
  logMetric: typeof Fitness.logMetric;
  setGoals: typeof Fitness.setGoals;
  weekSummary: typeof Fitness.weekSummary;
  undoLastWorkout: typeof Fitness.undoLastWorkout;
  listFriends: typeof Social.listFriends;
  findFriend: typeof Social.findFriend;
  nudgeFriend: typeof Social.nudgeFriend;
  reactToTask: typeof Social.reactToTask;
  friendsActivity: typeof Social.friendsActivity;
  answerInvite: typeof Social.answerInvite;
}

/** What to reverse when the user taps Undo. Stored in session.lastAction.payload.undos. */
export type Undo =
  | { k: 'add'; ids: string[]; label: string }
  | { k: 'complete'; ids: string[]; label: string }
  | { k: 'delete'; ids: string[]; label: string }
  | { k: 'defer'; ids: string[]; to: string; label: string }
  | { k: 'workout'; label: string };
