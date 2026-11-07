// handleWith(deps, msg): the whole inbound flow, with injectable dependencies (tests pass fakes).
import { randomUUID } from 'node:crypto';
import type { InboundMessage, WaLink } from '@/lib/wa/types';
import { scrub } from './scrub';
import type { StickerName } from '@/lib/wa/send';
import type { BotDeps } from './types';
import {
  Ctx, HELP, UNKNOWN_CMD, completeByIds, filesLines, syncLines, deferById, deleteById, flush, friendsLines,
  coachMenu, logWorkoutAction, showCalendar, nudgeUid, setCoachAction, openTask, showToday, undoLast, weekLines, resolveRef, type WorkoutArgs,
  langMenu, medsLines, setLangAction,
  askNextStep, focusPick, focusPrompt, focusSummary, pickedFocus, takeStep,
  addParked, keepParked, parkByIds, somedayList, somedayPick, unparkById,
} from './actions';
import { addTaskCommand, runGemini, transcriptOf } from './ai';
import { parseFast, type Fast } from './fastpath';
import { time12 } from './format';
import { allowMeme, chooseRecipe, sendRecipe } from './memes';
import { maybeOnboard } from './onboarding';
import { handleCare } from './care';
import { detectLang, langOf, t as tr, type Lang } from './i18n';

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
  '• *coach* picks my personality: friendly, hardcore drill sergeant, hype...',
  '',
  'Send *help* any time.',
].join('\n');

/** Sent once per person (waLinks.privacyNoticeAt): new people after WELCOME, existing ones after their next reply. */
export const PRIVACY_NOTICE =
  '🔒 Heads-up: I save our messages, with your name and number removed, to make Nudge better. Send *privacy* to see what I keep, *learning off* to stop it, or *delete my data* any time.';
export const PRIVACY = [
  '🔒 *What Nudge keeps*',
  '• Nudge is run by Ibrahim. I read your messages to understand them, with help from Google Gemini.',
  '• Your tasks and workouts are saved in your Nudge account, so reminders and streaks work.',
  '• I remember our last few messages, so a reply like "done 2" makes sense.',
  '• Our messages are also saved, with your name and phone number removed, to make Nudge better. Ibrahim can read them.',
  '',
  'Send *learning off* to stop saving them from now on (*learning on* to allow it again).',
  'Send *delete my data* to erase our chat history and disconnect WhatsApp. The saved messages are then no longer linked to you. Your tasks stay in the app, where you can delete them.',
].join('\n');
export const FORGET_ASK =
  'This erases our chat history and disconnects this WhatsApp number from Nudge. Your tasks stay in the app. Go ahead?';
export const FORGOTTEN =
  'Done. Our chat history is erased and WhatsApp is disconnected 👋 To come back, connect again from the app.';
export const LEARNING_OFF = 'Okay, from now on I will not save our messages for learning 🔒 Send *learning on* to allow it again.';
export const LEARNING_ON = 'Thanks! I will save our messages again (name and number removed) to make Nudge better.';

const MAX_TURNS = 12;

export async function handleWith(d: BotDeps, msg: InboundMessage): Promise<void> {
  const state = { lang: 'en' as Lang };
  try {
    await run(d, msg, state);
  } catch (e) {
    console.error('[bot] handleMessage failed', msg.id, e);
    try { await d.sendText(msg.from, tr(state.lang, 'apology')); } catch (e2) { console.error('[bot] apology failed', e2); }
  }
}

