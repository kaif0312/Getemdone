// OWNER: agent "social". Friends + social actions, writing the SAME docs as the PWA so in-app + push keep working.
// Docs written: tasks/{id}.reactions[] / comments[] (transactions), notifications/{id} (same shape as hooks/useTasks.ts),
// nudgeLimits/{from_to_date}, friendInvites/{id}, users/{uid}.friends (arrayUnion).
import { langOf } from '../bot/i18n';
import { FieldValue } from 'firebase-admin/firestore';
import type { Comment, Reaction, Task } from '../../lib/types';
import { canViewTask } from '../../utils/visibility';
import { BUTTON_IDS } from '../wa/types';
import { adminDb } from './firebaseAdmin';
import { capDate, releaseTemplateSlot, reserveTemplateSlot } from './waCaps';
import * as usersMod from './users';
import * as linksMod from '../wa/links';
import * as sendMod from '../wa/send';

export interface FriendLite { uid: string; displayName: string; waLinked: boolean; }
export interface FriendActivity { uid: string; displayName: string; doneToday: { taskId: string; text: string }[]; workoutsToday: string[]; streak: number; }

/** Injectable collaborators (real ones by default) so emulator tests can fake time, zones and sends. */
export const deps = {
  now: () => Date.now(),
  localDate: (tz: string, at?: number): string => usersMod.localDate(tz, at),
  getLinkByUid: (uid: string) => linksMod.getLinkByUid(uid),
  windowOpen: (lastInboundAt: number, now?: number) => sendMod.windowOpen(lastInboundAt, now),
  sendText: (to: string, text: string) => sendMod.sendText(to, text),
  sendButtons: (to: string, body: string, buttons: { id: string; title: string }[]) => sendMod.sendButtons(to, body, buttons),
  sendTemplate: (to: string, name: string, vars: string[], opts?: { language?: string; buttonPayloads?: string[] }) =>
    sendMod.sendTemplateFallback(to, name, vars, opts),
};

const DEFAULT_TZ = 'Asia/Kolkata';

interface UserDoc {
  displayName?: string;
  photoURL?: string;
  friends?: string[];
  friendCode?: string;
  timezone?: string;
  notificationSettings?: {
    enabled?: boolean;
    friendComments?: boolean;
    friendEncouragement?: boolean;
  };
  streakData?: { currentStreak?: number };
}

async function loadUser(uid: string): Promise<(UserDoc & { id: string }) | null> {
  const s = await adminDb().doc(`users/${uid}`).get();
  return s.exists ? { id: uid, ...(s.data() as UserDoc) } : null;
}

function nameOf(u: UserDoc | null): string {
  return u?.displayName?.trim() || 'A friend';
}

function plainText(t: string | undefined): string {
  if (!t) return '';
  return t.startsWith('e1:') ? '' : t; // E2EE is off; stale encrypted rows are not readable here
}

export async function listFriends(uid: string): Promise<FriendLite[]> {
  const me = await loadUser(uid);
  const ids = me?.friends ?? [];
  const out = await Promise.all(
    ids.map(async (fid) => {
      const [u, link] = await Promise.all([loadUser(fid), deps.getLinkByUid(fid)]);
      if (!u) return null;
      return { uid: fid, displayName: nameOf(u), waLinked: !!link } as FriendLite;
    }),
  );
  return out.filter((x): x is FriendLite => !!x);
}

/** Fuzzy match a friend by name ("ali"); null if none/ambiguous. */
export async function findFriend(uid: string, name: string): Promise<FriendLite | null> {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const friends = await listFriends(uid);
  for (const test of [
    (n: string) => n === q,
    (n: string) => n.startsWith(q),
    (n: string) => n.split(/\s+/).some((p) => p.startsWith(q)),
    (n: string) => n.includes(q),
  ]) {
    const hits = friends.filter((f) => test(f.displayName.toLowerCase()));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

/** Create a notifications doc exactly like the PWA does (the Cloud Function sends the push on create). */
async function createNotification(data: Record<string, unknown>): Promise<void> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) clean[k] = v;
  await adminDb().collection('notifications').add(clean);
}

