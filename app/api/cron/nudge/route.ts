// Scheduler entry point. GitHub Actions (.github/workflows/nudge-cron.yml) calls it every 15 minutes.
import { NextResponse } from 'next/server';
import { runSchedule } from '@/lib/server/scheduler';
import { runReminders } from '@/lib/server/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const now = Date.now();
    const counts = await runSchedule(now);
    // Reminders must not be lost if the scheduler half fails, nor the scheduler if reminders fail.
    const reminders = await runReminders(now).catch((e) => {
      console.error('[cron/nudge] reminders', e);
      return { error: 'reminders_failed' };
    });
    return NextResponse.json({ ok: true, ...counts, reminders });
  } catch (e) {
    console.error('[cron/nudge]', e);
    return NextResponse.json({ ok: false, error: 'schedule_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