async function run(d: BotDeps, msg: InboundMessage, state: { lang: Lang }): Promise<void> {
  const link = await d.getLink(msg.from);
  if (!link) { await unlinked(d, msg); return; }
  state.lang = langOf(link);
  // A family member who only gets medicine reminders: taps and short replies, no to-do bot.
  if (link.care) { await handleCare(d, link, msg); return; }
  if (await maybeOnboard(d, link, msg)) return; // mid-setup chat, or the user typed *setup*
  if (msg.type === 'reaction') return;
  // Writing in Malayalam / Hindi / Urdu letters switches the language (until they pick one by hand).
  if (!link.langManual && msg.type === 'text' && msg.text) {
    const seen = detectLang(msg.text);
    if (seen && seen !== state.lang) {
      state.lang = seen;
      link.lang = seen;
      d.updateLink(msg.from, { lang: seen }).catch(() => undefined);
    }
  }
  if (msg.type === 'other' || msg.type === 'document' || msg.type === 'video') {
    await d.sendText(msg.from, tr(state.lang, 'unsupported'));
    return;
  }

  d.markRead(msg.id, true).catch(() => undefined);
  if (msg.timestamp > link.lastInboundAt) d.updateLink(msg.from, { lastInboundAt: msg.timestamp }).catch(() => undefined);

  // Owner only: meeting-notes drafts (go / drop / skip / notes). One cheap check; false for everyone else.
  if (d.meetingNotes && msg.type === 'text' && (await d.meetingNotes.handle(link, msg.text))) return;

  const [session, user] = await Promise.all([d.getSession(msg.from), d.getUserLite(link.uid)]);
  const tz = link.timezone || user?.timezone || 'Asia/Kolkata';
  const now = d.now();
  const ctx = new Ctx(d, msg.from, link, user, tz, session, d.localDate(tz, now), d.localTime(tz, now));

  const fast = parseFast(msg);
  if (fast?.t === 'forgetYes') { await forget(d, msg.from); return; } // nothing saved or logged after this
  // "Next step" on a stale-task nudge waits for the user's next plain message; any button, command or other message ends the wait.
  if (fast && fast.t !== 'step' && ctx.session.lastAction?.kind === 'pending_step') ctx.session.lastAction = undefined;
  if (fast) await runFast(ctx, fast);
  else if (await takeStep(ctx, msg.type === 'text' ? msg.text : undefined)) { /* the reply was the first step */ }
  else await runGemini(ctx, msg);
  const memed = await runMeme(ctx);
  if (!memed && ctx.sticker) await sendSticker(d, msg.from, ctx.sticker);
  if (!link.privacyNoticeAt) {
    await d.sendText(msg.from, PRIVACY_NOTICE);
    await d.updateLink(msg.from, { privacyNoticeAt: d.now() }).catch(() => undefined);
  }

  const t = d.now();
  const userText = transcriptOf(msg).slice(0, 500);
  const botText = ctx.out.join('\n').slice(0, 500);
  session.turns.push({ role: 'user', text: userText, at: msg.timestamp || t });
  if (ctx.out.length) session.turns.push({ role: 'bot', text: botText, at: t });
  if (session.turns.length > MAX_TURNS) session.turns = session.turns.slice(-MAX_TURNS);
  session.updatedAt = t;
  await d.saveSession(msg.from, session);
  // Opt-out: `learning off` sets link.learning = false (this turn included); the `learning on` turn itself is not logged either.
  if (ctx.link.learning !== false && fast?.t !== 'learningOn') {
    await learn(d, ctx.link, user?.displayName, { at: t, path: fast ? `fast:${fast.t}` : 'ai', user: userText, bot: botText });
  }
}

/** The learning copy never breaks a reply. The random `learnId` lives on the link only (lib/server/learning.ts). */
async function learn(d: BotDeps, link: WaLink, name: string | undefined, t: { at: number; path: string; user: string; bot: string }): Promise<void> {
  if (!d.logLearning) return;
  try {
    let lid = link.learnId;
    if (!lid) {
      lid = randomUUID();
      await d.updateLink(link.waId, { learnId: lid });
    }
    const names = name ? [name] : [];
    await d.logLearning({ lid, at: t.at, path: t.path, user: scrub(t.user, names), bot: scrub(t.bot, names) });
  } catch (e) {
    console.error('[bot] learning log failed', e);
  }
}

async function forget(d: BotDeps, waId: string): Promise<void> {
  if (!d.forgetMe) { await d.sendText(waId, APOLOGY); return; }
  await d.forgetMe(waId);
  await d.sendText(waId, FORGOTTEN);
}