/** Send WhatsApp to a linked friend: free text inside the 24h window, else the template. Returns true if sent. */
async function whatsappFriend(
  friendUid: string,
  fromUid: string,
  fromName: string,
  message: string | undefined,
): Promise<boolean> {
  const link = await deps.getLinkByUid(friendUid);
  if (!link || link.muted || !link.friendAlerts) return false;
  const now = deps.now();
  const text = message?.trim() ? `${fromName}: "${message.trim()}"` : `${fromName} nudged you to get things done today!`;
  const nudgeBack = { id: BUTTON_IDS.nudge(fromUid), title: 'Nudge back' };
  if (deps.windowOpen(link.lastInboundAt, now)) {
    await deps.sendButtons(link.waId, text, [nudgeBack]);
    return true;
  }
  const day = capDate(now);
  if (!(await reserveTemplateSlot(day))) return false;
  try {
    await deps.sendTemplate(
      link.waId,
      'nudge_friend',
      [fromName, message?.trim() || 'Get things done today!'],
      { language: langOf(link), buttonPayloads: [BUTTON_IDS.nudge(fromUid)] },
    );
    return true;
  } catch (e) {
    await releaseTemplateSlot(day);
    console.error('[social] nudge template failed', e);
    return false;
  }
}

/** encouragement notification (respects notificationSettings) + WhatsApp message if friend linked & opted in & window/template allows. Max 1 per pair per local day (server-side). */
export async function nudgeFriend(uid: string, friendUid: string, message?: string): Promise<{ ok: boolean; reason?: string }> {
  if (uid === friendUid) return { ok: false, reason: 'self' };
  const [me, friend] = await Promise.all([loadUser(uid), loadUser(friendUid)]);
  if (!me) return { ok: false, reason: 'no_user' };
  if (!friend) return { ok: false, reason: 'friend_not_found' };
  if (!(me.friends ?? []).includes(friendUid)) return { ok: false, reason: 'not_friends' };

  const day = deps.localDate(me.timezone || DEFAULT_TZ, deps.now());
  const limitRef = adminDb().doc(`nudgeLimits/${uid}_${friendUid}_${day}`);
  try {
    await limitRef.create({ from: uid, to: friendUid, date: day, createdAt: deps.now() });
  } catch {
    return { ok: false, reason: 'already_nudged_today' };
  }

  const fromName = nameOf(me);
  const msg = message?.trim().slice(0, 150) || undefined;
  const ns = friend.notificationSettings;
  if (ns?.enabled && ns?.friendEncouragement !== false) {
    const nudgeText = `${fromName} nudged you to get things done today!`;
    await createNotification({
      userId: friendUid,
      type: 'encouragement',
      title: msg ? `💪 ${fromName} sent you encouragement!` : `💪 ${nudgeText}`,
      message: msg ? `${fromName} sent you encouragement` : nudgeText,
      fromUserId: uid,
      fromUserName: fromName,
      fromUserPhotoURL: me.photoURL,
      commentText: msg ?? nudgeText,
      createdAt: deps.now(),
      read: false,
    });
  }
  try {
    await whatsappFriend(friendUid, uid, fromName, msg);
  } catch (e) {
    console.error('[social] nudge whatsapp failed', e); // the nudge itself is recorded
  }
  return { ok: true };
}

async function loadViewableTask(uid: string, taskId: string, me: UserDoc): Promise<Task> {
  const snap = await adminDb().doc(`tasks/${taskId}`).get();
  if (!snap.exists) throw new Error('task_not_found');
  const task = { ...(snap.data() as Task), id: snap.id };
  if (task.deleted) throw new Error('task_not_found');
  if (task.userId !== uid) {
    const owner = await loadUser(task.userId);
    const isFriend = (owner?.friends ?? []).includes(uid) && (me.friends ?? []).includes(task.userId);
    if (!isFriend || !canViewTask(task, uid, false)) throw new Error('not_visible');
  }
  return task;
}

/** Same semantics as useTasks reactions (one per user per task, toggle). Only on tasks the user may see (utils/visibility). */
export async function reactToTask(uid: string, taskId: string, emoji: string): Promise<void> {
  const me = await loadUser(uid);
  if (!me) throw new Error('no_user');
  const task = await loadViewableTask(uid, taskId, me);
  const ref = adminDb().doc(`tasks/${taskId}`);
  const userName = nameOf(me);
  const added = await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('task_not_found');
    const reactions: Reaction[] = (snap.data() as Task).reactions || [];
    if (reactions.some((r) => r.userId === uid && r.emoji === emoji)) {
      tx.update(ref, { reactions: reactions.filter((r) => !(r.userId === uid && r.emoji === emoji)) });
      return false;
    }
    const next = reactions.filter((r) => r.userId !== uid);
    next.push({ userId: uid, emoji, userName, timestamp: deps.now() });
    tx.update(ref, { reactions: next });
    return true;
  });
  // The PWA does not notify on task reactions; we do (like its comment-reaction notice) so the owner hears about it.
  if (added && task.userId !== uid) {
    const owner = await loadUser(task.userId);
    if (owner && owner.notificationSettings?.friendComments !== false) {
      await createNotification({
        userId: task.userId,
        type: 'comment',
        title: `${emoji} ${userName} reacted to your task`,
        message: `${userName} reacted ${emoji} to your task`,
        taskId,
        taskText: plainText(task.text).substring(0, 50),
        fromUserId: uid,
        fromUserName: userName,
        fromUserPhotoURL: me.photoURL,
        reactionEmoji: emoji,
        createdAt: deps.now(),
        read: false,
      });
    }
  }
}

