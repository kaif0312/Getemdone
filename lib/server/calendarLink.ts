// Calendar connections per user, server-only (firestore.rules denies clients):
//   calendarLinks/{uid}   { feedToken, feedCreatedAt, google?: GoogleLink }
//   calendarFeeds/{token} { uid }          lookup for the public ICS URL (the unguessable token IS the credential)
// GoogleLink holds the refresh token, so this doc must never be sent to a client: `publicStatus` is the safe view.
import { randomBytes } from 'node:crypto';
import { adminDb } from './firebaseAdmin';

export interface GoogleLink {
  refreshToken: string;
  email?: string;
  /** The secondary "Nudge" calendar we created (calendar.app.created can only touch calendars it created). */
  calendarId: string;
  scope: string;
  connectedAt: number;
  lastSyncAt?: number;
  /** Set when the last sync failed; cleared by the next success. `revoked` = the user removed access in their Google account. */
  lastError?: string;
  revoked?: boolean;
  /** taskId -> hash of what we last wrote to Google. Used to patch only what changed and to delete what disappeared. */
  synced: Record<string, string>;
}

export interface CalendarLink {
  feedToken?: string;
  feedCreatedAt?: number;
  google?: GoogleLink;
}

export interface PublicCalendarStatus {
  feed: { url: string; webcalUrl: string } | null;
  google: { connected: boolean; email?: string; lastSyncAt?: number; error?: string; needsReconnect?: boolean };
}

const links = () => adminDb().collection('calendarLinks');
const feeds = () => adminDb().collection('calendarFeeds');

export const origin = () => (process.env.NUDGE_PUBLIC_URL || 'https://getemdone.vercel.app').replace(/\/$/, '');

export function feedUrl(token: string): string {
  return `${origin()}/api/cal/${token}.ics`;
}
export function webcalUrl(token: string): string {
  return feedUrl(token).replace(/^https?:/, 'webcal:');
}

export const newFeedToken = () => randomBytes(24).toString('base64url');

export async function getCalendarLink(uid: string): Promise<CalendarLink> {
  const snap = await links().doc(uid).get();
  return (snap.data() as CalendarLink | undefined) ?? {};
}

export async function uidForFeedToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const snap = await feeds().doc(token).get();
  const uid = snap.data()?.uid;
  return typeof uid === 'string' ? uid : null;
}

/** The user's feed token; creates one on first use. `rotate` replaces it (the old URL stops working at once). */
export async function ensureFeedToken(uid: string, rotate = false): Promise<string> {
  const cur = await getCalendarLink(uid);
  if (cur.feedToken && !rotate) return cur.feedToken;
  const token = newFeedToken();
  const batch = adminDb().batch();
  batch.set(feeds().doc(token), { uid, createdAt: Date.now() });
  batch.set(links().doc(uid), { feedToken: token, feedCreatedAt: Date.now() }, { merge: true });
  if (cur.feedToken) batch.delete(feeds().doc(cur.feedToken));
  await batch.commit();
  return token;
}

export async function removeFeed(uid: string): Promise<void> {
  const cur = await getCalendarLink(uid);
  if (!cur.feedToken) return;
  const batch = adminDb().batch();
  batch.delete(feeds().doc(cur.feedToken));
  const { FieldValue } = await import('firebase-admin/firestore');
  batch.set(links().doc(uid), { feedToken: FieldValue.delete(), feedCreatedAt: FieldValue.delete() }, { merge: true });
  await batch.commit();
}

export async function saveGoogle(uid: string, google: GoogleLink): Promise<void> {
  await links().doc(uid).set({ google }, { merge: true });
}

export async function patchGoogle(uid: string, patch: Partial<GoogleLink>): Promise<void> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  const { FieldValue } = await import('firebase-admin/firestore');
  const update: Record<string, unknown> = {};
  for (const [k, v] of entries) update[`google.${k}`] = v === null ? FieldValue.delete() : v;
  if (Object.keys(update).length) await links().doc(uid).update(update);
}

export async function clearGoogle(uid: string): Promise<GoogleLink | null> {
  const cur = (await getCalendarLink(uid)).google ?? null;
  if (cur) {
    const { FieldValue } = await import('firebase-admin/firestore');
    await links().doc(uid).update({ google: FieldValue.delete() });
  }
  return cur;
}

/** UIDs with a live Google connection (for the cron). A tiny collection, so a plain scan is fine. */
export async function connectedUids(): Promise<string[]> {
  const snap = await links().where('google.connectedAt', '>', 0).get();
  return snap.docs.filter((d) => !(d.data() as CalendarLink).google?.revoked).map((d) => d.id);
}

export function toPublicStatus(link: CalendarLink): PublicCalendarStatus {
  const g = link.google;
  return {
    feed: link.feedToken ? { url: feedUrl(link.feedToken), webcalUrl: webcalUrl(link.feedToken) } : null,
    google: g
      ? { connected: !g.revoked, email: g.email, lastSyncAt: g.lastSyncAt, error: g.lastError, needsReconnect: !!g.revoked }
      : { connected: false },
  };
}
