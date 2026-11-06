// Self-service account deletion: POST /api/app/account/delete (app/api/app/account/delete/route.ts) calls
// `deleteAccount(uid)` for the CALLER's own uid. Every step is idempotent and safe to re-run: a failed run throws, the app
// retries, and the next run picks up where the last one stopped. The Auth user is deleted LAST, so a retry is always possible.
//
// Safety rules (deleting someone else's data is the worst outcome):
// - Only docs keyed by this uid, or whose owner field (`userId`, `fromUserId`, `fromUid`/`toUid`, `ownerUid`, `uid`, `from`/`to`, `reporterUid`)
//   equals this uid, are deleted. Other people's docs are only UPDATED, and only to remove this uid
//   (friends arrays, friendKeys.<uid>, this person's comments/reactions on friends' tasks).
// - WhatsApp-number data (waSessions, waSchedule, waReminderCaps, waSeen fwdnote, vaultUploads, learningLog) is deleted only for
//   numbers whose waLinks/{waId} doc points at THIS uid. A number now linked to another account is skipped (number reuse).
// - betaWhitelist/{email} is removed only when no other users doc has that e-mail.
// - Drive files sent to the vault are in the OWNER's Google Drive: listed in `kept`, never deleted here.
//
// Progress lives in accountDeletions/{uid} (server-only; firestore.rules denies clients and blocks re-creating users/{uid}
// once it exists). While running it holds the identifiers needed for a retry (email, waIds, learnIds); when done it is
// replaced by { status:'done', doneAt } (no personal data).
import { FieldPath, FieldValue, type DocumentReference, type Query } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './firebaseAdmin';

const PAGE = 300;
const ONDOC_PARALLEL = 16;
const HIGH = String.fromCharCode(0xf8ff);

export interface DeleteDeps {
  now: () => number;
  /** `path` ending in '/' = delete every Storage object under that folder; otherwise exactly that one object. Returns how many. */
  deleteStorage: (path: string) => Promise<number>;
  /** Delete the Nudge Google calendar + revoke the refresh token (best effort; must not throw on revoked tokens). */
  disconnectGoogle: (uid: string) => Promise<void>;
  /** Delete the Firebase Auth user; a missing user is fine. */
  deleteAuthUser: (uid: string) => Promise<void>;
}

async function realStorage(path: string): Promise<number> {
  const { getStorage } = await import('firebase-admin/storage');
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || undefined;
  adminDb(); // make sure the default app is initialised
  const bucket = getStorage().bucket(name);
  if (!path.endsWith('/')) {
    // Exact object only: a prefix would also match another uid that starts with this one.
    const [exists] = await bucket.file(path).exists();
    if (!exists) return 0;
    await bucket.file(path).delete({ ignoreNotFound: true });
    return 1;
  }
  const [files] = await bucket.getFiles({ prefix: path });
  await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
  return files.length;
}

export const deps: DeleteDeps = {
  now: () => Date.now(),
  deleteStorage: realStorage,
  disconnectGoogle: async (uid) => {
    const { disconnect } = await import('./googleCal');
    await disconnect(uid);
  },
  deleteAuthUser: async (uid) => {
    try {
      await adminAuth().deleteUser(uid);
    } catch (e) {
      if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
    }
  },
};

export interface DeleteReport {
  uid: string;
  /** collection (or storage prefix) -> docs/files removed in this run. */
  deleted: Record<string, number>;
  /** collection -> other people's docs that had this uid removed from them. */
  updated: Record<string, number>;
  /** WhatsApp numbers whose data was deleted / skipped because they are linked to another account now. */
  waIds: string[];
  skippedWaIds: string[];
  /** What is NOT deleted, for the response and the docs. */
  kept: string[];
}

export const KEPT = [
  'Files sent to the Nudge vault on WhatsApp are in the Nudge owner\'s Google Drive and are not deleted automatically; e-mail ibrahim@iskaria.com to have them removed.',
  'Copies of coach conversations kept to improve Nudge have names and numbers removed; the ones linked to you are deleted.',
];

const db = () => adminDb();

