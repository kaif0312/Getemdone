// Meeting invites over WhatsApp (2026-11-06). Attendees with a `waId` get the meeting on WhatsApp: an invite when it is created, a
// reminder before it starts, a short note when it is cancelled. Docs: AGENTS.md "Meetings over WhatsApp".
//
// Rules: never throws into the caller (a WhatsApp problem must not fail meeting creation / cancel / the reminder tick); skips the
// owner; never messages a `muted` (STOP) person; one message per person per meeting and kind (idempotency doc
// `meetingInvites/{meetingId}_{waId}` for the invite, `..._r{minutes}` for a reminder, `..._cancel`); inside the person's 24 h
// window a free text (+ "Join" URL button) is sent, otherwise the template under the global daily cap (lib/server/waCaps.ts).
// Templates (UTILITY, submitted by hand: scripts/create_wa_templates.mjs): nudge_meeting_invite, nudge_meeting_reminder,
// nudge_meeting_cancelled. Until Meta approves them a template send fails; that is recorded on the idempotency doc.
import { adminDb } from './firebaseAdmin';
import { capDate, releaseTemplateSlot, reserveTemplateSlot } from './waCaps';
import { localTime } from './users';
import * as linksMod from '../wa/links';
import * as sendMod from '../wa/send';
import { langOf } from '../bot/i18n';
import type { Meeting, MeetingAttendee } from '../meetings/types';
import type { WaLink } from '../wa/types';

export type InviteKind = 'invite' | 'reminder' | 'cancel';
export type InviteStatus = 'sending' | 'sent' | 'failed' | 'skipped_muted' | 'skipped_cap' | 'skipped_owner';
export interface InviteDoc {
  meetingId: string; waId: string; kind: InviteKind; minutes?: number; status: InviteStatus;
  via?: 'text' | 'url_button' | 'template'; error?: string; wamid?: string; at: number;
}
export interface InviteResult { waId: string; status: InviteStatus | 'duplicate' | 'skipped_no_wa'; via?: InviteDoc['via']; error?: string }

export const TEMPLATE_INVITE = 'nudge_meeting_invite';
export const TEMPLATE_REMINDER = 'nudge_meeting_reminder';
export const TEMPLATE_CANCELLED = 'nudge_meeting_cancelled';

// ---------- pure helpers ----------

/** Digits only (the same normalisation the bot and normalizeRequest use). */
export const normalizeWaId = (s: string): string => String(s ?? '').replace(/\D/g, '');

/** Meta template variables cannot hold newlines or runs of spaces. */
export function clean(s: string, max = 60): string {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : one.slice(0, max - 1).trimEnd() + '…';
}

function time12(tz: string, at: number): string {
  const [h, m] = localTime(tz, at).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "Sat 7 Nov" in the meeting's zone. */
export function dateLabel(tz: string, at: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(at));
}

/** "11:00 PM (Asia/Kolkata)": the zone is named because the invitee's own zone is unknown. */
export const timeLabel = (tz: string, at: number): string => `${time12(tz, at)} (${tz})`;

const linkOf = (m: Meeting): string => m.meetUrl || 'shared by the organiser soon';

export interface Copy { template: string; vars: string[]; text: string; button?: { label: string; url: string } }

export function inviteCopy(m: Meeting, inviter: string): Copy {
  const start = Date.parse(m.startAt);
  const vars = [clean(inviter, 40), clean(m.title), dateLabel(m.tz, start), timeLabel(m.tz, start), linkOf(m)];
  return {
    template: TEMPLATE_INVITE, vars,
    text: `${vars[0]} invited you to "${vars[1]}" on ${vars[2]} at ${vars[3]}.${m.meetUrl ? '' : ` The meeting link will be shared soon.`}`,
    ...(m.meetUrl ? { button: { label: 'Join meeting', url: m.meetUrl } } : {}),
  };
}

export function reminderCopy(m: Meeting): Copy {
  const start = Date.parse(m.startAt);
  const vars = [clean(m.title), timeLabel(m.tz, start), linkOf(m)];
  return {
    template: TEMPLATE_REMINDER, vars,
    text: `Reminder: "${vars[0]}" starts at ${vars[1]}.`,
    ...(m.meetUrl ? { button: { label: 'Join meeting', url: m.meetUrl } } : {}),
  };
}

