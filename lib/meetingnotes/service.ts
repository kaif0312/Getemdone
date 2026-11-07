// Meeting notes -> drafts -> WhatsApp to the OWNER -> tasks + calendar events after he confirms. Dependencies are injected
// (store, google, gemini, sends) so everything here is unit-testable. Production wiring: ./index.ts.
//
// Draft lifecycle (Firestore meetingDrafts/{docId}):
//   pending  created, not yet sent (WhatsApp 24h window closed, or another draft is being answered)
//   sent     the owner has the numbered message; waiting for go / drop / skip / an edit
//   applying a "go" holds the claim and is creating things (a stale claim, >5 min, can be taken again)
//   applied / rejected  finished
// waLinks/{owner}.notes = {id, status, nagged?} points at the draft being answered, so the owner's normal messages cost no
// extra read. Nothing is created anywhere until he says go. Nobody but the owner is ever messaged.
import type { GeminiRequest, GeminiResult } from '@/lib/bot/types';
import type { WaLink } from '@/lib/wa/types';
import { zonedToMs } from '@/lib/bot/format';
import type { GoogleApi, CalendarEventInput } from './google';
import {
  TAG_MINE, TAG_WAITING, dropItems, formatDraft, parseOwnerCommand, planApply, taskText, numbered,
  type Draft, type DraftEvent, type DraftTask,
} from './draft';
import { editDraft, extractDraft } from './extract';

export const SCAN_EVERY_MS = 25 * 60_000; // cron ticks every 15 min; this makes every second tick scan (~30 min)
export const MAX_DOCS_PER_TICK = 3;
export const MIN_NOTES_CHARS = 200;
export const SEEN_KEEP = 200;
export const NEW_SLACK_MS = 10 * 60_000;
export const GIVE_UP_MS = 12 * 3600_000;
/** Doc already handled by hand before the feature existed: never draft it. */
export const PREMARKED_SEEN = ['1Joasd1FXg1Q5QRzsnqCqqONVU-K-kgj3QxLYOILv-f0'];
export const CALENDAR_ENABLE_URL = 'https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=493071083202';

export type DraftStatus = 'pending' | 'sent' | 'applying' | 'applied' | 'rejected';
export interface DraftDoc extends Draft {
  id: string;
  docName: string;
  status: DraftStatus;
  createdAt: number;
  sentAt?: number;
  applyingAt?: number;
  appliedAt?: number;
  createdTaskIds?: string[];
  createdEventIds?: string[];
  /** Items the owner left out of a partial "go N..." (kept for the record). */
  skipped?: { tasks: DraftTask[]; events: DraftEvent[] };
  calendarError?: string;
}
export interface ScanState { initAt: number; lastScanAt: number; seen: string[] }

export interface NotesStore {
  getState(): Promise<ScanState | null>;
  saveState(s: ScanState): Promise<void>;
  /** false when a draft with this id already exists. */
  createDraft(d: DraftDoc): Promise<boolean>;
  getDraft(id: string): Promise<DraftDoc | null>;
  saveDraft(id: string, patch: Partial<DraftDoc>): Promise<void>;
  /** Atomically move a draft from one of `from` to `to` (a stale 'applying' also counts as claimable when asked). */
  claim(id: string, from: DraftStatus[], to: DraftStatus, now: number): Promise<DraftDoc | null>;
  /** Drafts still open (pending or sent), any order. */
  listOpen(): Promise<DraftDoc[]>;
}

export interface NotesDeps {
  now(): number;
  store: NotesStore;
  google: GoogleApi;
  gemini(req: GeminiRequest): Promise<GeminiResult>;
  ownerWa: string;
  getLink(wa: string): Promise<WaLink | null>;
  updateLink(wa: string, patch: Partial<WaLink>): Promise<void>;
  sendText(to: string, text: string): Promise<string | null>;
  windowOpen(lastInboundAt: number, now: number): boolean;
  addTasks(uid: string, items: { text: string; dueDate?: number; tags?: string[]; visibility?: 'private'; parked?: boolean }[]): Promise<{ id: string }[]>;
  log?(msg: string): void;
}

const seenList = (s: ScanState) => s.seen.slice(-SEEN_KEEP);

// ---------------------------------------------------------------- scan (cron)

export interface ScanResult { skipped?: string; seeded?: number; drafted: number; sent: number; retry: number }