/** Delete every doc a query matches, in pages. The query must stop matching a doc once it is deleted (field filters do). */
async function deleteQuery(q: Query, onDoc?: (ref: DocumentReference, data: FirebaseFirestore.DocumentData) => Promise<void>): Promise<number> {
  let n = 0;
  for (;;) {
    const snap = await q.limit(PAGE).get();
    if (snap.empty) return n;
    // In parallel, ONDOC_PARALLEL at a time: one Storage listing per task, one by one, could pass maxDuration (60 s) for a
    // person with hundreds of tasks, and a retry would restart the same page forever.
    if (onDoc) {
      for (let i = 0; i < snap.docs.length; i += ONDOC_PARALLEL) {
        await Promise.all(snap.docs.slice(i, i + ONDOC_PARALLEL).map((d) => onDoc(d.ref, d.data())));
      }
    }
    const batch = db().batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    n += snap.size;
    if (snap.size < PAGE) return n;
  }
}

/** Doc-id prefix query on a top-level collection, e.g. waSchedule ids `<waId>_<date>_<kind>`. */
const idPrefix = (col: string, prefix: string) =>
  db().collection(col).where(FieldPath.documentId(), '>=', prefix).where(FieldPath.documentId(), '<', prefix + HIGH);

async function deleteDoc(path: string): Promise<number> {
  const ref = db().doc(path);
  const s = await ref.get();
  if (!s.exists) return 0;
  await ref.delete();
  return 1;
}

const add = (m: Record<string, number>, k: string, n: number) => {
  if (n) m[k] = (m[k] ?? 0) + n;
};

/** Is waLinks/{waId} this user's? Returns its learnId too. */
async function ownedLink(uid: string, waId: string): Promise<{ owned: boolean; exists: boolean; learnId?: string }> {
  const s = await db().doc(`waLinks/${waId}`).get();
  if (!s.exists) return { owned: false, exists: false };
  const d = s.data() as { uid?: string; learnId?: string };
  return { owned: d.uid === uid, exists: true, learnId: d.learnId };
}

interface Tomb { status?: string; email?: string; waIds?: string[]; learnIds?: string[]; startedAt?: number }

