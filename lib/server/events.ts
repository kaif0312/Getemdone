// Events (2026-11-07): things that happen at a time for a while (class, appointment, flight). Stored as `meetings/{id}` docs with
// kind 'event' (lib/meetings/types.ts), so the doc, API auth, rules and native listener of Meetings are reused. An event has NO
// Meet link, NO attendees and NEVER needs the owner's Google token; it reaches Google through the user's own "Nudge" calendar
// mirror (lib/server/calendarEvents.ts + googleCal.ts) and the ICS feed, with its real length. Pure rules: lib/events/rules.ts.
//
// Reminders: reminder-only tasks (task.reminderOf = the event id, hidden everywhere) delivered by lib/server/reminders.ts, like
// meetings. A one-off gets them at create. A REPEATING event has ONE doc; only the NEXT occurrence has reminder tasks
// (`remindersFor` = its start). `rollEventReminders` (15-min cron) moves them to the next occurrence once the last one has
// started; create / update / cancel-one do the same at once.
import { adminDb } from './firebaseAdmin';
import { addTasks, deleteTask } from './tasks';
import { BadRequest, parseStart, reminderFireTimes, reminderText } from './meetings';
import {
  DEFAULT_MEETING_TZ, type CreateMeetingRequest, type EventItem, type Meeting, type UpdateEventRequest,
} from '../meetings/types';
import {
  EVENT_DEFAULT_DURATION_MIN, EVENT_MAX_DURATION_MIN, EVENT_MIN_DURATION_MIN, alignSeries, currentOrNext, defaultReminderMinutes,
  localDay, nextStart, normalizeRepeat, type EventRepeat,
} from '../events/rules';

const col = () => adminDb().collection('meetings');
const DAY = 86_400_000;

type EventDoc = Meeting & { attendeeUids: string[]; reminderTaskIds: string[]; recurring: boolean; remindersFor?: number | null };

const publicOf = (d: FirebaseFirestore.DocumentData): Meeting => {
  const { attendeeUids: _a, reminderTaskIds: _r, recurring: _c, remindersFor: _f, ...m } = d as EventDoc; // eslint-disable-line @typescript-eslint/no-unused-vars
  return m;
};

function validTz(tz: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

// ---------- pure: validate a request ----------

export interface NormalizedEvent {
  title: string; startMs: number; endMs: number; tz: string; notes?: string; location?: string;
  reminderMinutes: number[]; repeat?: EventRepeat; createdVia: Meeting['createdVia'];
}

function cleanMinutes(rm: unknown): number[] {
  if (!Array.isArray(rm) || rm.length > 5 || rm.some((n) => !Number.isFinite(n) || n < 0 || n > 7 * 1440)) throw new BadRequest('bad reminderMinutes');
  return [...new Set((rm as number[]).map(Math.round))].sort((a, b) => b - a);
}

export function normalizeEventRequest(b: Partial<CreateMeetingRequest>, now: number = Date.now()): NormalizedEvent {
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  if (!title || title.length > 200) throw new BadRequest('title required (max 200)');
  const tz = typeof b.tz === 'string' && b.tz ? b.tz : DEFAULT_MEETING_TZ;
  if (!validTz(tz)) throw new BadRequest('bad tz');
  if (typeof b.start !== 'string') throw new BadRequest('start required');
  const dur = b.durationMin === undefined ? EVENT_DEFAULT_DURATION_MIN : Number(b.durationMin);
  if (!Number.isFinite(dur) || dur < EVENT_MIN_DURATION_MIN || dur > EVENT_MAX_DURATION_MIN) throw new BadRequest('durationMin must be 5..1440');
  if (!['claude-code', 'bot', 'app'].includes(b.createdVia as string)) throw new BadRequest('bad createdVia');
  let startMs = parseStart(b.start, tz);
  let endMs = startMs + Math.round(dur) * 60_000;
  const repeat = b.repeat === undefined || b.repeat === null ? undefined : normalizeRepeat(b.repeat);
  if (b.repeat && !repeat) throw new BadRequest('bad repeat');
  if (repeat) {
    const a = alignSeries({ startAt: new Date(startMs).toISOString(), endAt: new Date(endMs).toISOString(), tz, repeat }, now);
    if (!a) throw new BadRequest('repeat never occurs');
    startMs = Date.parse(a.startAt); endMs = Date.parse(a.endAt);
    if (repeat.until && repeat.until < localDay(startMs, tz)) throw new BadRequest('repeat ends before it starts');
  } else if (startMs < now - 60_000) {
    throw new BadRequest('start is in the past');
  }
  const reminderMinutes = b.reminderMinutes === undefined ? defaultReminderMinutes(startMs, now) : cleanMinutes(b.reminderMinutes);
  const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 2000) : undefined;
  const location = typeof b.location === 'string' && b.location.trim() ? b.location.trim().slice(0, 200) : undefined;
  return { title, startMs, endMs, tz, reminderMinutes, ...(repeat ? { repeat } : {}), ...(notes ? { notes } : {}), ...(location ? { location } : {}), createdVia: b.createdVia as Meeting['createdVia'] };
}

