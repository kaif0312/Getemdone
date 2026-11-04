// Production wiring of BotDeps. Kept apart from core.ts so tests never import the real modules.
import * as tasks from '@/lib/server/tasks';
import * as fitness from '@/lib/server/fitness';
import * as social from '@/lib/server/social';
import * as users from '@/lib/server/users';
import * as links from '@/lib/wa/links';
import * as sessions from '@/lib/wa/sessions';
import * as send from '@/lib/wa/send';
import * as reminders from '@/lib/server/reminders';
import { callGemini } from './gemini';
import { listVaultFiles } from '@/lib/vault/audit';
import type { BotDeps } from './types';

export const defaultDeps: BotDeps = {
  now: () => Date.now(),
  gemini: (req) => callGemini(req),
  getLink: links.getLink,
  redeemLinkCode: links.redeemLinkCode,
  updateLink: links.updateLink,
  getSession: sessions.getSession,
  saveSession: sessions.saveSession,
  sendText: send.sendText,
  sendButtons: send.sendButtons,
  sendList: send.sendList,
  sendSticker: send.sendSticker,
  markRead: send.markRead,
  fetchMedia: send.fetchMedia,
  getUserLite: users.getUserLite,
  localDate: users.localDate,
  localTime: users.localTime,
  addTasks: tasks.addTasks,
  listToday: tasks.listToday,
  listOpen: tasks.listOpen,
  completeTask: tasks.completeTask,
  uncompleteTask: tasks.uncompleteTask,
  deferTask: tasks.deferTask,
  deleteTask: tasks.deleteTask,
  restoreTask: tasks.restoreTask,
  findTask: tasks.findTask,
  setFocus: tasks.setFocus,
  listVaultFiles,
  setReminder: tasks.setReminder,
  setReminderChannel: reminders.setReminderChannel,
  daySummary: tasks.daySummary,
  logWorkout: fitness.logWorkout,
  logMetric: fitness.logMetric,
  setGoals: fitness.setGoals,
  weekSummary: fitness.weekSummary,
  undoLastWorkout: fitness.undoLastWorkout,
  listFriends: social.listFriends,
  findFriend: social.findFriend,
  nudgeFriend: social.nudgeFriend,
  reactToTask: social.reactToTask,
  friendsActivity: social.friendsActivity,
  answerInvite: social.answerInvite,
};
