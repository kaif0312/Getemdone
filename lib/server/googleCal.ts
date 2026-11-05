// Google Calendar, one-way: Nudge -> a secondary calendar named "Nudge" in the user's own Google account.
//
// WHY this shape (docs/CALENDAR.md): scope `calendar.app.created` lets the app create ITS OWN calendar and touch only
// that, never the user's primary calendar or anyone else's events. It is the narrowest scope that works, so the consent
// screen reads "Make secondary Google calendars, and see, create, change, and delete events on them". Override with env
// NUDGE_GCAL_SCOPE only for debugging.
//
// FLOW: /api/cal/google/start (signed state) -> Google -> /api/cal/google/callback (code -> refresh token, create the
// calendar, first sync) -> the 15-min cron (runCalendarSync) and "sync now" call `syncUser`, which makes Google match
// `eventsForTasks`: insert new, update changed (hash), delete what is gone. Event ids are derived from the task id, so a
// retried insert is idempotent (409 -> update). The existing PWA integration (hooks/useGoogleCalendar.ts, client-held
// tokens, read + create) is separate and untouched.
import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import type { Task } from '@/lib/types';
import { eventsForTasks, type CalEvent } from './calendarEvents';
import {
  clearGoogle, connectedUids, getCalendarLink, origin, patchGoogle, saveGoogle,
  type CalendarLink, type GoogleLink,
} from './calendarLink';

export const API = 'https://www.googleapis.com/calendar/v3';
export const CALENDAR_NAME = 'Nudge';
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/calendar.app.created', 'openid', 'email'];
/** Max Google writes per user per sync, so one big backlog never eats the cron's minute (the rest follows next tick). */
export const MAX_WRITES_PER_SYNC = 60;
const STATE_TTL_MS = 20 * 60_000;

export const scopes = (): string => (process.env.NUDGE_GCAL_SCOPE ? process.env.NUDGE_GCAL_SCOPE : DEFAULT_SCOPES.join(' '));
export const redirectUri = (): string => `${origin()}/api/cal/google/callback`;
// The OAuth client: the published "Iskaria" web client already used for the Drive vault (GDRIVE_*, project dr-jefna-gbp: verified,
// refresh tokens do not expire). id and secret always come as a PAIR from the same source; the PWA's old NEXT_PUBLIC_GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET pair is only the fallback.
const pair = (): { id: string; secret: string } => {
  const g = { id: process.env.GDRIVE_CLIENT_ID || '', secret: process.env.GDRIVE_CLIENT_SECRET || '' };
  if (g.id && g.secret) return g;
  return { id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '', secret: process.env.GOOGLE_CLIENT_SECRET || '' };
};
const clientId = () => pair().id;
const clientSecret = () => pair().secret;
export const googleConfigured = (): boolean => !!(clientId() && clientSecret() && process.env.NUDGE_FORWARD_SECRET);

// ---------- signed state / start links (same HMAC scheme as lib/vault/link.ts) ----------

export type Via = 'wa' | 'app';
export interface StatePayload { uid: string; via: Via; exp: number; n: string }

const mac = (part: string) => createHmac('sha256', process.env.NUDGE_FORWARD_SECRET || '').update(part, 'utf8').digest('hex');

export function signState(uid: string, via: Via, now: number = Date.now(), ttlMs: number = STATE_TTL_MS): string {
  if (!process.env.NUDGE_FORWARD_SECRET) throw new Error('NUDGE_FORWARD_SECRET is not set');
  const part = Buffer.from(JSON.stringify({ uid, via, exp: now + ttlMs, n: randomBytes(6).toString('hex') } satisfies StatePayload), 'utf8').toString('base64url');
  return `${part}.${mac(part)}`;
}

export function verifyState(token: string, now: number = Date.now()): StatePayload | null {
  const [part, sig] = (token || '').split('.');
  if (!part || !sig || !process.env.NUDGE_FORWARD_SECRET) return null;
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(mac(part), 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Partial<StatePayload>;
    if (typeof j.uid !== 'string' || (j.via !== 'wa' && j.via !== 'app') || typeof j.exp !== 'number' || j.exp < now) return null;
    return { uid: j.uid, via: j.via, exp: j.exp, n: String(j.n ?? '') };
  } catch {
    return null;
  }
}

/** The link a person opens (WhatsApp message or the app's browser sheet) to start connecting. */
export function startLink(uid: string, via: Via): string {
  return `${origin()}/api/cal/google/start?s=${encodeURIComponent(signState(uid, via))}`;
}

