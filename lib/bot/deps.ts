// Production wiring of BotDeps. Kept apart from core.ts so tests never import the real modules.
import * as tasks from '@/lib/server/tasks';
import * as fitness from '@/lib/server/fitness';
import * as social from '@/lib/server/social';
import * as users from '@/lib/server/users';
import * as links from '@/lib/wa/links';
import * as sessions from '@/lib/wa/sessions';
import * as send from '@/lib/wa/send';
import * as media from '@/lib/wa/media';
import { makeProviders } from '@/lib/memes/providers';
import * as reminders from '@/lib/server/reminders';
import * as meds from '@/lib/server/meds';
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
  memes: {
    providers: makeProviders(),
    sendImage: media.sendImage,
    sendVideo: media.sendVideo,
    uploadMedia: media.uploadMedia,
    sendStickerId: media.sendStickerId,
  },
  meds: {
    openDosesFor: meds.openDosesFor,
    takeDose: meds.takeDose,
    snoozeDose: meds.snoozeDose,
    forwardToOwner: meds.forwardToOwner,
    statusLines: meds.statusLines,
    addMedication: meds.addMedication,
    removeMedication: meds.removeMedication,
  },
  markRead: send.markRead,
  fetchMedia: send.fetchMedia,
  getUserLite: users.getUserLite,
  setProfile: users.setProfile,
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
