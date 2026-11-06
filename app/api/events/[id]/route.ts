// GET one event, PATCH (edit: title, start, durationMin, notes, location, reminderMinutes, repeat), DELETE (cancel; for a repeating
// event `?date=YYYY-MM-DD` cancels only that day). Owner only, same auth as /api/meetings.
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/server/meetingsApi';
import { BadRequest } from '@/lib/server/meetings';
import { cancelEvent, getEvent, updateEvent } from '@/lib/server/events';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;
const NO_STORE = { 'Cache-Control': 'no-store' };

async function who(req: Request) {
  const url = new URL(req.url);
  return authenticate(req, url.pathname + url.search, Object.fromEntries(url.searchParams));
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await who(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const e = await getEvent((await ctx.params).id);
  if (!e || e.ownerUid !== uid) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(e, { headers: NO_STORE });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
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
    const e = await updateEvent(uid, (await ctx.params).id, body);
    if (!e) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    return NextResponse.json(e, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof BadRequest) return NextResponse.json({ error: 'bad_request', message: err.message }, { status: 400 });
    console.error('[events] update failed', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await who(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const date = new URL(req.url).searchParams.get('date') ?? undefined;
  const e = await cancelEvent(uid, (await ctx.params).id, { date });
  if (!e) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(e, { headers: NO_STORE });
}
