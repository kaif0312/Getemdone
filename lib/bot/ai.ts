// The Gemini path: build the prompt, call the model, execute tool calls, send deterministic confirmations.
import type { InboundMessage } from '@/lib/wa/types';
import type { Task } from '@/lib/types';
import type { GeminiPart } from './types';
import {
  Ctx, addItems, completeByRefs, deferByRef, deleteByRef, describeWorkout, flush, friendsLines, logMetricAction,
  logWorkoutAction, newActionId, nudgeAction, parseWorkout, reactAction, setGoalAction, setScheduleAction,
  showToday, weekLines, type WorkoutArgs,
} from './actions';
import { buildContext, SYSTEM } from './prompt';
import { TOOLS } from './tools';
import { str } from './format';

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const MAX_CALLS = 8;
const MAX_LIST_MEMORY = 25;

export const DIDNT_CATCH = "Hmm, I didn't catch that. Try *help* to see what I can do.";

/** Keep the numbers the user already saw stable (done tasks leave a hole); append new open tasks after them. */
function numberTasks(ctx: Ctx, open: Task[]): (Task | null)[] {
  const byId = new Map(open.map((t) => [t.id, t]));
  let ids = ctx.session.lastList.length > MAX_LIST_MEMORY ? [] : [...ctx.session.lastList];
  for (const t of open) if (!ids.includes(t.id)) ids.push(t.id);
  // drop trailing holes
  while (ids.length && !byId.has(ids[ids.length - 1])) ids = ids.slice(0, -1);
  ctx.session.lastList = ids;
  return ids.map((id) => byId.get(id) ?? null);
}

async function mediaParts(ctx: Ctx, msg: InboundMessage): Promise<{ parts: GeminiPart[]; note: string } | { error: string }> {
  if (!msg.media) return { error: "I couldn't open that file. Try sending it again." };
  const m = await ctx.d.fetchMedia(msg.media.id);
  if (m.data.length > MAX_MEDIA_BYTES) return { error: 'That file is too big for me. Try a shorter one.' };
  const mime = (m.mimeType || msg.media.mimeType || '').split(';')[0].trim();
  const part: GeminiPart = { inline_data: { mime_type: mime, data: m.data.toString('base64') } };
  const note = msg.type === 'audio'
    ? 'The user sent the voice note above. Listen to it and act on what they say, exactly as if they had typed it.'
    : `The user sent the photo above${msg.text ? ` with the caption: "${msg.text}"` : ''}. If it shows workout stats (watch, Strava, gym machine), extract them and call propose_workout. If it is a list or note of things to do, call add_tasks. Otherwise use reply.`;
  return { parts: [part], note };
}

export function transcriptOf(msg: InboundMessage): string {
  if (msg.type === 'audio') return '[voice note]';
  if (msg.type === 'image') return `[photo]${msg.text ? ' ' + msg.text : ''}`;
  return msg.text ?? msg.reply?.title ?? '';
}

export async function runGemini(ctx: Ctx, msg: InboundMessage): Promise<void> {
  const all = await ctx.d.listToday(ctx.uid);
  ctx.rememberTasks(all);
  const numbered = numberTasks(ctx, all.filter((t) => !t.completed));
  const context = buildContext({
    session: ctx.session, numbered, today: ctx.today, time: ctx.time, tz: ctx.tz, displayName: ctx.user?.displayName,
  });

  let user: GeminiPart[];
  if (msg.type === 'audio' || msg.type === 'image') {
    const media = await mediaParts(ctx, msg);
    if ('error' in media) { await ctx.text(media.error); return; }
    user = [...media.parts, { text: `${media.note}\n\n${context}` }];
  } else {
    user = [{ text: `User message:\n${msg.text ?? msg.reply?.title ?? ''}\n\n${context}` }];
  }

  const res = await ctx.d.gemini({ system: SYSTEM, user, tools: TOOLS });

  const lead: string[] = [];
  if (res.text) lead.push(res.text);
  const lines: string[] = [];
  let showList = false;
  let proposal: WorkoutArgs | null = null;

  for (const call of res.calls.slice(0, MAX_CALLS)) {
    const a = call.args ?? {};
    try {
      switch (call.name) {
        case 'reply': { const t = str(a.text); if (t) lead.push(t); break; }
        case 'add_tasks': lines.push(...await addItems(ctx, a.items)); break;
        case 'complete_tasks': {
          const refs = (Array.isArray(a.refs) ? a.refs : [a.refs]).map((r) => String(r ?? '')).filter(Boolean);
          lines.push(...await completeByRefs(ctx, refs));
          break;
        }
        case 'defer_task': { const r = str(a.ref) ?? String(a.ref ?? ''); lines.push(...await deferByRef(ctx, r, str(a.to_date))); break; }
        case 'delete_task': lines.push(...await deleteByRef(ctx, str(a.ref) ?? String(a.ref ?? ''))); break;
        case 'list_today': showList = true; break;
        case 'log_workout': {
          const w = parseWorkout(a);
          lines.push(...(w ? await logWorkoutAction(ctx, w) : ['⚠️ What workout was it?']));
          break;
        }
        case 'propose_workout': proposal = parseWorkout(a) ?? proposal; break;
        case 'log_metric': lines.push(...await logMetricAction(ctx, a)); break;
        case 'fitness_week': lines.push(...await weekLines(ctx)); break;
        case 'set_goal': lines.push(...await setGoalAction(ctx, a)); break;
        case 'nudge_friend': lines.push(...await nudgeAction(ctx, str(a.name) ?? '', str(a.message))); break;
        case 'react_to_friend': lines.push(...await reactAction(ctx, str(a.name) ?? '', str(a.emoji) ?? '👏')); break;
        case 'friends_today': lines.push(...await friendsLines(ctx)); break;
        case 'set_schedule': lines.push(...await setScheduleAction(ctx, a)); break;
        default: break;
      }
    } catch (e) {
      console.error('[bot] tool failed', call.name, e);
      lines.push('⚠️ One of those did not go through. Please try again.');
    }
  }

  const out = [...lead, ...lines];
  if (out.length) await flush(ctx, out);
  if (showList) await showToday(ctx);
  if (proposal) await sendProposal(ctx, proposal);
  if (!out.length && !showList && !proposal) await ctx.text(DIDNT_CATCH);
}

async function sendProposal(ctx: Ctx, w: WorkoutArgs): Promise<void> {
  const id = newActionId(ctx.d.now());
  ctx.session.lastAction = { id, kind: 'pending_workout', payload: { workout: w as unknown as Record<string, unknown> }, at: ctx.d.now() };
  await ctx.buttons(`I read: *${describeWorkout(w)}*. Log it?`, [
    { id: `confirm:${id}`, title: 'Log it ✅' },
    { id: `cancel:${id}`, title: 'Skip' },
  ]);
}