// ---------- reminders ----------

/** Replace the reminder tasks of `id` with ones for the next occurrence after `now`. Returns what the doc should record. */
async function rebuildReminders(ownerUid: string, id: string, ev: Pick<Meeting, 'title' | 'startAt' | 'endAt' | 'tz' | 'repeat' | 'exceptions' | 'reminderMinutes'>, oldIds: string[], now: number): Promise<{ reminderTaskIds: string[]; remindersFor: number | null }> {
  await Promise.all(oldIds.map((t) => deleteTask(ownerUid, t).catch(() => undefined)));
  const next = nextStart(ev, now);
  if (!next) return { reminderTaskIds: [], remindersFor: null };
  const fires = reminderFireTimes(next.startMs, ev.reminderMinutes, now);
  if (!fires.length) return { reminderTaskIds: [], remindersFor: next.startMs };
  const text = reminderText(ev.title, ev.tz, next.startMs);
  const tasks = await addTasks(ownerUid, fires.map((f) => ({ text, remindAt: f.fireAt, remindFor: next.startMs, visibility: 'private' as const, reminderOf: id })));
  return { reminderTaskIds: tasks.map((t) => t.id), remindersFor: next.startMs };
}

// ---------- store ----------

export async function createEvent(ownerUid: string, req: Partial<CreateMeetingRequest>, now: number = Date.now()): Promise<{ event: Meeting }> {
  const n = normalizeEventRequest(req, now);
  const ref = col().doc();
  const iso = new Date(now).toISOString();
  const event: Meeting = {
    id: ref.id, ownerUid, kind: 'event', title: n.title, startAt: new Date(n.startMs).toISOString(), endAt: new Date(n.endMs).toISOString(), tz: n.tz,
    attendees: [], ...(n.repeat ? { repeat: n.repeat } : {}), ...(n.notes ? { notes: n.notes } : {}), ...(n.location ? { location: n.location } : {}),
    status: 'scheduled', createdVia: n.createdVia, reminderMinutes: n.reminderMinutes, createdAt: iso, updatedAt: iso,
  };
  let rem: { reminderTaskIds: string[]; remindersFor: number | null } = { reminderTaskIds: [], remindersFor: null };
  try {
    rem = await rebuildReminders(ownerUid, ref.id, event, [], now);
  } catch (e) {
    console.error('[events] reminders failed', (e as Error).message); // a failed reminder must not lose the event
  }
  const doc: EventDoc = { ...event, attendeeUids: [], reminderTaskIds: rem.reminderTaskIds, recurring: !!n.repeat, remindersFor: rem.remindersFor };
  await ref.set(doc);
  return { event };
}

export async function getEvent(id: string): Promise<Meeting | null> {
  const s = await col().doc(id).get();
  return s.exists && s.data()?.kind === 'event' ? publicOf(s.data()!) : null;
}

