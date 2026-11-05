// Google redirects here after consent: ?code=...&state=<signed>. Saves the connection, runs the first sync, then
// sends the person back: the app via its `nudge://me/calendar` link, WhatsApp via a button to the Nudge chat.
import { connect, syncUser, verifyState } from '@/lib/server/googleCal';
import { calPage } from '@/lib/server/calPage';
import { getTimezone } from '@/lib/server/users';
import { notifyConnected, waChatUrl } from '@/lib/server/calendarNotify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function back(via: 'wa' | 'app', ok: boolean, reason?: string): Response {
  if (via === 'app') {
    return Response.redirect(`nudge://me/calendar?${ok ? 'connected=1' : `error=${encodeURIComponent(reason ?? 'failed')}`}`, 302);
  }
  const button = { href: waChatUrl(), label: 'Back to WhatsApp' };
  return ok
    ? calPage('Calendar connected', 'Your timed tasks now show up in a calendar called <b>Nudge</b> in Google Calendar.', 200, button)
    : calPage('Could not connect', reason === 'access_denied'
      ? 'You cancelled, so nothing was connected. Send <b>/sync</b> to try again.'
      : 'Something went wrong. Send <b>/sync</b> on WhatsApp to try again.', 400, button);
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const state = verifyState(q.get('state') ?? '');
  if (!state) return calPage('This link expired', 'Send <b>/sync</b> on WhatsApp (or tap Connect in the app) for a fresh one.', 400);
  const err = q.get('error');
  if (err) return back(state.via, false, err);
  const code = q.get('code');
  if (!code) return back(state.via, false, 'no_code');
  try {
    const r = await connect(state.uid, code, await getTimezone(state.uid));
    if (!r.ok) {
      console.error('[cal callback] connect failed', r.reason);
      return back(state.via, false, r.reason);
    }
    const sync = await syncUser(state.uid).catch((e) => { console.error('[cal callback] first sync', e); return null; });
    if (state.via === 'wa') await notifyConnected(state.uid, r.email, sync?.created ?? 0).catch(() => undefined);
    return back(state.via, true);
  } catch (e) {
    console.error('[cal callback]', e);
    return back(state.via, false, 'server_error');
  }
}
