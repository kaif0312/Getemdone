// Scheduler entry point. GitHub Actions (.github/workflows/nudge-cron.yml) calls it every 15 minutes.
import { NextResponse } from 'next/server';
import { runSchedule } from '@/lib/server/scheduler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const counts = await runSchedule(Date.now());
    return NextResponse.json({ ok: true, ...counts });
  } catch (e) {
    console.error('[cron/nudge]', e);
    return NextResponse.json({ ok: false, error: 'schedule_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
