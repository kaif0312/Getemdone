// Personal calendar feed: GET /api/cal/<token>.ics. Subscribe to it in Google / Apple / Outlook calendar.
// The unguessable token is the only credential (no login: calendar apps cannot sign in), so it is rotatable
// (POST /api/app/calendar {action:'feed.rotate'} or "/sync reset" on WhatsApp). Unknown token = 404, same as a typo.
import { eventsForTasks } from '@/lib/server/calendarEvents';
import { uidForFeedToken } from '@/lib/server/calendarLink';
import { buildIcs } from '@/lib/server/ics';
import { realStore } from '@/lib/server/googleCal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params;
  const token = raw.replace(/\.ics$/i, '');
  const uid = await uidForFeedToken(token);
  if (!uid) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  try {
    const { tasks, tz } = await realStore.openTasks(uid);
    const now = Date.now();
    const body = buildIcs(eventsForTasks(tasks, tz, now), { name: 'Nudge', now, url: 'https://getemdone.vercel.app' });
    return new Response(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="nudge.ics"',
        // Calendar apps poll on their own schedule; a short private cache keeps a refresh storm off Firestore.
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error('[cal feed]', e);
    return new Response('Server error', { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