export function cancelCopy(m: Meeting, inviter: string): Copy {
  const start = Date.parse(m.startAt);
  const vars = [clean(inviter, 40), clean(m.title), dateLabel(m.tz, start), time12(m.tz, start)];
  return { template: TEMPLATE_CANCELLED, vars, text: `${vars[0]} cancelled "${vars[1]}" planned for ${vars[2]} at ${vars[3]}.` };
}

/** Attendees to message: has a number, is not the owner (by uid or by the owner's linked number), once per number. */
export function recipients(m: Meeting, ownerWaId?: string): MeetingAttendee[] {
  const seen = new Set<string>();
  const out: MeetingAttendee[] = [];
  for (const a of m.attendees ?? []) {
    const waId = normalizeWaId(a.waId ?? '');
    if (!waId || seen.has(waId)) continue;
    if (a.uid && a.uid === m.ownerUid) continue;
    if (ownerWaId && waId === ownerWaId) continue;
    seen.add(waId);
    out.push({ ...a, waId });
  }
  return out;
}

export const docId = (m: Pick<Meeting, 'id'>, waId: string, kind: InviteKind, minutes?: number): string =>
  `${m.id}_${waId}${kind === 'invite' ? '' : kind === 'cancel' ? '_cancel' : `_r${minutes ?? 0}`}`;

// ---------- dependencies (replaced by fakes in tests) ----------

export const deps = {
  now: () => Date.now(),
  getLink: (waId: string): Promise<WaLink | null> => linksMod.getLink(waId),
  getLinkByUid: (uid: string): Promise<WaLink | null> => linksMod.getLinkByUid(uid),
  inviterName: async (uid: string): Promise<string> => {
    const s = await adminDb().doc(`users/${uid}`).get();
    return (s.data()?.displayName as string | undefined) || 'Someone';
  },
  /** Claim the idempotency doc. False = already handled (sent, sending, skipped); a previous 'failed' may be retried. */
  claim: async (id: string, init: InviteDoc): Promise<boolean> => {
    const ref = adminDb().doc(`meetingInvites/${id}`);
    return adminDb().runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists && s.data()?.status !== 'failed') return false;
      tx.set(ref, init);
      return true;
    });
  },
  finish: async (id: string, patch: Partial<InviteDoc>): Promise<void> => {
    await adminDb().doc(`meetingInvites/${id}`).set({ ...patch, at: Date.now() }, { merge: true });
  },
  /** Invite docs with status 'sent' for a meeting (who to tell about a cancellation). */
  sentInviteWaIds: async (meetingId: string): Promise<string[]> => {
    const q = await adminDb().collection('meetingInvites').where('meetingId', '==', meetingId).get();
    return q.docs.map((d) => d.data() as InviteDoc).filter((d) => d.kind === 'invite' && d.status === 'sent').map((d) => d.waId);
  },
  reserve: (day: string) => reserveTemplateSlot(day),
  release: (day: string) => releaseTemplateSlot(day),
  windowOpen: (last: number, now?: number) => sendMod.windowOpen(last, now),
  sendText: (to: string, body: string) => sendMod.sendText(to, body),
  sendUrlButton: (to: string, body: string, label: string, url: string) => sendMod.sendUrlButton(to, body, label, url),
  sendTemplate: (to: string, name: string, vars: string[], opts?: { language?: string }) => sendMod.sendTemplateFallback(to, name, vars, opts),
  lastSendError: () => sendMod.lastSendError(),
};

// ---------- sending ----------

