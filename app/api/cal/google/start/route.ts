// Starts "Connect Google Calendar". The link comes from WhatsApp (/sync) or the app (POST /api/app/calendar google.start);
// `s` is a signed 20-minute state naming the Nudge user. We bounce to Google's consent screen carrying it.
import { authUrl, googleConfigured, verifyState } from '@/lib/server/googleCal';
import { calPage } from '@/lib/server/calPage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get('s') ?? '';
  const state = verifyState(s);
  if (!state) return calPage('This link expired', 'Ask the coach for a new one: send <b>/sync</b> on WhatsApp, or tap Connect again in the app.', 400);
  if (!googleConfigured()) return calPage('Not set up yet', 'Google Calendar is not switched on for Nudge yet.', 503);
  return Response.redirect(authUrl(s), 302);
}
