// Native app: calendar settings. Bearer = Firebase ID token.
//   GET  -> { feed: {url, webcalUrl} | null, google: { connected, email?, lastSyncAt?, error?, needsReconnect? }, googleAvailable }
//   POST { action } where action is
//     feed.create | feed.rotate | feed.remove          -> the new status
//     google.start                                      -> { url } open it in the in-app browser; it ends at nudge://calendar?connected=1
//     google.sync                                       -> { sync: {created, updated, deleted, ...}, ...status }
//     google.disconnect                                 -> the new status (deletes the "Nudge" calendar in Google)
// 401 unauthorized | 400 bad_request | 409 not_connected | 503 google_unavailable
import { NO_STORE, uidFromRequest } from '@/lib/server/appAuth';
import { ensureFeedToken, getCalendarLink, removeFeed, toPublicStatus } from '@/lib/server/calendarLink';
import { disconnect, googleConfigured, startLink, syncUser } from '@/lib/server/googleCal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

async function status(uid: string) {
  return { ...toPublicStatus(await getCalendarLink(uid)), googleAvailable: googleConfigured() };
}

export async function GET(req: Request) {
  const uid = await uidFromRequest(req);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  return json(await status(uid));
}

export async function POST(req: Request) {
  const uid = await uidFromRequest(req);
  if (!uid) return json({ error: 'unauthorized' }, 401);
  let action = '';
  try {
    action = String(((await req.json()) as { action?: unknown }).action ?? '');
  } catch { /* empty */ }
  try {
    switch (action) {
      case 'feed.create': await ensureFeedToken(uid); return json(await status(uid));
      case 'feed.rotate': await ensureFeedToken(uid, true); return json(await status(uid));
      case 'feed.remove': await removeFeed(uid); return json(await status(uid));
      case 'google.start':
        if (!googleConfigured()) return json({ error: 'google_unavailable' }, 503);
        return json({ url: startLink(uid, 'app') });
      case 'google.sync': {
        const sync = await syncUser(uid);
        if (sync.status === 'not_connected') return json({ error: 'not_connected' }, 409);
        return json({ sync, ...(await status(uid)) });
      }
      case 'google.disconnect': await disconnect(uid); return json(await status(uid));
      default: return json({ error: 'bad_request' }, 400);
    }
  } catch (e) {
    console.error('[app/calendar]', action, e);
    return json({ error: 'server_error' }, 500);
  }
}