export async function scanNotes(d: NotesDeps): Promise<ScanResult> {
  const out: ScanResult = { drafted: 0, sent: 0, retry: 0 };
  const now = d.now();
  const raw = await d.store.getState();
  // A state doc that exists but is empty/corrupt must behave like "first run" (seed, draft nothing), never like "all notes are new".
  const state = raw && Array.isArray(raw.seen) && Number.isFinite(raw.initAt) && Number.isFinite(raw.lastScanAt) ? raw : null;
  if (state && now - state.lastScanAt < SCAN_EVERY_MS) return { ...out, skipped: 'throttled' };

  const list = await d.google.listNotes();
  if (!state) {
    // First run: remember what exists, draft nothing (the owner's old notes must not flood him).
    const seen = [...new Set([...PREMARKED_SEEN, ...list.map((f) => f.id)])];
    await d.store.saveState({ initAt: now, lastScanAt: now, seen: seen.slice(-SEEN_KEEP) });
    return { ...out, seeded: list.length };
  }

  const known = new Set(state.seen);
  // Only docs created after the first run count as new: a trashed/deleted recent note shifts older ones into the 30-item
  // window, and those must never be drafted. A doc without a parseable createdTime is never drafted.
  const isNew = (f: { createdTime: string }) => Date.parse(f.createdTime) >= state.initAt - NEW_SLACK_MS;
  const fresh = list.filter((f) => !known.has(f.id) && isNew(f)).reverse().slice(0, MAX_DOCS_PER_TICK); // oldest first
  const created: DraftDoc[] = [];
  for (const f of fresh) {
    const text = await d.google.exportText(f.id);
    if (text === null || text.trim().length < MIN_NOTES_CHARS) {
      // Not ready: next tick. After GIVE_UP_MS it is marked seen, or a few empty docs would block newer ones forever.
      if (now - Date.parse(f.createdTime) > GIVE_UP_MS) { known.add(f.id); state.seen.push(f.id); } else out.retry++;
      continue;
    }
    let draft: Draft;
    try {
      draft = await extractDraft((r) => d.gemini(r), f.name, text);
    } catch (e) {
      d.log?.(`[meetingnotes] extract failed ${f.id}: ${(e as Error).message}`);
      out.retry++;
      continue; // Gemini hiccup: retried next tick, not marked seen
    }
    known.add(f.id);
    state.seen.push(f.id);
    const empty = !draft.tasks.length && !draft.events.length;
    const doc: DraftDoc = { ...draft, id: f.id, docName: f.name, status: empty ? 'rejected' : 'pending', createdAt: now };
    if (await d.store.createDraft(doc) && !empty) { created.push(doc); out.drafted++; }
  }
  await d.store.saveState({ ...state, lastScanAt: now, seen: seenList(state) });
  const link = await d.getLink(d.ownerWa); // one read per scan: a pending draft may be sendable now that the window reopened
  if (created.length || link?.notes?.status === 'pending') out.sent += await offerNext(d, link);
  return out;
}

/** Send (or defer) the oldest open draft when none is currently waiting for the owner's answer. Returns 1 if sent. */
export async function offerNext(d: NotesDeps, known?: WaLink | null): Promise<number> {
  const link = known === undefined ? await d.getLink(d.ownerWa) : known;
  if (!link) return 0;
  if (link.notes?.status === 'sent') return 0; // he is still answering the previous one
  const open = (await d.store.listOpen()).sort((a, b) => a.createdAt - b.createdAt);
  const next = open.find((x) => x.status === 'pending') ?? open.find((x) => x.status === 'sent');
  if (!next) {
    if (link.notes) await d.updateLink(d.ownerWa, { notes: null });
    return 0;
  }
  return (await sendDraft(d, next, link)) ? 1 : 0;
}

/** Window open: send the numbered message, mark sent. Closed (or the send failed): leave it pending and flag the link. */
export async function sendDraft(d: NotesDeps, draft: DraftDoc, link: WaLink, lead?: string): Promise<boolean> {
  const now = d.now();
  if (d.windowOpen(link.lastInboundAt, now)) {
    const id = await d.sendText(d.ownerWa, formatDraft(draft, lead ? { lead } : {}));
    if (id) {
      await d.store.saveDraft(draft.id, { status: 'sent', sentAt: now });
      await d.updateLink(d.ownerWa, { notes: { id: draft.id, status: 'sent' } });
      return true;
    }
  }
  // 24h window closed: no paid template exists for this, so wait until he messages (nag in handleOwnerMessage).
  if (link.notes?.id !== draft.id || link.notes.status !== 'pending') {
    await d.updateLink(d.ownerWa, { notes: { id: draft.id, status: 'pending' } });
  }
  return false;
}

// ---------------------------------------------------------------- owner replies (bot)

export const NAG = '📝 You have meeting notes waiting: reply *notes* to see them.';