const itemOf = (m: Meeting, now: number): EventItem => {
  const o = currentOrNext(m, now);
  return { ...m, next: o ? { startAt: new Date(o.startMs).toISOString(), endAt: new Date(o.endMs).toISOString() } : null };
};

/** Upcoming events of `uid` (running now or ahead), soonest occurrence first. Repeating ones appear once, at their next occurrence. */
export async function listUpcomingEvents(uid: string, limit = 20, now: number = Date.now()): Promise<EventItem[]> {
  const [oneOff, series] = await Promise.all([
    col().where('ownerUid', '==', uid).where('startAt', '>=', new Date(now - 24 * 3_600_000).toISOString()).orderBy('startAt').limit(200).get(),
    col().where('ownerUid', '==', uid).where('recurring', '==', true).get(),
  ]);
  const seen = new Set<string>();
  const items: EventItem[] = [];
  for (const d of [...oneOff.docs, ...series.docs]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const data = d.data();
    if (data.kind !== 'event' || data.status !== 'scheduled') continue;
    const it = itemOf(publicOf(data), now);
    if (it.next) items.push(it);
  }
  return items.sort((a, b) => Date.parse(a.next!.startAt) - Date.parse(b.next!.startAt)).slice(0, Math.min(Math.max(limit, 1), 100));
}

/** Every live event doc of `uid` that could touch [now - 1 day, now + 90 days]: for the calendar mirror. */
export async function eventsForMirror(uid: string, now: number = Date.now()): Promise<Meeting[]> {
  const [oneOff, series] = await Promise.all([
    col().where('ownerUid', '==', uid).where('startAt', '>=', new Date(now - 2 * DAY).toISOString()).orderBy('startAt').limit(300).get(),
    col().where('ownerUid', '==', uid).where('recurring', '==', true).get(),
  ]);
  const seen = new Set<string>();
  const out: Meeting[] = [];
  for (const d of [...oneOff.docs, ...series.docs]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    if (d.data().kind === 'event' && d.data().status === 'scheduled') out.push(publicOf(d.data()));
  }
  return out;
}

async function load(uid: string, id: string): Promise<{ ref: FirebaseFirestore.DocumentReference; d: EventDoc } | null> {
  const ref = col().doc(id);
  const s = await ref.get();
  if (!s.exists || s.data()?.ownerUid !== uid || s.data()?.kind !== 'event') return null;
  return { ref, d: s.data() as EventDoc };
}

export async function updateEvent(uid: string, id: string, patch: UpdateEventRequest, now: number = Date.now()): Promise<Meeting | null> {
  const cur = await load(uid, id);
  if (!cur || cur.d.status !== 'scheduled') return null;
  const d = cur.d;
  const tz = patch.tz ?? d.tz;
  const durNow = Math.round((Date.parse(d.endAt) - Date.parse(d.startAt)) / 60_000);
  const repeatIn = patch.repeat === undefined ? d.repeat : patch.repeat === null ? undefined : patch.repeat;
  const n = normalizeEventRequest({
    title: patch.title ?? d.title,
    start: patch.start ?? d.startAt,
    durationMin: patch.durationMin ?? durNow,
    tz,
    notes: patch.notes === null ? undefined : patch.notes ?? d.notes,
    location: patch.location === null ? undefined : patch.location ?? d.location,
    reminderMinutes: patch.reminderMinutes ?? d.reminderMinutes,
    repeat: repeatIn,
    createdVia: d.createdVia,
  }, patch.start === undefined && !d.repeat ? Math.min(now, Date.parse(d.startAt)) : now);
  // Moving a series keeps its days; changing only the title of a past-anchored series must not re-anchor it.
  const startAt = patch.start === undefined && d.repeat && patch.repeat === undefined ? d.startAt : new Date(n.startMs).toISOString();
  const endAt = patch.start === undefined && d.repeat && patch.repeat === undefined ? new Date(Date.parse(d.startAt) + (n.endMs - n.startMs)).toISOString() : new Date(n.endMs).toISOString();
  const next: Meeting = {
    ...publicOf(d), title: n.title, startAt, endAt, tz: n.tz, reminderMinutes: n.reminderMinutes, updatedAt: new Date(now).toISOString(),
    ...(n.repeat ? { repeat: n.repeat } : {}), ...(n.notes ? { notes: n.notes } : {}), ...(n.location ? { location: n.location } : {}),
  };
  if (!n.repeat) delete next.repeat;
  if (!n.notes) delete next.notes;
  if (!n.location) delete next.location;
  if (patch.start !== undefined || patch.repeat !== undefined) delete next.exceptions; // a moved / re-ruled series forgets its skipped days
  const rem = await rebuildReminders(uid, id, next, d.reminderTaskIds ?? [], now);
  await cur.ref.set({ ...next, attendeeUids: [], reminderTaskIds: rem.reminderTaskIds, recurring: !!n.repeat, remindersFor: rem.remindersFor });
  return next;
}

