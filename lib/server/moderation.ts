// Safety controls for the native app (App Store guideline 1.2, user-generated content): report a comment or a person, block a
// person. Routes: POST /api/app/report, POST /api/app/block (app/api/app/*, Bearer = Firebase ID token).
//
// Docs (both server-written only; firestore.rules):
//   reports/{id}  { reporterUid, targetUid, kind:'comment'|'user', reason, note?, taskId?, commentId?, contentSeen?,
//                   contentStored?, status:'open', createdAt, alert:'text'|'template'|'failed' }
//                 The rules also allow a create-only client write by the reporter (the app's offline fallback); no client reads.
//   blocks/{uid}  { uids: string[], updatedAt }  = the people `uid` blocked. Only `uid` may read it (the app hides their
//                 comments/reactions/notifications from it); only the server writes it.
// A block also removes the friendship both ways, declines pending invites between the two, and makes inviteFriend refuse
// (lib/server/social.ts): the blocker gets 'blocked', the blocked person 'not_found' (they are not told).
// Every report is sent to the owner on WhatsApp at once (free text inside his 24 h window, else the nudge_reminder template)
// so it is reviewed within 24 h.
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import * as linksMod from '../wa/links';
import * as sendMod from '../wa/send';

export const REPORT_REASONS = ['spam', 'harassment', 'inappropriate', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportKind = 'comment' | 'user';

/** Reports one person may file per rolling 24 h (each one pings the owner, a template costs money). */
export const MAX_REPORTS_PER_DAY = 20;
const NOTE_MAX = 500;
const CONTENT_MAX = 1000;

const REASON_LABEL: Record<ReportReason, string> = {
  spam: 'Spam',
  harassment: 'Harassment or bullying',
  inappropriate: 'Inappropriate content',
  other: 'Other',
};

export const deps = {
  now: () => Date.now(),
  /** WhatsApp number (digits) that receives report alerts. */
  ownerWa: () => (process.env.NUDGE_REPORT_ALERT_WA || '916238952660').replace(/[^\d]/g, ''),
  getLink: (waId: string) => linksMod.getLink(waId),
  windowOpen: (lastInboundAt: number, now?: number) => sendMod.windowOpen(lastInboundAt, now),
  sendText: (to: string, text: string) => sendMod.sendText(to, text),
  sendTemplate: (to: string, name: string, vars: string[]) => sendMod.sendTemplate(to, name, vars),
};

const db = () => adminDb();
const validUid = (u: unknown): u is string => typeof u === 'string' && u.length > 0 && u.length <= 128 && !u.includes('/');
const clip = (s: unknown, n: number): string => Array.from(typeof s === 'string' ? s.trim() : '').slice(0, n).join('');

async function nameOf(uid: string): Promise<string | null> {
  const s = await db().doc(`users/${uid}`).get();
  if (!s.exists) return null;
  return ((s.data() as { displayName?: string }).displayName || '').trim() || 'Someone';
}

// ---------------------------------------------------------------- blocks

/** The people `uid` has blocked. */
export async function blockedBy(uid: string): Promise<string[]> {
  const s = await db().doc(`blocks/${uid}`).get();
  const u = (s.data() as { uids?: unknown } | undefined)?.uids;
  return Array.isArray(u) ? u.filter((x): x is string => typeof x === 'string') : [];
}

/** Has a blocked b, or b blocked a? `aBlockedB` / `bBlockedA` say which. */
export async function blockBetween(a: string, b: string): Promise<{ aBlockedB: boolean; bBlockedA: boolean }> {
  const [ab, ba] = await Promise.all([blockedBy(a), blockedBy(b)]);
  return { aBlockedB: ab.includes(b), bBlockedA: ba.includes(a) };
}

export type BlockResult = { ok: true } | { ok: false; reason: 'bad_request' | 'self' | 'not_found' };

/**
 * Block (or unblock) `target` for `uid`. Blocking: adds to blocks/{uid}, removes the friendship both ways (like the app's
 * Remove friend), declines pending invites in both directions. Unblocking only removes the entry (no friendship comes back).
 * Idempotent. A deleted / unknown target can still be unblocked, never blocked.
 */
export async function setBlocked(uid: string, target: unknown, block: boolean): Promise<BlockResult> {
  if (!validUid(uid) || !validUid(target)) return { ok: false, reason: 'bad_request' };
  if (uid === target) return { ok: false, reason: 'self' };
  const ref = db().doc(`blocks/${uid}`);
  if (!block) {
    await ref.set({ uids: FieldValue.arrayRemove(target), updatedAt: deps.now() }, { merge: true });
    return { ok: true };
  }
  const targetRef = db().doc(`users/${target}`);
  const meRef = db().doc(`users/${uid}`);
  const [targetSnap, meSnap] = await Promise.all([targetRef.get(), meRef.get()]);
  if (!targetSnap.exists) return { ok: false, reason: 'not_found' };
  const batch = db().batch();
  batch.set(ref, { uids: FieldValue.arrayUnion(target), updatedAt: deps.now() }, { merge: true });
  if (meSnap.exists) batch.update(meRef, { friends: FieldValue.arrayRemove(target) });
  batch.update(targetRef, { friends: FieldValue.arrayRemove(uid) });
  await batch.commit();
  // Pending invites either way: declined, so neither side can accept one later.
  const pending = await Promise.all([
    db().collection('friendInvites').where('fromUid', '==', uid).where('toUid', '==', target).where('status', '==', 'pending').get(),
    db().collection('friendInvites').where('fromUid', '==', target).where('toUid', '==', uid).where('status', '==', 'pending').get(),
  ]);
  for (const q of pending) for (const d of q.docs) await d.ref.update({ status: 'declined', answeredAt: deps.now(), declinedBy: 'block' });
  return { ok: true };
}

// ---------------------------------------------------------------- reports

export interface ReportInput {
  kind?: unknown;
  targetUid?: unknown;
  reason?: unknown;
  note?: unknown;
  taskId?: unknown;
  commentId?: unknown;
  /** The comment text as the reporter saw it (the app decrypts; the stored copy may be encrypted). */
  contentSeen?: unknown;
}

export type ReportResult =
  | { ok: true; reportId: string; alert: 'text' | 'template' | 'failed' }
  | { ok: false; reason: 'bad_request' | 'self' | 'not_found' | 'rate_limited' };

export async function fileReport(uid: string, input: ReportInput): Promise<ReportResult> {
  const kind = input.kind === 'comment' || input.kind === 'user' ? input.kind : null;
  const reason = REPORT_REASONS.includes(input.reason as ReportReason) ? (input.reason as ReportReason) : null;
  if (!validUid(uid) || !kind || !reason || !validUid(input.targetUid)) return { ok: false, reason: 'bad_request' };
  const targetUid = input.targetUid;
  if (targetUid === uid) return { ok: false, reason: 'self' };
  const taskId = kind === 'comment' && validUid(input.taskId) ? input.taskId : undefined;
  const commentId = kind === 'comment' && typeof input.commentId === 'string' && input.commentId.length <= 128 ? input.commentId : undefined;
  if (kind === 'comment' && (!taskId || !commentId)) return { ok: false, reason: 'bad_request' };

  const now = deps.now();
  // Rate limit: one equality query (no composite index), filtered by time here. Volumes are tiny.
  const mine = await db().collection('reports').where('reporterUid', '==', uid).get();
  if (mine.docs.filter((d) => ((d.data().createdAt as number) ?? 0) > now - 86_400_000).length >= MAX_REPORTS_PER_DAY) {
    return { ok: false, reason: 'rate_limited' };
  }

  const [reporterName, targetName] = await Promise.all([nameOf(uid), nameOf(targetUid)]);
  // A deleted account can still be reported for a comment that is still there; a person report needs the person.
  let contentStored: string | undefined;
  let commentFound = false;
  if (kind === 'comment' && taskId) {
    const t = await db().doc(`tasks/${taskId}`).get();
    const c = ((t.data()?.comments ?? []) as { id?: string; userId?: string; text?: string }[]).find((x) => x?.id === commentId);
    if (c && c.userId === targetUid) {
      commentFound = true;
      contentStored = clip(c.text, CONTENT_MAX);
    }
  }
  if (kind === 'user' && !targetName) return { ok: false, reason: 'not_found' };
  if (kind === 'comment' && !commentFound && !targetName) return { ok: false, reason: 'not_found' };

  const note = clip(input.note, NOTE_MAX);
  const contentSeen = clip(input.contentSeen, CONTENT_MAX);
  const ref = db().collection('reports').doc();
  const doc: Record<string, unknown> = {
    reporterUid: uid, targetUid, kind, reason, status: 'open', createdAt: now, source: 'api',
    ...(note ? { note } : {}),
    ...(taskId ? { taskId } : {}),
    ...(commentId ? { commentId, commentFound } : {}),
    ...(contentSeen ? { contentSeen } : {}),
    ...(contentStored ? { contentStored } : {}),
  };
  await ref.set(doc);

  const what = kind === 'comment' ? `a comment by ${targetName ?? 'a deleted account'}` : `${targetName}`;
  const text = contentStored && !contentStored.startsWith('e1:') ? contentStored : contentSeen;
  const alert = await alertOwner(
    [
      `🚩 Nudge report: ${REASON_LABEL[reason]}`,
      `${reporterName ?? 'Someone'} reported ${what}.`,
      text ? `Comment: "${clip(text, 300)}"` : '',
      note ? `Note: "${clip(note, 300)}"` : '',
      `Reporter ${uid}, reported ${targetUid}${taskId ? `, task ${taskId}` : ''}.`,
      `Report reports/${ref.id}. Review within 24 h.`,
    ].filter(Boolean).join('\n'),
    `${REASON_LABEL[reason]} report ${ref.id}: review it in the reports collection`,
  );
  await ref.update({ alert, alertedAt: deps.now() }).catch(() => undefined);
  return { ok: true, reportId: ref.id, alert };
}

/** Free text inside the owner's 24 h window; otherwise (or if that fails) the approved nudge_reminder template. */
async function alertOwner(text: string, short: string): Promise<'text' | 'template' | 'failed'> {
  const to = deps.ownerWa();
  if (!to) return 'failed';
  try {
    const link = await deps.getLink(to).catch(() => null);
    if (link && deps.windowOpen(link.lastInboundAt, deps.now()) && (await deps.sendText(to, text))) return 'text';
    // 'Reminder from Nudge: "{{1}}" is scheduled for {{2}} today. ...' (scripts/create_wa_templates.mjs)
    if (await deps.sendTemplate(to, 'nudge_reminder', [short, 'now'])) return 'template';
  } catch (e) {
    console.error('[moderation] owner alert failed', e);
  }
  return 'failed';
}