export async function commentOnTask(uid: string, taskId: string, text: string): Promise<void> {
  const me = await loadUser(uid);
  if (!me) throw new Error('no_user');
  const body = text.trim().substring(0, 500);
  if (!body) throw new Error('empty_comment');
  const task = await loadViewableTask(uid, taskId, me);
  const ref = adminDb().doc(`tasks/${taskId}`);
  const userName = nameOf(me);
  const comment: Comment = {
    id: `${uid}_${deps.now()}_${Math.random().toString(36).slice(2, 9)}`,
    userId: uid,
    userName,
    ...(me.photoURL ? { photoURL: me.photoURL } : {}),
    text: body,
    timestamp: deps.now(),
  };
  await adminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('task_not_found');
    tx.update(ref, { comments: [...((snap.data() as Task).comments || []), comment] });
  });
  if (task.userId !== uid) {
    const owner = await loadUser(task.userId);
    if (owner && owner.notificationSettings?.friendComments !== false) {
      await createNotification({
        userId: task.userId,
        type: 'comment',
        title: `💬 ${userName} commented`,
        message: `${userName} commented on your task`,
        taskId,
        taskText: plainText(task.text).substring(0, 50),
        fromUserId: uid,
        fromUserName: userName,
        fromUserPhotoURL: me.photoURL,
        commentText: body.substring(0, 150),
        createdAt: deps.now(),
        read: false,
      });
    }
  }
}

function describeWorkout(w: { type?: string; minutes?: number; distanceKm?: number }): string {
  const parts = [w.type || 'workout'];
  if (w.distanceKm) parts.push(`${w.distanceKm} km`);
  if (w.minutes) parts.push(`${w.minutes} min`);
  return parts.join(' ');
}

/** Friends' visible completions + workouts for local today (respecting visibility + fitness goals visibility). */
export async function friendsActivity(uid: string): Promise<FriendActivity[]> {
  const me = await loadUser(uid);
  if (!me) return [];
  const tz = me.timezone || DEFAULT_TZ;
  const today = deps.localDate(tz, deps.now());
  const db = adminDb();
  const out = await Promise.all(
    (me.friends ?? []).map(async (fid): Promise<FriendActivity | null> => {
      const friend = await loadUser(fid);
      if (!friend) return null;
      const [tasksSnap, goalsSnap, daySnap] = await Promise.all([
        // uses the existing (userId, createdAt desc) index; filtered by completion in memory
        db.collection('tasks').where('userId', '==', fid).orderBy('createdAt', 'desc').limit(300).get(),
        db.doc(`fitnessGoals/${fid}`).get(),
        db.doc(`fitness/${fid}/days/${today}`).get(),
      ]);
      const doneToday: { taskId: string; text: string }[] = [];
      for (const d of tasksSnap.docs) {
        const t = { ...(d.data() as Task), id: d.id };
        if (t.deleted) continue;
        const doneNow = t.completed && t.completedAt != null && deps.localDate(tz, t.completedAt) === today;
        const doneRecurring = !!t.recurrence?.completedDates?.includes(today);
        if (!doneNow && !doneRecurring) continue;
        if (!canViewTask(t, uid, false)) continue;
        doneToday.push({ taskId: t.id, text: plainText(t.text) || 'a task' });
      }
      const visibility = (goalsSnap.data() as { visibility?: string } | undefined)?.visibility ?? 'friends';
      const workouts =
        visibility === 'friends'
          ? ((daySnap.data() as { workouts?: { type?: string; minutes?: number; distanceKm?: number }[] } | undefined)?.workouts ?? []).map(describeWorkout)
          : [];
      return {
        uid: fid,
        displayName: nameOf(friend),
        doneToday,
        workoutsToday: workouts,
        streak: friend.streakData?.currentStreak ?? 0,
      };
    }),
  );
  return out.filter((x): x is FriendActivity => !!x);
}

/**
 * Friend invite with consent: creates friendInvites/{id} {fromUid,toUid,status:'pending',createdAt}.
 * `byPhoneOrCode`: friendCode (6 chars, any case) or a phone number (digits, + and spaces ok) looked up in waLinks/{digits}.
 * If the invitee is WhatsApp-linked they get buttons `invite:accept:<id>` / `invite:decline:<id>`.
 */
