// handleWith(deps, msg): the whole inbound flow, with injectable dependencies (tests pass fakes).
import type { InboundMessage } from '@/lib/wa/types';
import type { StickerName } from '@/lib/wa/send';
import type { BotDeps } from './types';
import {
  Ctx, HELP, TASK_USAGE, UNKNOWN_CMD, completeByIds, filesLines, deferById, deleteById, flush, friendsLines,
  logWorkoutAction, nudgeUid, openTask, showToday, undoLast, weekLines, resolveRef, type WorkoutArgs,
} from './actions';
import { addTaskCommand, runGemini, transcriptOf } from './ai';
import { parseFast, type Fast } from './fastpath';
import { time12 } from './format';
import { maybeOnboard } from './onboarding';

export const APOLOGY = 'Sorry, something went wrong on my side. Please try again in a moment 🙏';
export const NOT_LINKED =
  "Hi! I'm *Nudge*, your todo and accountability buddy.\n\nTo connect: open getemdone.vercel.app, go to *Settings* → *Connect WhatsApp*, and tap the link it gives you.";
export const WELCOME = [
  "You're connected! 🎉 I'm *Nudge*.",
  '',
  'Just tell me things:',
  '• "gym 6pm, call mom, deck by Fri" adds tasks',
  '• *today* shows your list, *done 2* ticks one off',
  '• "ran 5k in 28 min" logs a workout',
  '• Voice notes and screenshots work too',
  '',
  'Send *help* any time.',
].join('\n');

const MAX_TURNS = 12;

export async function handleWith(d: BotDeps, msg: InboundMessage): Promise<void> {
  try {
    await run(d, msg);
  } catch (e) {
    console.error('[bot] handleMessage failed', msg.id, e);
    try { await d.sendText(msg.from, APOLOGY); } catch (e2) { console.error('[bot] apology failed', e2); }
  }
}

async function run(d: BotDeps, msg: InboundMessage): Promise<void> {
  const link = await d.getLink(msg.from);
  if (!link) { await unlinked(d, msg); return; }
  if (await maybeOnboard(d, link, msg)) return; // mid-setup chat, or the user typed *setup*
  if (msg.type === 'reaction') return;
  if (msg.type === 'other' || msg.type === 'document' || msg.type === 'video') {
    await d.sendText(msg.from, 'I can read text, voice notes and photos. Send *help* to see what I can do.');
    return;
  }

  d.markRead(msg.id, true).catch(() => undefined);
  if (msg.timestamp > link.lastInboundAt) d.updateLink(msg.from, { lastInboundAt: msg.timestamp }).catch(() => undefined);

  const [session, user] = await Promise.all([d.getSession(msg.from), d.getUserLite(link.uid)]);
  const tz = link.timezone || user?.timezone || 'Asia/Kolkata';
  const now = d.now();
  const ctx = new Ctx(d, msg.from, link, user, tz, session, d.localDate(tz, now), d.localTime(tz, now));

  const fast = parseFast(msg);
  if (fast) await runFast(ctx, fast);
  else await runGemini(ctx, msg);
  if (ctx.sticker) await sendSticker(d, msg.from, ctx.sticker);

  const t = d.now();
  session.turns.push({ role: 'user', text: transcriptOf(msg).slice(0, 500), at: msg.timestamp || t });
  if (ctx.out.length) session.turns.push({ role: 'bot', text: ctx.out.join('\n').slice(0, 500), at: t });
  if (session.turns.length > MAX_TURNS) session.turns = session.turns.slice(-MAX_TURNS);
  session.updatedAt = t;
  await d.saveSession(msg.from, session);
}

/** Stickers are decoration: a failed or unavailable send never breaks the reply. */
async function sendSticker(d: BotDeps, to: string, name: StickerName): Promise<void> {
  if (!d.sendSticker) return;
  try { await d.sendSticker(to, name); } catch (e) { console.error('[bot] sticker failed', name, e); }
}

async function unlinked(d: BotDeps, msg: InboundMessage): Promise<void> {
  if (msg.type === 'reaction') return;
  const m = msg.type === 'text' && msg.text ? /^link\s+([A-Z0-9]{6})$/i.exec(msg.text.trim()) : null;
  if (!m) { await d.sendText(msg.from, NOT_LINKED); return; }
  const r = await d.redeemLinkCode(msg.from, m[1].toUpperCase());
  if (!r.ok) {
    await d.sendText(
      msg.from,
      r.reason === 'expired'
        ? 'That code has expired. Open Settings → Connect WhatsApp in the app for a fresh one.'
        : "That code doesn't look right. Open Settings → Connect WhatsApp in the app and tap the link again.",
    );
    return;
  }
  await sendSticker(d, msg.from, 'blowing');
  await d.sendText(msg.from, WELCOME);
  await d.sendButtons(msg.from, 'When should I check in with you each morning?', [
    { id: 'settime:07:00', title: '7:00 AM' },
    { id: 'settime:08:00', title: '8:00 AM' },
    { id: 'settime:09:00', title: '9:00 AM' },
  ]);
}

async function idsFromNums(ctx: Ctx, nums: number[]): Promise<{ ids: string[]; errs: string[] }> {
  if (!ctx.session.lastList.length) {
    // The user may type "done 2" after a restart or a long gap: rebuild what `today` would have shown.
    const open = (await ctx.d.listToday(ctx.uid)).filter((t) => !t.completed).slice(0, 10);
    ctx.session.lastList = open.map((t) => t.id);
  }
  const ids: string[] = [];
  const errs: string[] = [];
  for (const n of nums) {
    const r = await resolveRef(ctx, String(n));
    if ('err' in r) errs.push(r.err); else ids.push(r.id);
  }
  return { ids, errs };
}

