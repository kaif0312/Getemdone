// Production wiring for meeting notes. Silent no-op without the ISK_* env (local dev, tests) or with NUDGE_MEETING_NOTES=off.
import { callGemini } from '@/lib/bot/gemini';
import { addTasks } from '@/lib/server/tasks';
import { getLink, updateLink } from '@/lib/wa/links';
import { sendText, windowOpen } from '@/lib/wa/send';
import type { WaLink } from '@/lib/wa/types';
import { cfgFromEnv, makeGoogle } from './google';
import { handleOwnerMessage, scanNotes, type NotesDeps, type ScanResult } from './service';
import { firestoreStore } from './store';

export function meetingNotesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.NUDGE_MEETING_NOTES || '').toLowerCase() !== 'off' && !!cfgFromEnv(env);
}

export const ownerWa = (env: Record<string, string | undefined> = process.env) =>
  (env.NUDGE_OWNER_WA || '916238952660').replace(/[^\d]/g, '');

function deps(): NotesDeps | null {
  const cfg = cfgFromEnv();
  if (!cfg || !meetingNotesEnabled()) return null;
  return {
    now: () => Date.now(),
    store: firestoreStore,
    google: makeGoogle(cfg),
    gemini: (req) => callGemini(req),
    ownerWa: ownerWa(),
    getLink, updateLink, sendText, windowOpen,
    addTasks: (uid, items) => addTasks(uid, items),
    log: (m) => console.log(m),
  };
}

/** Cron tick (app/api/cron/nudge). */
export async function runMeetingNotes(): Promise<ScanResult | { skipped: string }> {
  const d = deps();
  if (!d) return { skipped: 'off' };
  return scanNotes(d);
}

/** Bot hook (lib/bot/core.ts): true = the owner's message was a meeting-notes command and is answered. */
export async function meetingNotesHandle(link: WaLink, text: string | undefined): Promise<boolean> {
  if (link.waId !== ownerWa()) return false; // no env read or IO for anyone else
  const d = deps();
  return d ? handleOwnerMessage(d, link, text) : false;
}
