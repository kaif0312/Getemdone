// Types + dependency bundle for the WhatsApp brain. Tests pass fakes for BotDeps.
import type * as Tasks from '@/lib/server/tasks';
import type * as Fitness from '@/lib/server/fitness';
import type * as Social from '@/lib/server/social';
import type * as Reminders from '@/lib/server/reminders';
import type * as Users from '@/lib/server/users';
import type * as Links from '@/lib/wa/links';
import type * as Sessions from '@/lib/wa/sessions';
import type * as Send from '@/lib/wa/send';
import type * as Learning from '@/lib/server/learning';
import type * as Privacy from '@/lib/wa/privacy';

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
  markRead: typeof Send.markRead;
  /** Optional so older test fakes keep compiling; when absent, nothing goes to the learning log. */
  logLearning?: typeof Learning.logLearning;
  /** "delete my data". Optional for older fakes; when absent the bot says it cannot do it right now. */
  forgetMe?: typeof Privacy.forgetMe;
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