export async function deleteAccount(uid: string, d: DeleteDeps = deps): Promise<DeleteReport> {
  if (!uid || uid.includes('/')) throw new Error('bad uid');
  const deleted: Record<string, number> = {};
  const updated: Record<string, number> = {};
  const tombRef = db().doc(`accountDeletions/${uid}`);
  const [tombSnap, userSnap] = await Promise.all([tombRef.get(), db().doc(`users/${uid}`).get()]);
  const tomb = (tombSnap.data() as Tomb | undefined) ?? {};
  const user = (userSnap.data() ?? {}) as { email?: string; friends?: string[]; whatsapp?: { waId?: string } };

  // ---- identifiers (kept in the tombstone so a retry after users/{uid} is gone still knows them) ----
  const email = (user.email || tomb.email || '').trim();
  const candidates = new Set<string>([...(tomb.waIds ?? [])]);
  if (user.whatsapp?.waId) candidates.add(user.whatsapp.waId);
  for (const l of (await db().collection('waLinks').where('uid', '==', uid).get()).docs) candidates.add(l.id);
  const waIds: string[] = [];
  const skippedWaIds: string[] = [];
  const learnIds = new Set<string>(tomb.learnIds ?? []);
  for (const w of candidates) {
    if (!/^[0-9]{1,20}$/.test(w)) continue; // a doc id, never a path
    const l = await ownedLink(uid, w);
    if (l.owned) {
      waIds.push(w);
      if (l.learnId) learnIds.add(l.learnId);
    } else if (!l.exists && (tomb.waIds ?? []).includes(w)) {
      waIds.push(w); // verified as ours in an earlier run, whose link we already deleted
    } else {
      skippedWaIds.push(w); // linked to someone else now, or never verified as ours: leave it alone
    }
  }
  await tombRef.set(
    { status: 'running', startedAt: tomb.startedAt ?? d.now(), email, waIds, learnIds: [...learnIds] },
    { merge: true },
  );

  // ---- Google Calendar (revoke first, while the refresh token is still stored) + ICS feed ----
  await d.disconnectGoogle(uid).catch((e) => console.warn('[accountDelete] google disconnect', (e as Error).message));
  add(deleted, 'calendarFeeds', await deleteQuery(db().collection('calendarFeeds').where('uid', '==', uid)));
  add(deleted, 'calendarLinks', await deleteDoc(`calendarLinks/${uid}`));

  // ---- tasks + their attachments (Storage first, so a retry still finds the task) ----
  add(deleted, 'tasks', await deleteQuery(db().collection('tasks').where('userId', '==', uid), async (ref) => {
    add(deleted, 'storage:attachments', await d.deleteStorage(`attachments/${ref.id}/`));
  }));

  // ---- notifications, bug reports, signups, invites ----
  add(deleted, 'notifications', await deleteQuery(db().collection('notifications').where('userId', '==', uid)));
  add(deleted, 'notifications', await deleteQuery(db().collection('notifications').where('fromUserId', '==', uid)));
  add(deleted, 'bugReports', await deleteQuery(db().collection('bugReports').where('userId', '==', uid)));
  add(deleted, 'storage:bugReports', await d.deleteStorage(`bugReports/${uid}/`));
  add(deleted, 'pendingSignups', await deleteQuery(db().collection('pendingSignups').where('userId', '==', uid)));
  add(deleted, 'friendInvites', await deleteQuery(db().collection('friendInvites').where('fromUid', '==', uid)));
  add(deleted, 'friendInvites', await deleteQuery(db().collection('friendInvites').where('toUid', '==', uid)));
  add(deleted, 'nudgeLimits', await deleteQuery(db().collection('nudgeLimits').where('from', '==', uid)));
  add(deleted, 'nudgeLimits', await deleteQuery(db().collection('nudgeLimits').where('to', '==', uid)));
  // Safety reports this person FILED (reports about them stay: the owner's moderation record) and their block list.
  add(deleted, 'reports', await deleteQuery(db().collection('reports').where('reporterUid', '==', uid)));

  // ---- other people: remove this uid from friends lists, shared keys, and comments/reactions on their tasks ----
  const reverse = await db().collection('users').where('friends', 'array-contains', uid).get();
  const friendIds = new Set<string>([...(user.friends ?? []), ...reverse.docs.map((x) => x.id)]);
  friendIds.delete(uid);
  for (const f of reverse.docs) {
    await f.ref.update({ friends: FieldValue.arrayRemove(uid) });
    add(updated, 'users.friends', 1);
  }
  for (const fid of friendIds) {
    const kref = db().doc(`userKeys/${fid}`);
    const ks = await kref.get();
    const fk = ks.data()?.friendKeys as Record<string, unknown> | undefined;
    if (ks.exists && fk && Object.prototype.hasOwnProperty.call(fk, uid)) {
      await kref.update(new FieldPath('friendKeys', uid), FieldValue.delete());
      add(updated, 'userKeys.friendKeys', 1);
    }
  }
  add(updated, 'tasks.comments', await stripFromFriendTasks(uid, [...friendIds]));

  // ---- docs keyed by uid ----
  for (const p of [`userKeys/${uid}`, `blocks/${uid}`, `fitnessGoals/${uid}`, `presence/${uid}`, `calendarEventVisibility/${uid}`, `migrationStatus/${uid}`]) {
    add(deleted, p.split('/')[0], await deleteDoc(p));
  }
  for (const col of ['fitness', 'focusSessions', 'calendarEvents']) {
    const ref = db().doc(`${col}/${uid}`);
    const subs = await ref.listCollections();
    let n = 0;
    for (const s of subs) n += (await s.count().get()).data().count;
    if (n || (await ref.get()).exists) await db().recursiveDelete(ref);
    add(deleted, col, n);
  }

  // ---- medication plans this person set up (plans where they are only the patient belong to someone else) ----
  add(deleted, 'medPlans', await deleteQuery(db().collection('medPlans').where('ownerUid', '==', uid), async (ref) => {
    add(deleted, 'medDoses', await deleteQuery(db().collection('medDoses').where('planId', '==', ref.id)));
  }));
  add(deleted, 'medDoses', await deleteQuery(db().collection('medDoses').where('ownerUid', '==', uid)));

  // ---- WhatsApp numbers verified as this person's ----
  for (const w of waIds) {
    add(deleted, 'waSessions', await deleteDoc(`waSessions/${w}`));
    add(deleted, 'waSchedule', await deleteQuery(idPrefix('waSchedule', `${w}_`)));
    add(deleted, 'waReminderCaps', await deleteQuery(idPrefix('waReminderCaps', `${w}_`)));
    add(deleted, 'waReminderCaps', await deleteQuery(idPrefix('waReminderCaps', `med_${w}_`)));
    add(deleted, 'waSeen', await deleteQuery(idPrefix('waSeen', `fwdnote:${w}:`)));
    add(deleted, 'vaultUploads', await deleteQuery(db().collection('vaultUploads').where('from', '==', w)));
  }
  for (const lid of learnIds) add(deleted, 'learningLog', await deleteQuery(db().collection('learningLog').where('lid', '==', lid)));
  for (const w of waIds) {
    // Re-check inside a transaction: never delete a link that was re-pointed at another account meanwhile.
    const ref = db().doc(`waLinks/${w}`);
    const n = await db().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (!s.exists || (s.data() as { uid?: string }).uid !== uid) return 0;
      tx.delete(ref);
      return 1;
    });
    add(deleted, 'waLinks', n);
  }
  add(deleted, 'waLinkCodes', await deleteQuery(db().collection('waLinkCodes').where('uid', '==', uid)));
  add(deleted, 'appLogins', await deleteQuery(db().collection('appLogins').where('uid', '==', uid)));

  // ---- profile photo, whitelist, the profile itself ----
  add(deleted, 'storage:profilePictures', await d.deleteStorage(`profilePictures/${uid}`));
  if (email) {
    const lower = email.toLowerCase();
    const sameEmail = [
      ...(await db().collection('users').where('email', '==', email).get()).docs,
      ...(lower !== email ? (await db().collection('users').where('email', '==', lower).get()).docs : []),
    ].filter((x) => x.id !== uid);
    if (!sameEmail.length) add(deleted, 'betaWhitelist', await deleteDoc(`betaWhitelist/${lower}`));
  }
  add(deleted, 'users', await deleteDoc(`users/${uid}`));

  // ---- done: forget the identifiers, then the Auth user, then sweep docs an open app may have re-created ----
  await tombRef.set({ status: 'done', doneAt: d.now() });
  await d.deleteAuthUser(uid);
  for (const p of [`users/${uid}`, `presence/${uid}`, `userKeys/${uid}`]) add(deleted, p.split('/')[0], await deleteDoc(p));

  return { uid, deleted, updated, waIds, skippedWaIds, kept: KEPT };
}

