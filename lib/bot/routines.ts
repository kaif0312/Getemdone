// Routines on WhatsApp (lib/server/routines.ts): Done / Skip taps, "done" as a reply, /routines, and the model's tools.
// Replies are English: a routine message is a short transactional line (the template is English only).
import type * as Routines from '@/lib/server/routines';
import { str } from './format';
import type { Ctx } from './actions';

/** The slice of lib/server/routines.ts the bot needs. Optional on BotDeps so older test fakes keep compiling. */
export interface RoutineBotDeps {
  setLogStatus: typeof Routines.setLogStatus;
  openLogFor: typeof Routines.openLogFor;
  upsertRoutine: typeof Routines.upsertRoutine;
  updateRoutine: typeof Routines.updateRoutine;
  removeRoutine: typeof Routines.removeRoutine;
  statusLines: typeof Routines.statusLines;
}

const UNAVAILABLE = '⚠️ Routines are not available right now.';
export const ROUTINES_NONE = 'No routines yet. Say for example: _remind me to take isabgol every night at 10_';
const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const daysText = (days: number[]) => {
  if (!days.length) return 'every day';
  const k = days.join(',');
  return k === '1,2,3,4,5' ? 'on weekdays' : k === '0,6' ? 'on weekends' : 'on ' + days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ');
};

/** A bare "done" / "took it" / thumbs-up: only counts when a routine message is waiting for an answer. */
export const isBareDone = (text: string) => /^(done|did it|took it|taken|had it|finished|✅|👍)[.! ]*$/i.test(text.trim());

export async function routineTap(ctx: Ctx, logId: string, status: 'done' | 'skipped'): Promise<void> {
  const r = ctx.d.routines;
  if (!r) { await ctx.text(UNAVAILABLE); return; }
  const res = await r.setLogStatus(logId, ctx.uid, status, ctx.d.now());
  if (!res.ok) { await ctx.text('I could not find that routine any more.'); return; }
  if (status === 'skipped') { await ctx.text(`Okay, skipped *${res.title}* today.`); return; }
  if (res.already) { await ctx.text(`*${res.title}* was already marked done ✅`); return; }
  await ctx.text(`✅ *${res.title}* done.${res.streak > 1 ? ` 🔥 ${res.streak} days in a row.` : ''}`);
}

/** True when the message answered a waiting routine. */
export async function routineBareDone(ctx: Ctx): Promise<boolean> {
  const r = ctx.d.routines;
  if (!r) return false;
  const open = await r.openLogFor(ctx.uid, ctx.d.now(), ctx.tz);
  if (!open) return false;
  await routineTap(ctx, open.id, 'done');
  return true;
}

export async function routinesList(ctx: Ctx): Promise<string[]> {
  const r = ctx.d.routines;
  if (!r) return [UNAVAILABLE];
  const lines = await r.statusLines(ctx.uid, ctx.d.now(), ctx.tz);
  return lines.length ? ['*Your routines*', ...lines] : [ROUTINES_NONE];
}

function failText(reason: string, names?: string[]): string {
  switch (reason) {
    case 'no_title': return 'What should the routine be called? For example: take isabgol.';
    case 'bad_time': return 'What time? For example 10pm or 22:00.';
    case 'too_many': return 'You already have 20 routines, remove one first.';
    case 'ambiguous': return `Which one? ${(names ?? []).join(', ')}`;
    default: return names?.length ? `I could not find that routine. You have: ${names.join(', ')}` : ROUTINES_NONE;
  }
}

export async function addRoutineAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  const r = ctx.d.routines;
  if (!r) return [UNAVAILABLE];
  const res = await r.upsertRoutine(ctx.uid, { title: str(a.title) ?? '', time: str(a.time) ?? '', days: a.days });
  if (!res.ok) return [failText(res.reason, res.names)];
  const x = res.routine;
  return [`${res.created ? '✅ Routine added' : '✅ Routine updated'}: *${x.title}* at ${clock12(x.time)} ${daysText(x.days)}. I will message you with a Done button.`];
}

export async function updateRoutineAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  const r = ctx.d.routines;
  if (!r) return [UNAVAILABLE];
  const res = await r.updateRoutine(ctx.uid, str(a.ref) ?? '', { time: str(a.time), days: a.days, pause: a.pause === true });
  if (!res.ok) return [failText(res.reason, res.names)];
  const x = res.routine;
  return [a.pause === true ? `⏸ Stopped *${x.title}*.` : `✅ *${x.title}*: ${clock12(x.time)} ${daysText(x.days)}.`];
}

export async function removeRoutineAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  const r = ctx.d.routines;
  if (!r) return [UNAVAILABLE];
  const res = await r.removeRoutine(ctx.uid, str(a.ref) ?? '');
  if (!res.ok) return [failText(res.reason, res.names)];
  return [`🗑 Removed the routine *${res.routine.title}*.`];
}
