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
import * as learning from '@/lib/server/learning';
import * as privacy from '@/lib/wa/privacy';
import * as meds from '@/lib/server/meds';
import { callGemini } from './gemini';
import { listVaultFiles } from '@/lib/vault/audit';
import * as calLink from '@/lib/server/calendarLink';
import * as gcal from '@/lib/server/googleCal';
import { meetingNotesHandle } from '@/lib/meetingnotes';
import type { BotDeps } from './types';
import { sendCalendarImage } from '@/lib/calendar/send';

export const defaultDeps: BotDeps = {
  now: () => Date.now(),
  meetingNotes: { handle: meetingNotesHandle },
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
  calendar: { tasks: tasks.listCalendar, sendImage: sendCalendarImage },
  meds: {
    openDosesFor: meds.openDosesFor,
    takeDose: meds.takeDose,
    snoozeDose: meds.snoozeDose,
    forwardToOwner: meds.forwardToOwner,
    statusLines: meds.statusLines,
    addMedication: meds.addMedication,
    removeMedication: meds.removeMedication,
  },
  calSync: {
    status: async (uid) => calLink.toPublicStatus(await calLink.getCalendarLink(uid)),
    ensureFeed: async (uid, rotate) => {
      const token = await calLink.ensureFeedToken(uid, rotate);
      return { url: calLink.feedUrl(token), webcalUrl: calLink.webcalUrl(token) };
    },
    removeFeed: calLink.removeFeed,
    googleAvailable: gcal.googleConfigured,
    googleLink: (uid) => gcal.startLink(uid, 'wa'),
    disconnectGoogle: (uid) => gcal.disconnect(uid),
    syncNow: (uid) => gcal.syncUser(uid),
  },
  markRead: send.markRead,
  logLearning: learning.logLearning,
  forgetMe: privacy.forgetMe,
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
  renameTask: tasks.renameTask,
  parkTask: tasks.parkTask,
  unparkTask: tasks.unparkTask,
  listParked: tasks.listParked,
  markParkedAsked: tasks.markParkedAsked,
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