async function runFast(ctx: Ctx, f: Fast): Promise<void> {
  const d = ctx.d;
  switch (f.t) {
    case 'today': await showToday(ctx); return;
    case 'done': {
      const { ids, errs } = await idsFromNums(ctx, f.nums);
      await flush(ctx, await completeByIds(ctx, ids, errs));
      return;
    }
    case 'delete': {
      const { ids, errs } = await idsFromNums(ctx, f.nums);
      const lines: string[] = [];
      for (const id of ids) lines.push(...await deleteById(ctx, id));
      await flush(ctx, [...lines, ...errs]);
      return;
    }
    case 'tomorrow': {
      const { ids, errs } = await idsFromNums(ctx, f.nums);
      const lines: string[] = [];
      for (const id of ids) lines.push(...await deferById(ctx, id));
      await flush(ctx, [...lines, ...errs]);
      return;
    }
    case 'doneId': await flush(ctx, await completeByIds(ctx, [f.id])); return;
    case 'tmrwId': await flush(ctx, await deferById(ctx, f.id)); return;
    case 'delId': await flush(ctx, await deleteById(ctx, f.id)); return;
    case 'taskOpen': await openTask(ctx, f.id); return;
    case 'undo': await undoLast(ctx, f.id); return;
    case 'mute':
      await d.updateLink(ctx.waId, { muted: true });
      await ctx.text("Paused. I won't message you first. Send *start* to resume.");
      ctx.sticker = 'disappointed';
      return;
    case 'unmute':
      await d.updateLink(ctx.waId, { muted: false });
      await ctx.text("Welcome back! I'll check in again. Send *today* to see your list.");
      return;
    case 'help': await ctx.text(HELP); return;
    case 'addTask':
      if (!f.text) await ctx.text(TASK_USAGE); else await addTaskCommand(ctx, f.text);
      return;
    case 'files': await ctx.text((await filesLines(ctx)).join('\n')); return;
    case 'unknownCmd': await ctx.text(UNKNOWN_CMD(f.cmd)); return;
    case 'week': await ctx.text((await weekLines(ctx)).join('\n')); return;
    case 'friends': await ctx.text((await friendsLines(ctx)).join('\n')); return;
    case 'nudge': await ctx.text((await nudgeUid(ctx, f.uid)).join('\n')); return;
    case 'invite':
      try {
        await d.answerInvite(ctx.uid, f.id, f.accept);
        await ctx.text(f.accept ? "🤝 You're now friends on Nudge. Send *friends* to see how everyone's doing." : 'Invite declined.');
      } catch (e) {
        const code = String((e as Error).message);
        await ctx.text(code === 'invite_already_answered' ? 'You already answered that invite.' : "That invite isn't valid any more.");
      }
      return;
    case 'react':
      await d.reactToTask(ctx.uid, f.taskId, f.emoji);
      await ctx.text(`${f.emoji} Sent!`);
      return;
    case 'checkinStart': {
      const open = (await d.listToday(ctx.uid)).filter((t) => !t.completed);
      ctx.rememberTasks(open);
      if (!open.length) { await ctx.text('Nothing planned yet. Tell me what you want to get done today.'); return; }
      const shown = open.slice(0, 10);
      ctx.session.lastList = shown.map((t) => t.id);
      await ctx.list(
        ['Pick up to 3 to focus on today:', ...shown.map((t, i) => `${i + 1}. ${t.text}`)].join('\n'),
        'Pick a task',
        shown.map((t, i) => ({ id: `focus:${t.id}`, title: `${i + 1}. ${t.text}`.slice(0, 24) })),
      );
      return;
    }
    case 'checkinSkip': await ctx.text('No problem. Tell me whenever you want to add something 👍'); return;
    case 'focus': {
      const la = ctx.session.lastAction;
      const prev = la?.kind === 'focus' ? ((la.payload as { ids?: string[] }).ids ?? []) : [];
      const ids = [...new Set([...prev, f.id])].slice(-3);
      await d.setFocus(ctx.uid, ids);
      ctx.session.lastAction = { id: 'focus', kind: 'focus', payload: { ids }, at: d.now() };
      await ctx.text(ids.length >= 3 ? '⭐ 3 focus tasks set. Go get them!' : `⭐ ${ids.length}/3 picked. Pick more, or send *today*.`);
      return;
    }
    case 'setTime':
      await d.updateLink(ctx.waId, { checkinTime: f.time });
      await ctx.text(`Done ✅ I'll check in at ${time12(f.time)} every day. Send *stop* any time to pause.`);
      return;
    case 'confirm': {
      const la = ctx.session.lastAction;
      if (!la || la.kind !== 'pending_workout' || la.id !== f.id) { await ctx.text('That one expired. Just tell me the workout again.'); return; }
      const w = (la.payload as { workout?: WorkoutArgs }).workout;
      ctx.session.lastAction = undefined;
      if (!w) { await ctx.text(APOLOGY); return; }
      await flush(ctx, await logWorkoutAction(ctx, w));
      return;
    }
    case 'cancel': {
      const la = ctx.session.lastAction;
      if (la?.kind === 'pending_workout' && la.id === f.id) ctx.session.lastAction = undefined;
      await ctx.text('Okay, skipped.');
      return;
    }
  }
}