/** Called for every inbound text before the to-do bot. Returns true when the message was handled here. Cheap: no IO unless
 *  the sender is the owner AND (the text is "notes" OR a draft is waiting and the text looks like a command). */
export async function handleOwnerMessage(d: NotesDeps, link: WaLink, text: string | undefined): Promise<boolean> {
  if (link.waId !== d.ownerWa) return false;
  const waiting = link.notes?.status === 'sent';
  const cmd = parseOwnerCommand(text, waiting);
  if (!cmd) {
    if (link.notes?.status === 'pending' && !link.notes.nagged) {
      await d.sendText(d.ownerWa, NAG);
      await d.updateLink(d.ownerWa, { notes: { ...link.notes, nagged: true } });
    }
    return false; // normal chat carries on
  }
  const now = d.now();
  // The message he just sent reopened the window for this turn's reply.
  const fresh: WaLink = { ...link, lastInboundAt: now };

  if (cmd.t === 'notes') {
    const cur = await currentDraft(d, link);
    if (!cur) { await d.sendText(d.ownerWa, 'No meeting notes waiting 👍'); return true; }
    if (!(await sendDraft(d, cur, fresh))) await d.sendText(d.ownerWa, "I couldn't send it just now. Send *notes* again in a minute.");
    return true;
  }

  const cur = await currentDraft(d, link);
  if (!cur || cur.status === 'pending') { // he never saw it numbered: show it first
    if (cur) await sendDraft(d, cur, fresh);
    else await d.sendText(d.ownerWa, 'No meeting notes waiting 👍');
    return true;
  }

  if (cmd.t === 'skip') {
    const won = await d.store.claim(cur.id, ['sent'], 'rejected', now);
    if (!won) { await d.sendText(d.ownerWa, 'That draft was already handled.'); return true; }
    await d.sendText(d.ownerWa, 'Discarded. Nothing was created 👍');
    await finish(d, fresh);
    return true;
  }
  if (cmd.t === 'drop') {
    const { draft, removed } = dropItems(cur, cmd.nums);
    if (!removed) { await d.sendText(d.ownerWa, `There is no item ${cmd.nums.join(', ')}. Numbers go 1 to ${numbered(cur).length}.`); return true; }
    await d.store.saveDraft(cur.id, { tasks: draft.tasks, events: draft.events });
    await d.sendText(d.ownerWa, formatDraft(draft, { lead: `Removed ${removed}. Updated draft:` }));
    return true;
  }
  if (cmd.t === 'edit') {
    let edited: Draft;
    try {
      edited = await editDraft((r) => d.gemini(r), cur, cmd.text, new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10));
    } catch {
      await d.sendText(d.ownerWa, "I couldn't apply that change. Use *drop 3* to remove an item, or *go* / *skip*.");
      return true;
    }
    await d.store.saveDraft(cur.id, { tasks: edited.tasks, events: edited.events, meeting: edited.meeting, ...(edited.date ? { date: edited.date } : {}) });
    await d.sendText(d.ownerWa, formatDraft(edited, { lead: 'Updated draft:' }));
    return true;
  }
  return applyDraft(d, fresh, cur, cmd.nums);
}

async function currentDraft(d: NotesDeps, link: WaLink): Promise<DraftDoc | null> {
  if (link.notes?.id) {
    const doc = await d.store.getDraft(link.notes.id);
    if (doc && (doc.status === 'pending' || doc.status === 'sent' || doc.status === 'applying')) return doc;
  }
  // Stale or missing pointer: fall back to the oldest open draft.
  const open = (await d.store.listOpen()).sort((a, b) => a.createdAt - b.createdAt);
  return open[0] ?? null;
}

/** The draft is finished: clear the pointer and offer the next waiting one (the owner just wrote, so the window is open). */
async function finish(d: NotesDeps, link: WaLink): Promise<void> {
  await d.updateLink(d.ownerWa, { notes: null });
  await offerNext(d, { ...link, notes: null });
}

// ---------------------------------------------------------------- apply

