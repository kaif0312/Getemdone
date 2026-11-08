// Scheduler entry point. GitHub Actions (.github/workflows/nudge-cron.yml) calls it every 15 minutes.
import { NextResponse } from 'next/server';
import { runSchedule } from '@/lib/server/scheduler';
import { runReminders } from '@/lib/server/reminders';
import { runMeds } from '@/lib/server/meds';
import { runRoutines } from '@/lib/server/routines';
import { runCalendarSync } from '@/lib/server/googleCal';
import { runMeetingNotes } from '@/lib/meetingnotes';

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
    // Medicine reminders for family: own try/catch, a failure here must not hide the other two.
    const meds = await runMeds(now).catch((e) => {
      console.error('[cron/nudge] meds', e);
      return { error: 'meds_failed' };
    });
    // Routines (daily Done-button reminders): own try/catch too.
    const routines = await runRoutines(now).catch((e) => {
      console.error('[cron/nudge] routines', e);
      return { error: 'routines_failed' };
    });
    // Google Calendar sync for connected users: own try/catch as well.
    const calendar = await runCalendarSync().catch((e) => {
      console.error('[cron/nudge] calendar', e);
      return { error: 'calendar_failed' };
    });
    // Meeting notes (Drive -> drafts -> WhatsApp to the owner): own try/catch, throttled inside to ~30 min.
    const meetingNotes = await runMeetingNotes().catch((e) => {
      console.error('[cron/nudge] meetingNotes', e);
      return { error: 'meeting_notes_failed' };
    });
    return NextResponse.json({ ok: true, ...counts, reminders, meds, routines, calendar, meetingNotes });
  } catch (e) {
    console.error('[cron/nudge]', e);
    return NextResponse.json({ ok: false, error: 'schedule_failed' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