/** Send this turn's meme if the budget, dice and providers allow. Never throws. True if something went out. */
async function runMeme(ctx: Ctx): Promise<boolean> {
  const m = ctx.d.memes;
  const req = ctx.meme;
  if (!m || !req) return false;
  try {
    const rnd = m.random ?? Math.random;
    const patch = allowMeme(ctx.link, req, ctx.today, process.env, rnd);
    if (!patch) {
      if (req.asked) await ctx.text((process.env.NUDGE_MEMES || '').toLowerCase() === 'off' ? 'Memes are switched off right now.' : "That's enough memes for today 😄 More tomorrow.");
      return false;
    }
    const recipe = chooseRecipe(ctx.link.coach, req, m.providers.has, rnd);
    if (!recipe) { if (req.asked) await ctx.text("I couldn't find one right now. Try again in a bit."); return false; }
    const sent = await sendRecipe(m, ctx.waId, recipe, { task: req.topic, name: ctx.user?.displayName });
    if (!sent) { if (req.asked) await ctx.text("I couldn't find one right now. Try again in a bit."); return false; }
    ctx.out.push(sent);
    Object.assign(ctx.link, patch);
    await ctx.d.updateLink(ctx.waId, patch);
    return true;
  } catch (e) {
    console.error('[bot] meme failed', e);
    return false;
  }
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
  await d.sendText(msg.from, PRIVACY_NOTICE);
  await d.updateLink(msg.from, { privacyNoticeAt: d.now() }).catch(() => undefined);
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
      await ctx.text(ctx.t('muted'));
      ctx.sticker = 'disappointed';
      ctx.wantMeme({ moment: 'quit' });
      return;
    case 'unmute':
      await d.updateLink(ctx.waId, { muted: false });
      await ctx.text(ctx.t('unmuted'));
      return;
    case 'help': await ctx.text(ctx.lang === 'en' ? HELP : ctx.t('help')); return;
    case 'privacy': await ctx.text(PRIVACY); return;
    case 'forgetAsk':
      await d.sendButtons(ctx.waId, FORGET_ASK, [
        { id: 'forget:yes', title: 'Delete my data' },
        { id: 'forget:no', title: 'Keep it' },
      ]);
      ctx.out.push(FORGET_ASK);
      return;
    case 'forgetNo': await ctx.text('Okay, nothing deleted 👍'); return;
    case 'forgetYes': return; // handled in run() before anything is saved
    case 'learningOff':
      ctx.link.learning = false;
      await d.updateLink(ctx.waId, { learning: false });
      await ctx.text(LEARNING_OFF);
      return;
    case 'learningOn':
      ctx.link.learning = true;
      await d.updateLink(ctx.waId, { learning: true });
      await ctx.text(LEARNING_ON);
      return;
    case 'lang':
      if (f.code) await flush(ctx, await setLangAction(ctx, f.code)); else await langMenu(ctx);
      return;
    case 'meds': await ctx.text((await medsLines(ctx)).join('\n')); return;
    case 'coachMenu': await coachMenu(ctx); return;
    case 'meme': ctx.wantMeme({ moment: 'random', format: f.format, asked: true }); return;
    case 'memesOff':
      await d.updateLink(ctx.waId, { memes: false });
      await ctx.text('Okay, no more memes from me. Send *memes on* to bring them back (or *meme* for one on demand).');
      return;
    case 'memesOn':
      await d.updateLink(ctx.waId, { memes: true });
      ctx.link.memes = true;
      await ctx.text('Memes are back on 😎');
      ctx.wantMeme({ moment: 'random', asked: true });
      return;
    case 'setCoach': await flush(ctx, await setCoachAction(ctx, f.id)); return;
    case 'addTask':
      if (!f.text) await ctx.text(ctx.t('taskUsage')); else await addTaskCommand(ctx, f.text);
      return;
    case 'calendar': await showCalendar(ctx, f.view, f.offset); return;
    case 'files': await ctx.text((await filesLines(ctx)).join('\n')); return;
    case 'sync': for (const m of await syncLines(ctx, f.arg)) await ctx.text(m); return;
    case 'unknownCmd': await ctx.text(UNKNOWN_CMD(f.cmd, ctx.lang)); return;
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
      if (ctx.session.lastAction?.kind === 'focus') ctx.session.lastAction = undefined; // a new morning starts with no picks
      await focusPrompt(ctx, []);
      return;
    }
    case 'checkinSkip': await ctx.text('No problem. Tell me whenever you want to add something 👍'); return;
    case 'focus': await focusPick(ctx, f.id); return;
    case 'focusDone': await focusSummary(ctx, pickedFocus(ctx)); return;
    case 'step': await askNextStep(ctx, f.id); return;
    case 'park': {
      const { ids, errs } = await idsFromNums(ctx, f.nums);
      await flush(ctx, await parkByIds(ctx, ids, errs));
      return;
    }
    case 'parkId': await flush(ctx, await parkByIds(ctx, [f.id])); return;
    case 'unparkId': await flush(ctx, await unparkById(ctx, f.id)); return;
    case 'keepParked': await keepParked(ctx, f.id); return;
    case 'reviewOpen': await openTask(ctx, f.id, true); return;
    case 'somedayList': await somedayList(ctx); return;
    case 'somedayPick': await somedayPick(ctx); return;
    case 'somedayAdd': await addParked(ctx, f.text); return;
    case 'reviewsOff':
      await d.updateLink(ctx.waId, { reviews: false });
      await ctx.text('Okay, no more "this has been sitting" nudges or Sunday reviews. Send *review on* to bring them back.');
      return;
    case 'reviewsOn':
      await d.updateLink(ctx.waId, { reviews: true });
      await ctx.text("Back on. I'll ask about tasks that sit for days, and send a short review on Sundays.");
      return;
    case 'setTime':
      await d.updateLink(ctx.waId, { checkinTime: f.time });
      await ctx.text(ctx.t('checkinSet', { time: time12(f.time) }));
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