/** Cancel an event (a whole series), or with `date` just that local day of a repeating one. null = not found. */
export async function cancelEvent(uid: string, id: string, opts: { date?: string } = {}, now: number = Date.now()): Promise<Meeting | null> {
  const cur = await load(uid, id);
  if (!cur) return null;
  const d = cur.d;
  if (opts.date && d.repeat && /^\d{4}-\d{2}-\d{2}$/.test(opts.date)) {
    const exceptions = [...new Set([...(d.exceptions ?? []), opts.date])].sort();
    const next: Meeting = { ...publicOf(d), exceptions, updatedAt: new Date(now).toISOString() };
    if (!currentOrNext(next, now)) return cancelEvent(uid, id, {}, now); // that was the last one
    const rem = await rebuildReminders(uid, id, next, d.reminderTaskIds ?? [], now);
    await cur.ref.update({ exceptions, updatedAt: next.updatedAt, reminderTaskIds: rem.reminderTaskIds, remindersFor: rem.remindersFor });
    return next;
  }
  await Promise.all((d.reminderTaskIds ?? []).map((t) => deleteTask(uid, t).catch(() => undefined)));
  const patch = { status: 'cancelled' as const, updatedAt: new Date(now).toISOString(), reminderTaskIds: [], remindersFor: null };
  await cur.ref.update(patch);
  return publicOf({ ...d, ...patch });
}

/** Cron: move the reminder tasks of repeating events to their next occurrence once the previous one has started. */
export async function rollEventReminders(now: number = Date.now()): Promise<{ checked: number; rolled: number; failed: number }> {
  const out = { checked: 0, rolled: 0, failed: 0 };
  const snap = await col().where('recurring', '==', true).where('status', '==', 'scheduled').get();
  for (const doc of snap.docs) {
    const d = doc.data() as EventDoc;
    if (d.kind !== 'event') continue;
    out.checked++;
    const due = d.remindersFor == null ? !!nextStart(d, now) : d.remindersFor <= now;
    if (!due) continue;
    try {
      const target = nextStart(d, now)?.startMs ?? null;
      // Claim: only one cron run may rebuild for this occurrence.
      const claimed = await adminDb().runTransaction(async (tx) => {
        const s = await tx.get(doc.ref);
        const cur = s.data() as EventDoc | undefined;
        if (!cur || cur.status !== 'scheduled' || cur.remindersFor !== d.remindersFor) return false;
        tx.update(doc.ref, { remindersFor: target });
        return true;
      });
      if (!claimed) continue;
      const rem = await rebuildReminders(d.ownerUid, doc.id, d, d.reminderTaskIds ?? [], now);
      await doc.ref.update({ reminderTaskIds: rem.reminderTaskIds, remindersFor: rem.remindersFor });
      out.rolled++;
    } catch (e) {
      out.failed++;
      console.error('[events] roll failed', doc.id, (e as Error).message);
    }
  }
  return out;
}
