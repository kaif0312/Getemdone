// Called by QStash at the exact reminder time (lib/server/qstash.ts scheduleFire). Signature-checked; no other auth.
import { NextResponse } from 'next/server';
import { fireOne } from '@/lib/server/reminders';
import { fireUrl, verifySignature } from '@/lib/server/qstash';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(req.headers.get('upstash-signature'), raw, fireUrl())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { taskId?: unknown; fireAt?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  if (typeof body.taskId !== 'string' || typeof body.fireAt !== 'number') {
    return NextResponse.json({ error: 'bad_body' }, { status: 400 });
  }
  try {
    const result = await fireOne(body.taskId, body.fireAt, Date.now());
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[reminders/fire]', e);
    return NextResponse.json({ ok: false }, { status: 500 }); // QStash retries; the claim makes that safe
  }
}
