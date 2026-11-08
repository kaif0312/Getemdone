// The Gemini path: build the prompt, call the model, execute tool calls, send deterministic confirmations.
import type { InboundMessage } from '@/lib/wa/types';
import type { Task } from '@/lib/types';
import type { GeminiPart } from './types';
import {
  Ctx, addItems, completeByRefs, deferByRef, deleteByRef, parkByRef, somedayList, somedayPick, describeWorkout, flush, friendsLines, logMetricAction,
  logWorkoutAction, newActionId, nudgeAction, parseWorkout, reactAction, setGoalAction, setReminderAction, setReminderChannelAction, setScheduleAction,
  showToday, weekLines, type WorkoutArgs, addMedicationAction, removeMedicationAction, setLangAction,
} from './actions';
import { isLang } from './i18n';
import { buildContext, systemFor } from './prompt';
import { setCoachAction } from './actions';
import { MOMENTS, type MemeFormat, type Moment } from './memes';
import { TOOLS } from './tools';
import { str } from './format';
import { addRoutineAction, removeRoutineAction, routinesList, updateRoutineAction } from './routines';

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const MAX_CALLS = 8;
const MAX_LIST_MEMORY = 25;

export const DIDNT_CATCH = "Hmm, I didn't catch that. Try *help* to see what I can do.";
const didntCatch = (ctx: Ctx) => (ctx.lang === 'en' ? DIDNT_CATCH : ctx.t('didntCatch'));

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
    session: ctx.session, numbered, today: ctx.today, time: ctx.time, tz: ctx.tz, displayName: ctx.user?.displayName, lang: ctx.lang,
  });

  let user: GeminiPart[];
  if (msg.type === 'audio' || msg.type === 'image') {
    const media = await mediaParts(ctx, msg);
    if ('error' in media) { await ctx.text(media.error); return; }
    user = [...media.parts, { text: `${media.note}\n\n${context}` }];
  } else {
    user = [{ text: `User message:\n${msg.text ?? msg.reply?.title ?? ''}\n\n${context}` }];
  }

  const res = await ctx.d.gemini({ system: systemFor(ctx.link.coach), user, tools: TOOLS });

  const lead: string[] = [];
  if (res.text) lead.push(res.text);
  const lines: string[] = [];
  let showList = false;
  let hasOwnReply = false;
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
        case 'park_tasks': {
          for (const r of (Array.isArray(a.refs) ? a.refs : [a.refs]).map((x) => String(x ?? '')).filter(Boolean)) lines.push(...await parkByRef(ctx, r));
          break;
        }
        case 'show_someday': if (a.pick === true) await somedayPick(ctx); else await somedayList(ctx); hasOwnReply = true; break;
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
        case 'set_reminder': lines.push(...await setReminderAction(ctx, a)); break;
        case 'set_reminder_channel': lines.push(...await setReminderChannelAction(ctx, str(a.channel))); break;
        case 'set_schedule': lines.push(...await setScheduleAction(ctx, a)); break;
        case 'set_coach': lines.push(...await setCoachAction(ctx, str(a.coach))); break;
        case 'set_language': if (isLang(a.language)) lines.push(...await setLangAction(ctx, a.language)); break;
        case 'add_routine': lines.push(...await addRoutineAction(ctx, a)); break;
        case 'update_routine': lines.push(...await updateRoutineAction(ctx, a)); break;
        case 'remove_routine': lines.push(...await removeRoutineAction(ctx, a)); break;
        case 'list_routines': lines.push(...await routinesList(ctx)); break;
        case 'add_medication': lines.push(...await addMedicationAction(ctx, a)); break;
        case 'remove_medication': lines.push(...await removeMedicationAction(ctx, a)); break;
        case 'send_meme': {
          const moment = MOMENTS.includes(a.moment as Moment) ? (a.moment as Moment) : 'random';
          const format = ['meme', 'gif', 'sticker'].includes(String(a.format)) ? (a.format as MemeFormat) : undefined;
          ctx.wantMeme({ moment, topic: str(a.topic), format, asked: a.asked === true, byModel: true });
          break;
        }
        default: break;
      }
    } catch (e) {
      console.error('[bot] tool failed', call.name, e);
      lines.push(ctx.t('toolFailed'));
    }
  }

  const out = [...lead, ...lines];
  if (out.length) await flush(ctx, out);
  if (showList) await showToday(ctx);
  if (proposal) await sendProposal(ctx, proposal);
  if (!out.length && !showList && !proposal && !ctx.meme && !hasOwnReply) await ctx.text(didntCatch(ctx));
}

async function sendProposal(ctx: Ctx, w: WorkoutArgs): Promise<void> {
  const id = newActionId(ctx.d.now());
  ctx.session.lastAction = { id, kind: 'pending_workout', payload: { workout: w as unknown as Record<string, unknown> }, at: ctx.d.now() };
  await ctx.buttons(`I read: *${describeWorkout(w)}*. Log it?`, [
    { id: `confirm:${id}`, title: 'Log it ✅' },
    { id: `cancel:${id}`, title: 'Skip' },
  ]);
}

/** Anything that hints at a date, time, reminder or a list: only then is Gemini worth its cost for "/task". */
const NEEDS_PARSING = /[\d,]|\b(today|tonight|tomorrow|tmrw|morning|afternoon|evening|noon|midnight|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|every|daily|weekly|remind\w*|by|at|and)\b/i;

/**
 * "/task <text>" (alias "/add"): always adds. Plain text is added as is (newline or ";" separates tasks), with no model
 * call. Text with a date, time or list in it goes to Gemini with ONLY the add_tasks tool, so it cannot be read as anything
 * else; if the model returns nothing usable the raw text is added.
 */
export async function addTaskCommand(ctx: Ctx, text: string): Promise<void> {
  let items: unknown[] = [];
  if (NEEDS_PARSING.test(text)) {
    try {
      const all = await ctx.d.listToday(ctx.uid);
      ctx.rememberTasks(all);
      const numbered = numberTasks(ctx, all.filter((t) => !t.completed));
      const context = buildContext({
        session: ctx.session, numbered, today: ctx.today, time: ctx.time, tz: ctx.tz, displayName: ctx.user?.displayName, lang: ctx.lang,
      });
      const res = await ctx.d.gemini({
        system: systemFor(ctx.link.coach),
        user: [{ text: `The user sent the /task command. Add the text below as task(s) with add_tasks (keep their wording; split only if it clearly lists several tasks; set due/when only if it states a date or time). Call nothing else.\n\nTask text:\n${text}\n\n${context}` }],
        tools: TOOLS.filter((t) => t.name === 'add_tasks'),
      });
      const call = res.calls.find((c) => c.name === 'add_tasks');
      if (call && Array.isArray(call.args?.items)) items = call.args.items as unknown[];
    } catch (e) {
      console.error('[bot] /task parse failed, adding raw text', e);
    }
  }
  if (!items.length) items = text.split(/\n|;/).map((s) => s.trim()).filter(Boolean).map((s) => ({ text: s }));
  const lines = await addItems(ctx, items);
  await flush(ctx, lines.length ? lines : [didntCatch(ctx)]);
}