async function applyDraft(d: NotesDeps, link: WaLink, cur: DraftDoc, nums?: number[]): Promise<boolean> {
  const now = d.now();
  const plan = planApply(cur, nums);
  if (!plan.tasks.length && !plan.events.length) {
    await d.sendText(d.ownerWa, `There is no item ${(nums ?? []).join(', ')}. Numbers go 1 to ${numbered(cur).length}.`);
    return true;
  }
  const claimed = await d.store.claim(cur.id, ['sent'], 'applying', now); // double "go": the second one loses here
  if (!claimed) {
    await d.sendText(d.ownerWa, 'Already on it (or done). Send *notes* to see what is left.');
    return true;
  }
  // Re-plan on the claimed copy so a concurrent edit can't shift the numbers.
  const p = planApply(claimed, nums);
  const tz = link.timezone || 'Asia/Kolkata';
  let taskIds: string[] = [];
  try {
    const items = p.tasks.map((t) => {
      const dueDate = t.due ? zonedToMs(t.due, tz) ?? undefined : undefined;
      return {
        text: taskText(t),
        tags: [t.owner === 'me' ? TAG_MINE : TAG_WAITING],
        visibility: 'private' as const, // client work: not shown to friends
        ...(t.owner === 'other' ? { parked: true } : {}),
        ...(t.owner === 'me' && dueDate ? { dueDate } : {}),
      };
    });
    taskIds = items.length ? (await d.addTasks(link.uid, items)).map((x) => x.id) : [];
  } catch (e) {
    d.log?.(`[meetingnotes] addTasks failed: ${(e as Error).message}`);
    await d.store.saveDraft(cur.id, { status: 'sent' }); // release the claim: he can say go again
    await d.sendText(d.ownerWa, "Couldn't create the tasks (nothing was created). Send *go* to try again.");
    return true;
  }

  // Events on the iskaria calendar. Failures stay on the draft.
  const evIds: string[] = [];
  const failedEvents: DraftEvent[] = [];
  let apiDisabled = false;
  let calendarError: string | undefined;
  for (let i = 0; i < p.events.length; i++) {
    const e = p.events[i];
    if (apiDisabled) { failedEvents.push(e); continue; }
    const input: CalendarEventInput = {
      title: e.title, date: e.date, ...(e.time ? { time: e.time } : {}),
      notes: [e.notes, `From meeting notes: ${claimed.meeting}`].filter(Boolean).join('\n\n'),
      timeZone: tz, key: `${cur.id}:${e.title}:${e.date}:${e.time ?? ''}`,
    };
    const r = await d.google.createEvent(input);
    if (r.ok) evIds.push(r.id);
    else { failedEvents.push(e); calendarError = r.reason; if (r.reason === 'api_disabled') apiDisabled = true; }
  }

  const remaining: Draft = { ...claimed, tasks: [], events: failedEvents };
  const done = failedEvents.length === 0;
  await d.store.saveDraft(cur.id, {
    status: done ? 'applied' : 'sent',
    appliedAt: now,
    tasks: remaining.tasks,
    events: remaining.events,
    createdTaskIds: [...(claimed.createdTaskIds ?? []), ...taskIds],
    createdEventIds: [...(claimed.createdEventIds ?? []), ...evIds],
    ...(p.restTasks.length || p.restEvents.length ? { skipped: { tasks: p.restTasks, events: p.restEvents } } : {}),
    ...(calendarError ? { calendarError } : {}),
  });

  await d.sendText(d.ownerWa, confirmation(p.tasks, taskIds.length, evIds.length, failedEvents.length, apiDisabled, calendarError, p.restTasks.length + p.restEvents.length));
  if (done) await finish(d, link);
  return true;
}

export function confirmation(tasks: DraftTask[], nTasks: number, nEvents: number, nFailed: number, apiDisabled: boolean, calErr: string | undefined, nLeft: number): string {
  const mine = tasks.filter((t) => t.owner === 'me').length;
  const waiting = tasks.length - mine;
  const parts: string[] = [];
  if (nTasks) parts.push(`${nTasks} task${nTasks === 1 ? '' : 's'}${waiting ? ` (${mine} yours, ${waiting} waiting on others)` : ''}`);
  if (nEvents) parts.push(`${nEvents} calendar event${nEvents === 1 ? '' : 's'}`);
  const lines = [parts.length ? `✅ Created ${parts.join(' and ')}.` : 'Nothing created.'];
  if (nTasks) lines.push('They show in the Nudge app now.');
  if (nFailed) {
    lines.push(
      apiDisabled
        ? `⚠️ I did NOT create the ${nFailed} calendar event${nFailed === 1 ? '' : 's'}: the Google Calendar API is switched off for the project. Enable it once: ${CALENDAR_ENABLE_URL}\nThe event${nFailed === 1 ? ' stays' : 's stay'} on the draft: send *notes* later to retry.`
        : `⚠️ ${nFailed} calendar event${nFailed === 1 ? '' : 's'} failed (${calErr ?? 'error'}). They stay on the draft: send *go* to retry.`,
    );
  }
  if (nLeft) lines.push(`Left out ${nLeft} item${nLeft === 1 ? '' : 's'} you didn't pick.`);
  return lines.join('\n');
}