async function sendOne(m: Meeting, a: MeetingAttendee, kind: InviteKind, copy: Copy, minutes?: number): Promise<InviteResult> {
  const waId = a.waId!;
  const id = docId(m, waId, kind, minutes);
  try {
    const now = deps.now();
    const link = await deps.getLink(waId);
    const base: InviteDoc = { meetingId: m.id, waId, kind, ...(minutes !== undefined ? { minutes } : {}), status: 'sending', at: now };
    if (link?.muted) {
      if (await deps.claim(id, { ...base, status: 'skipped_muted' })) return { waId, status: 'skipped_muted' };
      return { waId, status: 'duplicate' };
    }
    if (!(await deps.claim(id, base))) return { waId, status: 'duplicate' };

    let wamid: string | null = null;
    let via: InviteDoc['via'];
    if (link && deps.windowOpen(link.lastInboundAt, now)) {
      if (copy.button) { via = 'url_button'; wamid = await deps.sendUrlButton(waId, copy.text, copy.button.label, copy.button.url); }
      else { via = 'text'; wamid = await deps.sendText(waId, copy.text); }
    }
    if (!wamid) {
      // Window closed (or the free send was refused): the template, within the global daily cap.
      const day = capDate(now);
      if (!(await deps.reserve(day))) {
        await deps.finish(id, { status: 'skipped_cap' });
        return { waId, status: 'skipped_cap' };
      }
      via = 'template';
      wamid = await deps.sendTemplate(waId, copy.template, copy.vars, { language: langOf(link) });
      if (!wamid) await deps.release(day);
    }
    if (wamid) {
      await deps.finish(id, { status: 'sent', via, wamid });
      return { waId, status: 'sent', via };
    }
    const error = deps.lastSendError() || 'send_failed';
    await deps.finish(id, { status: 'failed', via, error });
    return { waId, status: 'failed', via, error };
  } catch (e) {
    const error = (e as Error).message || 'threw';
    console.error('[meetingInvites] send threw', id, error);
    await deps.finish(id, { status: 'failed', error }).catch(() => undefined);
    return { waId, status: 'failed', error };
  }
}

async function ownerWaOf(m: Meeting): Promise<string | undefined> {
  try { return (await deps.getLinkByUid(m.ownerUid))?.waId; } catch { return undefined; }
}

async function run(m: Meeting, kind: InviteKind, build: (inviter: string) => Copy, minutes?: number, only?: (waId: string) => boolean): Promise<InviteResult[]> {
  try {
    let list = recipients(m, await ownerWaOf(m));
    if (only) list = list.filter((a) => only(a.waId!));
    if (!list.length) return [];
    const copy = build(await deps.inviterName(m.ownerUid).catch(() => 'Someone'));
    const out: InviteResult[] = [];
    for (const a of list) out.push(await sendOne(m, a, kind, copy, minutes));
    return out;
  } catch (e) {
    console.error('[meetingInvites] failed', kind, m.id, (e as Error).message);
    return [];
  }
}

/** Invite every attendee that has a waId. Never throws. */
export function inviteAttendees(m: Meeting): Promise<InviteResult[]> {
  if (m.status !== 'scheduled') return Promise.resolve([]);
  return run(m, 'invite', (who) => inviteCopy(m, who));
}

/** Reminder `minutesBefore` the start, to every attendee that has a waId. Never throws. */
export function remindAttendees(m: Meeting, minutesBefore: number): Promise<InviteResult[]> {
  if (m.status !== 'scheduled' || Date.parse(m.endAt) < deps.now()) return Promise.resolve([]);
  return run(m, 'reminder', () => reminderCopy(m), Math.round(minutesBefore));
}

/** Tell the attendees that were invited that the meeting is off. Never throws. */
export async function cancelAttendees(m: Meeting): Promise<InviteResult[]> {
  try {
    const invited = new Set(await deps.sentInviteWaIds(m.id));
    if (!invited.size) return [];
    return await run(m, 'cancel', (who) => cancelCopy(m, who), undefined, (w) => invited.has(w));
  } catch (e) {
    console.error('[meetingInvites] cancel failed', m.id, (e as Error).message);
    return [];
  }
}

/** The reminder fire path (lib/server/reminders.ts): a fired reminder task tagged `meeting` belongs to one meeting, found
 *  through `reminderTaskIds`. Never throws. */
export async function remindForTask(taskId: string, tags: string[] | undefined, eventAt: number, fireAt: number): Promise<void> {
  if (!tags?.includes('meeting')) return;
  try {
    const q = await adminDb().collection('meetings').where('reminderTaskIds', 'array-contains', taskId).limit(1).get();
    if (q.empty) return;
    const { attendeeUids: _a, reminderTaskIds: _r, ...m } = q.docs[0].data(); // eslint-disable-line @typescript-eslint/no-unused-vars
    await remindAttendees(m as Meeting, (eventAt - fireAt) / 60_000);
  } catch (e) {
    console.error('[meetingInvites] remindForTask failed', taskId, (e as Error).message);
  }
}
