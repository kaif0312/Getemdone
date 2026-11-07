// DELETE /api/meetings/[id]: cancel (also deletes the Calendar event and the reminders). GET: one meeting (owner only).
import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/server/meetingsApi';
import { cancelMeeting, getMeeting } from '@/lib/server/meetings';

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
  const m = await getMeeting((await ctx.params).id);
  if (!m || m.ownerUid !== uid) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json(m, { headers: NO_STORE });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const uid = await who(req);
  if (!uid) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const r = await cancelMeeting(uid, (await ctx.params).id);
  if (!r) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ ...r.meeting, calendar: r.calendar }, { headers: NO_STORE });
}
