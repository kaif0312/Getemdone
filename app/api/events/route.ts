// POST /api/events (create an event) and GET /api/events (upcoming). An event = a timed thing with a length (class, appointment):
// no Meet link, no attendees, not checkable. Same auth as /api/meetings (lib/server/meetingsApi.ts). Contract: lib/meetings/types.ts.
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/server/meetingsApi';
import { BadRequest } from '@/lib/server/meetings';
import { createEvent, listUpcomingEvents } from '@/lib/server/events';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const NO_STORE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  const raw = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const uid = await authenticate(req, raw, body);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  try {
    const { event } = await createEvent(uid, body);
    return NextResponse.json(event, { status: 201, headers: NO_STORE });
  } catch (e) {
    if (e instanceof BadRequest) return NextResponse.json({ error: 'bad_request', message: e.message }, { status: 400 });
    console.error('[events] create failed', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams);
  const uid = await authenticate(req, url.pathname + url.search, params);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
  return NextResponse.json({ events: await listUpcomingEvents(uid, limit) }, { headers: NO_STORE });
}