export async function inviteFriend(
  uid: string,
  byPhoneOrCode: string,
  opts?: { toUid?: string },
): Promise<{ ok: boolean; reason?: string; inviteId?: string }> {
  const me = await loadUser(uid);
  if (!me) return { ok: false, reason: 'no_user' };
  const raw = byPhoneOrCode.trim();
  const digits = raw.replace(/[^\d]/g, '');
  const looksLikePhone = digits.length >= 8 && /^[\d\s+()-]+$/.test(raw);
  let toUid: string | null = null;
  const db = adminDb();
  if (opts?.toUid) {
    toUid = (await loadUser(opts.toUid)) ? opts.toUid : null;
  } else if (looksLikePhone) {
    const l = await db.doc(`waLinks/${digits}`).get();
    toUid = l.exists ? ((l.data() as { uid?: string }).uid ?? null) : null;
  } else {
    const q = await db.collection('users').where('friendCode', '==', raw.toUpperCase()).limit(1).get();
    toUid = q.empty ? null : q.docs[0].id;
  }
  if (!toUid) return { ok: false, reason: 'not_found' };
  if (toUid === uid) return { ok: false, reason: 'self' };
  if ((me.friends ?? []).includes(toUid)) return { ok: false, reason: 'already_friends' };
  const dupe = await db
    .collection('friendInvites')
    .where('fromUid', '==', uid)
    .where('toUid', '==', toUid)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (!dupe.empty) return { ok: false, reason: 'already_invited' };

  const ref = db.collection('friendInvites').doc();
  await ref.set({ fromUid: uid, toUid, status: 'pending', createdAt: deps.now() });

  // In-app inbox item + push (the notification Cloud Function sends FCM/Expo on create), so app-only users hear about it.
  try {
    const to = await loadUser(toUid);
    if (to && to.notificationSettings?.enabled !== false) {
      await createNotification({
        userId: toUid,
        type: 'announcement',
        title: `🤝 ${nameOf(me)} wants to be your friend`,
        message: 'Open Friends to accept or decline.',
        fromUserId: uid,
        fromUserName: nameOf(me),
        fromUserPhotoURL: me.photoURL,
        createdAt: deps.now(),
        read: false,
      });
    }
  } catch (e) {
    console.error('[social] invite notification failed', e);
  }

  try {
    const link = await deps.getLinkByUid(toUid);
    if (link && !link.muted && link.friendAlerts && deps.windowOpen(link.lastInboundAt, deps.now())) {
      await deps.sendButtons(link.waId, `${nameOf(me)} wants to be your friend on Nudge. Accept?`, [
        { id: `invite:accept:${ref.id}`, title: 'Accept' },
        { id: `invite:decline:${ref.id}`, title: 'Decline' },
      ]);
    }
    // Outside the 24h window no free message is allowed; the invite stays pending until they next message the bot
    // (the brain can surface pending invites via a query on friendInvites where toUid == uid).
  } catch (e) {
    console.error('[social] invite whatsapp failed', e);
  }
  return { ok: true, inviteId: ref.id };
}

/** Native app entry: invite by friend code or by uid (consent flow, same doc as the bot's invite). */
export async function inviteFriendForApp(uid: string, target: { code: string } | { toUid: string }) {
  return 'toUid' in target ? inviteFriend(uid, '', { toUid: target.toUid }) : inviteFriend(uid, target.code);
}

export async function answerInvite(uid: string, inviteId: string, accept: boolean): Promise<void> {
  const db = adminDb();
  const ref = db.doc(`friendInvites/${inviteId}`);
  const fromUid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('invite_not_found');
    const inv = snap.data() as { fromUid: string; toUid: string; status: string };
    if (inv.toUid !== uid) throw new Error('not_your_invite');
    if (inv.status !== 'pending') throw new Error('invite_already_answered');
    tx.update(ref, { status: accept ? 'accepted' : 'declined', answeredAt: deps.now() });
    if (accept) {
      tx.update(db.doc(`users/${inv.fromUid}`), { friends: FieldValue.arrayUnion(uid) });
      tx.update(db.doc(`users/${uid}`), { friends: FieldValue.arrayUnion(inv.fromUid) });
    }
    return inv.fromUid;
  });
  if (accept) {
    try {
      const [me, link] = await Promise.all([loadUser(uid), deps.getLinkByUid(fromUid)]);
      if (link && !link.muted && deps.windowOpen(link.lastInboundAt, deps.now())) {
        await deps.sendText(link.waId, `${nameOf(me)} accepted your friend invite.`);
      }
    } catch (e) {
      console.error('[social] invite accept notice failed', e);
    }
  }
}