interface CommentLike { userId?: string; reactions?: { userId?: string }[] }

/** Remove this person's comments and reactions (and reactions on comments) from friends' tasks. Returns tasks changed. */
async function stripFromFriendTasks(uid: string, friendIds: string[]): Promise<number> {
  let changed = 0;
  for (let i = 0; i < friendIds.length; i += 30) {
    const chunk = friendIds.slice(i, i + 30);
    const snap = await db().collection('tasks').where('userId', 'in', chunk).get();
    for (const t of snap.docs) {
      if (!touches(uid, t.data())) continue;
      const did = await db().runTransaction(async (tx) => {
        const s = await tx.get(t.ref);
        const data = s.data();
        if (!s.exists || !data || !touches(uid, data)) return false;
        const patch: Record<string, unknown> = {};
        if (Array.isArray(data.reactions)) patch.reactions = (data.reactions as { userId?: string }[]).filter((r) => r?.userId !== uid);
        if (Array.isArray(data.comments)) {
          patch.comments = (data.comments as CommentLike[])
            .filter((c) => c?.userId !== uid)
            .map((c) => (Array.isArray(c.reactions) && c.reactions.some((r) => r?.userId === uid) ? { ...c, reactions: c.reactions.filter((r) => r?.userId !== uid) } : c));
        }
        tx.update(t.ref, patch);
        return true;
      });
      if (did) changed++;
    }
  }
  return changed;
}

function touches(uid: string, data: FirebaseFirestore.DocumentData): boolean {
  if (data.userId === uid) return false; // never edit this person's own task here (deleted above anyway)
  const rs = Array.isArray(data.reactions) ? (data.reactions as { userId?: string }[]) : [];
  const cs = Array.isArray(data.comments) ? (data.comments as CommentLike[]) : [];
  return rs.some((r) => r?.userId === uid) || cs.some((c) => c?.userId === uid || (c?.reactions ?? []).some((r) => r?.userId === uid));
}