export function authUrl(state: string, loginHint?: string): string {
  const q = new URLSearchParams({
    client_id: clientId(), redirect_uri: redirectUri(), response_type: 'code', scope: scopes(),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state,
    ...(loginHint ? { login_hint: loginHint } : {}),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

// ---------- Google HTTP (injectable for tests) ----------

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export interface GoogleDeps { fetch: Fetch; now: () => number }
export const realDeps: GoogleDeps = { fetch: (u, i) => fetch(u, i), now: () => Date.now() };

export class RevokedError extends Error {}

interface TokenResponse { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; error?: string; error_description?: string }

async function tokenCall(deps: GoogleDeps, params: Record<string, string>): Promise<TokenResponse & { status: number }> {
  const res = await deps.fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  return { ...body, status: res.status };
}

export async function accessTokenFor(refreshToken: string, deps: GoogleDeps = realDeps): Promise<string> {
  const r = await tokenCall(deps, { grant_type: 'refresh_token', refresh_token: refreshToken });
  if (r.access_token) return r.access_token;
  if (r.error === 'invalid_grant') throw new RevokedError('revoked');
  throw new Error(`token_refresh_failed_${r.status}`);
}

function emailFromIdToken(idToken?: string): string | undefined {
  if (!idToken) return undefined;
  try {
    const p = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as { email?: string };
    return p.email;
  } catch {
    return undefined;
  }
}

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

/** Google event id: lowercase hex of sha1(taskId): valid base32hex, 40 chars, stable per task. */
export function eventId(taskId: string): string {
  return createHash('sha1').update(taskId).digest('hex');
}

export function googleBody(e: CalEvent, tz: string): Record<string, unknown> {
  return {
    id: eventId(e.taskId),
    summary: e.title,
    ...(e.notes ? { description: e.notes } : {}),
    ...(e.date
      ? { start: { date: e.date }, end: { date: new Date(Date.parse(e.date + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10) }, transparency: 'transparent' }
      : { start: { dateTime: new Date(e.startMs!).toISOString(), timeZone: tz }, end: { dateTime: new Date(e.endMs ?? e.startMs! + 1_800_000).toISOString(), timeZone: tz } }),
    extendedProperties: { private: { nudgeTask: e.taskId } },
    source: { title: 'Nudge', url: origin() },
    reminders: { useDefault: true },
  };
}

// ---------- connect / disconnect ----------

export type ConnectResult = { ok: true; email?: string } | { ok: false; reason: string };

/** OAuth callback body: exchange the code, create the "Nudge" calendar, save. The first sync runs right after (caller). */
export async function connect(uid: string, code: string, tz: string, deps: GoogleDeps = realDeps): Promise<ConnectResult> {
  const r = await tokenCall(deps, { grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
  if (!r.access_token || !r.refresh_token) return { ok: false, reason: r.error === 'invalid_grant' ? 'code_expired' : 'no_refresh_token' };
  const created = await deps.fetch(`${API}/calendars`, {
    method: 'POST', headers: authHeaders(r.access_token),
    body: JSON.stringify({ summary: CALENDAR_NAME, description: 'Tasks and reminders from Nudge. Edit them in Nudge, not here.', timeZone: tz }),
  });
  if (!created.ok) return { ok: false, reason: created.status === 403 ? 'insufficient_scope' : `calendar_create_${created.status}` };
  const cal = (await created.json()) as { id?: string };
  if (!cal.id) return { ok: false, reason: 'calendar_create_failed' };
  const email = emailFromIdToken(r.id_token);
  await saveGoogle(uid, { refreshToken: r.refresh_token, email, calendarId: cal.id, scope: scopes(), connectedAt: deps.now(), synced: {} });
  return { ok: true, email };
}

/** Delete the Nudge calendar in Google (that removes every event we wrote), revoke the token, forget the link. Best effort on the Google side. */
export async function disconnect(uid: string, deps: GoogleDeps = realDeps): Promise<void> {
  const g = await clearGoogle(uid);
  if (!g) return;
  try {
    const token = await accessTokenFor(g.refreshToken, deps);
    await deps.fetch(`${API}/calendars/${encodeURIComponent(g.calendarId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  } catch { /* already revoked: nothing left to clean */ }
  try {
    await deps.fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(g.refreshToken)}`, { method: 'POST' });
  } catch { /* ignore */ }
}

// ---------- the sync ----------

export interface SyncStore {
  getLink(uid: string): Promise<CalendarLink>;
  patchGoogle(uid: string, patch: Partial<GoogleLink>): Promise<void>;
  /** Open tasks of the user + their timezone. */
  openTasks(uid: string): Promise<{ tasks: Task[]; tz: string }>;
}

export const realStore: SyncStore = {
  getLink: getCalendarLink,
  patchGoogle,
  openTasks: async (uid) => {
    const { adminDb } = await import('./firebaseAdmin');
    const { getTimezone } = await import('./users');
    const snap = await adminDb().collection('tasks').where('userId', '==', uid).where('completed', '==', false).get();
    return { tasks: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Task, 'id'>) })), tz: await getTimezone(uid) };
  },
};

export interface SyncResult { status: 'ok' | 'not_connected' | 'revoked' | 'error'; created: number; updated: number; deleted: number; pending: number; error?: string }

const none = (status: SyncResult['status'], error?: string): SyncResult => ({ status, created: 0, updated: 0, deleted: 0, pending: 0, ...(error ? { error } : {}) });
const SYNC_STAMP_MS = 60 * 60_000;

export async function syncUser(uid: string, deps: GoogleDeps = realDeps, store: SyncStore = realStore): Promise<SyncResult> {
  const link = (await store.getLink(uid)).google;
  if (!link) return none('not_connected');
  if (link.revoked) return none('revoked');
  let token: string;
  try {
    token = await accessTokenFor(link.refreshToken, deps);
  } catch (e) {
    if (e instanceof RevokedError) {
      await store.patchGoogle(uid, { revoked: true, lastError: 'Access was removed in your Google account. Reconnect to keep syncing.' });
      return none('revoked');
    }
    await store.patchGoogle(uid, { lastError: 'Could not reach Google. Will retry.' });
    return none('error', (e as Error).message);
  }

  const { tasks, tz } = await store.openTasks(uid);
  const desired = new Map(eventsForTasks(tasks, tz, deps.now()).map((e) => [e.taskId, e]));
  const synced = { ...link.synced };
  const res = none('ok');
  let budget = MAX_WRITES_PER_SYNC;
  const calUrl = `${API}/calendars/${encodeURIComponent(link.calendarId)}/events`;

  // 1) Gone or no longer shown (done, deleted, moved out of the window, time removed): delete from Google.
  for (const taskId of Object.keys(synced)) {
    if (desired.has(taskId)) continue;
    if (budget <= 0) { res.pending++; continue; }
    budget--;
    const r = await deps.fetch(`${calUrl}/${eventId(taskId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    if (r.ok || r.status === 404 || r.status === 410) { delete synced[taskId]; res.deleted++; }
    else if (r.status === 401 || r.status === 403) return finish(uid, store, link, synced, res, `google_${r.status}`);
    else res.pending++;
  }

  // 2) New or changed: insert / update.
  for (const e of desired.values()) {
    if (synced[e.taskId] === e.hash) continue;
    if (budget <= 0) { res.pending++; continue; }
    budget--;
    const body = JSON.stringify(googleBody(e, tz));
    const known = e.taskId in synced;
    let r = known
      ? await deps.fetch(`${calUrl}/${eventId(e.taskId)}`, { method: 'PUT', headers: authHeaders(token), body })
      : await deps.fetch(calUrl, { method: 'POST', headers: authHeaders(token), body });
    // Idempotence: a retried insert finds the event (409), an update of an event the user deleted by hand finds none (404).
    if (!known && r.status === 409) r = await deps.fetch(`${calUrl}/${eventId(e.taskId)}`, { method: 'PUT', headers: authHeaders(token), body });
    else if (known && (r.status === 404 || r.status === 410)) r = await deps.fetch(calUrl, { method: 'POST', headers: authHeaders(token), body });
    if (r.ok) { synced[e.taskId] = e.hash; if (known) res.updated++; else res.created++; }
    else if (r.status === 401 || r.status === 403) return finish(uid, store, link, synced, res, `google_${r.status}`);
    else res.pending++;
  }
  return finish(uid, store, link, synced, res, res.pending ? 'Some events are still waiting to sync.' : undefined, deps.now());
}

async function finish(uid: string, store: SyncStore, link: GoogleLink, synced: Record<string, string>, res: SyncResult, error: string | undefined, now?: number): Promise<SyncResult> {
  const changed = JSON.stringify(synced) !== JSON.stringify(link.synced);
  const patch: Partial<GoogleLink> = {};
  if (changed) patch.synced = synced;
  if (now != null && (changed || !link.lastSyncAt || now - link.lastSyncAt > SYNC_STAMP_MS)) patch.lastSyncAt = now;
  if ((error ?? null) !== (link.lastError ?? null)) patch.lastError = (error ?? null) as unknown as string;
  if (Object.keys(patch).length) await store.patchGoogle(uid, patch);
  if (error && /^google_40[13]$/.test(error)) return { ...res, status: 'error', error };
  return { ...res, status: 'ok' };
}

/** Cron: sync every connected user. One user failing never stops the others. */
export async function runCalendarSync(deps: GoogleDeps = realDeps): Promise<{ users: number; created: number; updated: number; deleted: number; failed: number }> {
  const out = { users: 0, created: 0, updated: 0, deleted: 0, failed: 0 };
  if (!googleConfigured()) return out;
  for (const uid of await connectedUids()) {
    out.users++;
    try {
      const r = await syncUser(uid, deps);
      out.created += r.created; out.updated += r.updated; out.deleted += r.deleted;
      if (r.status === 'error') out.failed++;
    } catch (e) {
      out.failed++;
      console.error('[calendar sync]', uid, e);
    }
  }
  return out;
}
