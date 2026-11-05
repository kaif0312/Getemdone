// Domain actions shared by the fast paths and the Gemini tool executor. Each action returns reply lines;
// reversible ones push onto ctx.undos, which flush() turns into session.lastAction + an Undo button.
import type { Task } from '@/lib/types';
import type { WaButton, WaListRow, WaLink, WaSession } from '@/lib/wa/types';
import { BUTTON_IDS } from '@/lib/wa/types';
import type { UserLite } from '@/lib/server/users';
import type { Metric } from '@/lib/server/fitness';
import type { StickerName } from '@/lib/wa/send';
import type { BotDeps, Undo } from './types';
import { COACH_IDS, COACHES, isCoachId } from './coaches';
import { raise, type MemeRequest } from './memes';
import { REMIND_LEAD_MIN } from '@/lib/server/reminders';
import { addDays, clip, fmtNum, num, str, taskLine, time12, validTime, validWhen, whenLabel, zonedToMs } from './format';

export const MAX_LIST = 10;

export const HELP = [
  '*What I can do* 👇',
  '• Add tasks: "gym 6pm, call mom, deck by Fri"',
  '• *today* - your list, then tap a task',
  '• *done 2* or *done 1,3* - tick off',
  '• *undo* - take back the last change',
  '• Log fitness: "ran 5k in 28 min", "82.4 kg"',
  '• *week* - fitness this week, *friends* - what friends did',
  '• "nudge Ali" - cheer a friend on',
  '• *coach* - pick your coach (friendly, hardcore, hype...)',
  '• *meme* - a meme from your coach, *memes off* to stop them',
  '• Voice notes and screenshots work too',
  '• Send a document or video and I file it in Drive (a photo: forward it, or caption it "save passport" or "/ref name")',
  '• *review off* stops the "this has been sitting" nudges and the Sunday review, *review on* brings them back',
  '• *stop* pauses my messages, *start* resumes',
  '',
  '*Slash commands* (a leading / works on the commands above)',
  '/task <text> add a task, /today, /done 2, /undo, /week',
  '/files your last 5 Drive files, /help',
].join('\n');

export const UNKNOWN_CMD = (cmd: string) => `Unknown command /${cmd.slice(0, 20)}. Send /help to see what I can do.`;
export const TASK_USAGE = 'Add a task like this: /task call the bank';
export const FILES_NONE = 'Nothing in your Drive vault yet. Send me a document or video, or a photo captioned "/ref name".';

const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** "/files": the user's last vault items, newest first. */
export async function filesLines(ctx: Ctx): Promise<string[]> {
  const items = (await ctx.d.listVaultFiles?.(ctx.waId, 5)) ?? [];
  if (!items.length) return [FILES_NONE];
  const lines = ['*Your last files in Drive* 📁'];
  for (const it of items) {
    const date = new Date(it.at).toLocaleDateString('en-GB', { timeZone: ctx.tz, day: 'numeric', month: 'short' });
    lines.push(`• ${it.name}${it.bytes ? ` (${fmtSize(it.bytes)})` : ''} · ${date}`);
  }
  return lines;
}

export class Ctx {
  readonly known = new Map<string, Task>();
  readonly undos: Undo[] = [];
  /** Everything sent to the user this turn (for the session transcript). */
  readonly out: string[] = [];
  /** A coach sticker to send after this turn's replies (the last one set wins). */
  sticker?: StickerName;
  /** A meme moment raised this turn (lib/bot/memes.ts). */
  meme?: MemeRequest;
  /** One plain task just added for today: flush() offers a "Done already" tap next to Undo (the two-minute rule). */
  doneAlready?: string;
  private loaded = false;

  wantMeme(r: MemeRequest): void { this.meme = raise(this.meme, r); }

  constructor(
    readonly d: BotDeps,
    readonly waId: string,
    readonly link: WaLink,
    readonly user: UserLite | null,
    readonly tz: string,
    readonly session: WaSession,
    readonly today: string,
    readonly time: string,
  ) {}

  get uid(): string { return this.link.uid; }

  async text(t: string): Promise<void> {
    const body = t.slice(0, 3800);
    this.out.push(body);
    await this.d.sendText(this.waId, body);
  }
  async buttons(body: string, buttons: WaButton[]): Promise<void> {
    const b = body.slice(0, 1000);
    this.out.push(b);
    await this.d.sendButtons(this.waId, b, buttons.slice(0, 3));
  }
  async list(body: string, label: string, rows: WaListRow[]): Promise<void> {
    const b = body.slice(0, 1000);
    this.out.push(b);
    await this.d.sendList(this.waId, b, label, rows.slice(0, MAX_LIST));
  }

  /** Open + today tasks by id, loaded once per message. */
  async loadKnown(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const [open, today] = await Promise.all([this.d.listOpen(this.uid, 100), this.d.listToday(this.uid)]);
    for (const t of [...open, ...today]) this.known.set(t.id, t);
  }
  rememberTasks(ts: Task[]): void { for (const t of ts) this.known.set(t.id, t); }
  async titleOf(id: string): Promise<string> {
    if (!this.known.has(id)) await this.loadKnown();
    return this.known.get(id)?.text ?? 'task';
  }
}

export function newActionId(now: number): string {
  return now.toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Send the lines; when something reversible happened, attach an Undo button and record session.lastAction. */
export async function flush(ctx: Ctx, lines: string[]): Promise<void> {
  const text = lines.filter(Boolean).join('\n');
  if (!text) return;
  if (ctx.undos.length) {
    const id = newActionId(ctx.d.now());
    ctx.session.lastAction = { id, kind: 'batch', payload: { undos: [...ctx.undos] }, at: ctx.d.now() };
    const btns: WaButton[] = [];
    if (ctx.doneAlready && !ctx.undos.some((u) => u.k === 'complete')) btns.push({ id: BUTTON_IDS.done(ctx.doneAlready), title: 'Done already ✅' });
    btns.push({ id: BUTTON_IDS.undo(id), title: 'Undo ↩️' });
    ctx.doneAlready = undefined;
    ctx.undos.length = 0;
    await ctx.buttons(text, btns);
  } else {
    await ctx.text(text);
  }
}

// ---------- refs ----------

export type Resolved = { id: string; text?: string } | { err: string };

export async function resolveRef(ctx: Ctx, ref: string): Promise<Resolved> {
  const r = ref.trim();
  const m = /^#?(\d+)$/.exec(r);
  if (m) {
    const n = +m[1];
    const id = ctx.session.lastList[n - 1];
    if (!id) return { err: `I don't have a #${n} in your list. Send *today* to see it.` };
    return { id };
  }
  const t = await ctx.d.findTask(ctx.uid, r);
  if (!t) return { err: `Couldn't pin down "${clip(r, 40)}". Send *today* and use the number.` };
  ctx.rememberTasks([t]);
  return { id: t.id, text: t.text };
}

// ---------- tasks ----------

export async function leftToday(ctx: Ctx): Promise<Task[]> {
  const ts = await ctx.d.listToday(ctx.uid);
  ctx.rememberTasks(ts);
  return ts.filter((t) => !t.completed);
}

export async function completeByIds(ctx: Ctx, ids: string[], errs: string[] = []): Promise<string[]> {
  const lines: string[] = [];
  const doneIds: string[] = [];
  const names: string[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      const t = await ctx.d.completeTask(ctx.uid, id);
      doneIds.push(id);
      names.push(t.text);
      lines.push(`✅ ${t.text}`);
    } catch (e) {
      console.error('[bot] complete failed', id, e);
      lines.push('⚠️ Could not complete one of those.');
    }
  }
  lines.push(...errs);
  if (doneIds.length) {
    ctx.undos.push({ k: 'complete', ids: doneIds, label: `completed ${names.length === 1 ? clip(names[0], 30) : names.length + ' tasks'}` });
    try {
      const left = await leftToday(ctx);
      if (left.length === 0) {
        let extra = '';
        try {
          const s = await ctx.d.daySummary(ctx.uid);
          if (s.streak > 0) extra = ` 🔥 ${s.streak}-day streak`;
        } catch { /* streak is a nicety */ }
        lines.push(`🎉 All done for today!${extra}`);
        ctx.sticker = 'cheer';
        ctx.wantMeme({ moment: 'all_done', topic: names[0] });
      } else {
        lines.push(`${left.length} left today`);
        ctx.wantMeme({ moment: 'done', topic: names[0] });
      }
      // The top 3 for today (task.focusDate): say so when the last of them is ticked.
      const focus = [...ctx.known.values()].filter((t) => t.focusDate === ctx.today && !t.deleted);
      if (focus.length && focus.every((t) => t.completed) && focus.some((t) => doneIds.includes(t.id))) {
        lines.push(focus.length === 1 ? '⭐ Your focus task is done' : `⭐ All ${focus.length} focus tasks done`);
      }
    } catch (e) {
      console.error('[bot] left count failed', e);
    }
  }
  return lines;
}

export async function completeByRefs(ctx: Ctx, refs: string[]): Promise<string[]> {
  const ids: string[] = [];
  const errs: string[] = [];
  for (const ref of refs) {
    const r = await resolveRef(ctx, ref);
    if ('err' in r) errs.push(r.err);
    else ids.push(r.id);
  }
  return completeByIds(ctx, ids, errs);
}

export async function deferByRef(ctx: Ctx, ref: string, toDate?: string): Promise<string[]> {
  const r = await resolveRef(ctx, ref);
  if ('err' in r) return [r.err];
  return deferById(ctx, r.id, toDate);
}

export async function deferById(ctx: Ctx, id: string, toDate?: string): Promise<string[]> {
  const to = validWhen(toDate)?.slice(0, 10) ?? addDays(ctx.today, 1);
  try {
    const t = await ctx.d.deferTask(ctx.uid, id, to);
    ctx.undos.push({ k: 'defer', ids: [id], to: ctx.today, label: `moved ${clip(t.text, 30)}` });
    if (to > ctx.today) ctx.wantMeme({ moment: 'deferred', topic: t.text });
    return [`➡️ ${t.text} moved to ${whenLabel(to, ctx.today) || 'today'}`];
  } catch (e) {
    console.error('[bot] defer failed', id, e);
    return ['⚠️ Could not move that task.'];
  }
}

export async function deleteById(ctx: Ctx, id: string): Promise<string[]> {
  const title = await ctx.titleOf(id);
  try {
    await ctx.d.deleteTask(ctx.uid, id);
    ctx.undos.push({ k: 'delete', ids: [id], label: `deleted ${clip(title, 30)}` });
    return [`🗑 Deleted: ${title}`];
  } catch (e) {
    console.error('[bot] delete failed', id, e);
    return ['⚠️ Could not delete that task.'];
  }
}

export async function deleteByRef(ctx: Ctx, ref: string): Promise<string[]> {
  const r = await resolveRef(ctx, ref);
  return 'err' in r ? [r.err] : deleteById(ctx, r.id);
}

/** The event time of a task in ms: a clock time in `deferredTo`, else its deadline. */
function eventMsOf(t: Pick<Task, 'deferredTo' | 'dueDate'> | undefined, tz: string): number | null {
  if (t?.deferredTo?.includes('T')) return zonedToMs(t.deferredTo, tz);
  return t?.dueDate ?? null;
}

/** Reminder fields for a new task. Default: a task with a clock time ("gym 6pm") reminds 15 min before. */
function reminderFor(ctx: Ctx, o: Record<string, unknown>, when?: string, due?: string): { remindAt?: number; remindFor?: number } {
  if (o.no_reminder === true) return {};
  const now = ctx.d.now();
  const whenMs = when?.includes('T') ? zonedToMs(when, ctx.tz) : null;
  const dueMs = due?.includes('T') ? zonedToMs(due, ctx.tz) : null;
  const eventMs = whenMs ?? dueMs;
  const abs = validWhen(o.remind_at);
  const absMs = abs?.includes('T') ? zonedToMs(abs, ctx.tz) : null;
  const before = num(o.remind_before_min);
  let at: number | null = null;
  if (absMs) at = absMs;
  else if (eventMs && before != null && before >= 0) at = eventMs - before * 60_000;
  else if (whenMs && ctx.user?.notificationSettings?.deadlineReminders !== false) at = whenMs - REMIND_LEAD_MIN * 60_000;
  if (!at || at <= now) return {};
  return { remindAt: at, remindFor: eventMs ?? at };
}

export async function setReminderAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  if (!ctx.d.setReminder) return ['⚠️ Reminders are not available right now.'];
  const r = await resolveRef(ctx, str(a.ref) ?? String(a.ref ?? ''));
  if ('err' in r) return [r.err];
  const t = ctx.known.get(r.id);
  const title = clip(t?.text ?? r.text ?? 'task', 30);
  if (a.off === true) {
    await ctx.d.setReminder(ctx.uid, r.id, null);
    return [`🔕 No reminder for ${title}`];
  }
  const ev = eventMsOf(t, ctx.tz);
  const abs = validWhen(a.remind_at);
  const before = num(a.minutes_before);
  const at = abs?.includes('T') ? zonedToMs(abs, ctx.tz) : ev && before != null && before >= 0 ? ev - before * 60_000 : null;
  if (!at) return ['⚠️ When should I remind you? e.g. "remind me at 5pm".'];
  if (at <= ctx.d.now()) return ['⚠️ That time has already passed.'];
  await ctx.d.setReminder(ctx.uid, r.id, at, ev ?? at);
  const date = ctx.d.localDate(ctx.tz, at);
  const label = whenLabel(`${date}T${ctx.d.localTime(ctx.tz, at)}`, ctx.today);
  return [`⏰ I'll remind you about ${title}: ${label}`];
}

const CHANNEL_LABEL: Record<string, string> = {
  auto: 'in the app if you have it, otherwise here on WhatsApp',
  app: 'in the app only',
  whatsapp: 'here on WhatsApp only',
  both: 'in the app and on WhatsApp',
};

export async function setReminderChannelAction(ctx: Ctx, channel?: string): Promise<string[]> {
  const c = (channel ?? '').toLowerCase();
  if (!ctx.d.setReminderChannel || !(c in CHANNEL_LABEL)) return ['⚠️ Reminders go to: app, whatsapp, both or auto. Which one?'];
  await ctx.d.setReminderChannel(ctx.uid, c as 'auto' | 'app' | 'whatsapp' | 'both');
  return [`🔔 Reminders will come ${CHANNEL_LABEL[c]}.`];
}

export async function addItems(ctx: Ctx, raw: unknown): Promise<string[]> {
  const arr = Array.isArray(raw) ? raw : [];
  const items = arr
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      const text = str(o.text);
      if (!text) return null;
      const due = validWhen(o.due);
      const when = validWhen(o.when);
      return {
        text: text.slice(0, 2000),
        when,
        dueDate: due ? zonedToMs(due, ctx.tz) ?? undefined : undefined,
        recurrenceText: str(o.recurrence),
        ...reminderFor(ctx, o, when, due),
        alreadyDone: o.already_done === true && !str(o.recurrence),
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 15);
  if (!items.length) return [];
  const created = await ctx.d.addTasks(ctx.uid, items.map(({ text, when, dueDate, recurrenceText, remindAt, remindFor }) => ({ text, when, dueDate, recurrenceText, remindAt, remindFor })));
  ctx.rememberTasks(created);
  // "I already called mom": the task is logged and ticked in one go (the two-minute rule), so the day's streak counts it.
  const finished = created.filter((_, i) => items[i]?.alreadyDone);
  const pending = created.filter((_, i) => !items[i]?.alreadyDone);
  const lines = pending.length ? [pending.length === 1 ? '📝 Added:' : `📝 Added ${pending.length}:`] : [];
  for (const t of pending) {
    const forToday = !t.deferredTo || t.deferredTo.slice(0, 10) === ctx.today;
    if (forToday && !ctx.session.lastList.includes(t.id)) ctx.session.lastList.push(t.id);
    const n = ctx.session.lastList.indexOf(t.id) + 1;
    const w = whenLabel(t.deferredTo, ctx.today);
    const due = t.dueDate ? ` · due ${whenLabel(new Date(t.dueDate).toLocaleDateString('en-CA', { timeZone: ctx.tz }), ctx.today) || 'today'}` : '';
    const rem = t.remindAt ? ` · ⏰ ${time12(ctx.d.localTime(ctx.tz, t.remindAt))}` : '';
    lines.push(`${n > 0 ? n + '.' : '•'} ${t.text}${w ? ` (${w})` : ''}${due}${rem}`);
  }
  if (finished.length) lines.push(...await completeByIds(ctx, finished.map((t) => t.id)));
  ctx.undos.push({ k: 'add', ids: created.map((t) => t.id), label: `added ${created.length === 1 ? clip(created[0].text, 30) : created.length + ' tasks'}` });
  // Two-minute rule: one plain task for today gets a "Done already" tap (a timed or recurring one is not "already").
  const only = created.length === 1 && pending.length === 1 ? pending[0] : null;
  if (only && (!only.deferredTo || only.deferredTo.slice(0, 10) === ctx.today) && !only.deferredTo?.includes('T') && !only.recurrence) ctx.doneAlready = only.id;
  return lines;
}

/** Numbered today list (open tasks); sets session.lastList. List message when >1, buttons when 1. */
export async function showToday(ctx: Ctx): Promise<void> {
  const all = await ctx.d.listToday(ctx.uid);
  ctx.rememberTasks(all);
  const isFocus = (t: Task) => t.focusDate === ctx.today;
  // Today's top 3 first (stable: the rest keep the app's order).
  const open = [...all.filter((t) => !t.completed && isFocus(t)), ...all.filter((t) => !t.completed && !isFocus(t))];
  const done = all.length - open.length;
  if (!open.length) {
    ctx.session.lastList = [];
    await ctx.text(done ? `🎉 Nothing left for today (${done} done). Tell me what's next.` : 'Nothing on your list today. Tell me what you want to get done.');
    return;
  }
  const shown = open.slice(0, MAX_LIST);
  ctx.session.lastList = shown.map((t) => t.id);
  const head = `*Today* · ${open.length} open${done ? `, ${done} done` : ''}`;
  const body = [head, ...shown.map((t, i) => (isFocus(t) ? taskLine(i + 1, t, ctx.today).replace(/^(\d+\.) /, '$1 ⭐ ') : taskLine(i + 1, t, ctx.today))), open.length > shown.length ? `+${open.length - shown.length} more (ask me for them)` : ''].filter(Boolean).join('\n');
  if (shown.length === 1) {
    await ctx.buttons(body, taskButtons(shown[0].id));
    return;
  }
  const rows: WaListRow[] = shown.map((t, i) => ({
    id: BUTTON_IDS.task(t.id),
    title: clip(`${i + 1}. ${t.text}`, 24),
    description: clip(whenLabel(t.deferredTo, ctx.today) || t.text, 72),
  }));
  await ctx.list(body, 'Pick a task', rows);
}

export function taskButtons(id: string): WaButton[] {
  return [
    { id: BUTTON_IDS.done(id), title: 'Done ✅' },
    { id: BUTTON_IDS.tomorrow(id), title: 'Tomorrow' },
    { id: BUTTON_IDS.del(id), title: 'Delete' },
  ];
}

export async function openTask(ctx: Ctx, id: string): Promise<void> {
  await ctx.loadKnown();
  const t = ctx.known.get(id);
  if (!t || t.deleted) { await ctx.text('That task is gone. Send *today* for your list.'); return; }
  const w = whenLabel(t.deferredTo, ctx.today);
  await ctx.buttons(`*${clip(t.text, 200)}*${w ? `\n${w}` : ''}`, taskButtons(id));
}

// ---------- top 3 for today (focus) ----------

export const MAX_FOCUS = 3;

/** The focus ids picked so far this session (session.lastAction kind 'focus'). */
export function pickedFocus(ctx: Ctx): string[] {
  const la = ctx.session.lastAction;
  return la?.kind === 'focus' ? ((la.payload as { ids?: string[] }).ids ?? []) : [];
}

/** After a pick: the rest of today's open tasks as one-tap rows, plus "That's enough" once something is picked. */
export async function focusPrompt(ctx: Ctx, picked: string[]): Promise<void> {
  const open = (await ctx.d.listToday(ctx.uid)).filter((t) => !t.completed);
  ctx.rememberTasks(open);
  const rest = open.filter((t) => !picked.includes(t.id));
  if (!rest.length) { await focusSummary(ctx, picked); return; }
  const shown = rest.slice(0, picked.length ? MAX_LIST - 1 : MAX_LIST);
  ctx.session.lastList = shown.map((t) => t.id);
  const rows: WaListRow[] = shown.map((t, i) => ({ id: BUTTON_IDS.focus(t.id), title: clip(`${i + 1}. ${t.text}`, 24) }));
  if (picked.length) rows.push({ id: BUTTON_IDS.focusDone, title: "That's enough" });
  await ctx.list(
    [
      picked.length ? `⭐ ${picked.length}/${MAX_FOCUS} picked. Next one?` : `Pick up to ${MAX_FOCUS} to focus on today:`,
      ...shown.map((t, i) => `${i + 1}. ${t.text}`),
    ].join('\n'),
    'Pick a task',
    rows,
  );
}

/** The chosen top tasks as a numbered list, so "done 1" ticks the first one. */
export async function focusSummary(ctx: Ctx, ids: string[]): Promise<void> {
  if (!ids.length) { await ctx.text('No focus picked. Send *today* any time to see your list.'); return; }
  for (const id of ids) await ctx.titleOf(id); // loads the known tasks once
  ctx.session.lastList = [...ids];
  const lines = ids.map((id, i) => `${i + 1}. ⭐ ${ctx.known.get(id)?.text ?? 'task'}`);
  await ctx.text([`*Your ${ids.length === 1 ? 'focus' : ids.length + ' for today'}*`, ...lines, '', 'Send *done 1* as you finish them. Your friends can see how you get on.'].join('\n'));
}

export async function focusPick(ctx: Ctx, id: string): Promise<void> {
  const ids = [...new Set([...pickedFocus(ctx), id])].slice(-MAX_FOCUS);
  await ctx.d.setFocus(ctx.uid, ids);
  ctx.session.lastAction = { id: 'focus', kind: 'focus', payload: { ids }, at: ctx.d.now() };
  if (ids.length >= MAX_FOCUS) await focusSummary(ctx, ids);
  else await focusPrompt(ctx, ids);
}

// ---------- stale task: "what is the very first small step?" ----------

const STEP_TTL_MS = 20 * 60_000;
const SKIP_STEP = /^(skip|cancel|no|nope|later|never ?mind)$/i;

/** The user tapped "Next step" on a stale-task nudge: ask for the first action and wait for their next message. */
export async function askNextStep(ctx: Ctx, id: string): Promise<void> {
  if (!ctx.d.renameTask) { await ctx.text('That is not available right now.'); return; }
  await ctx.loadKnown();
  const t = ctx.known.get(id);
  if (!t || t.deleted || t.completed) { await ctx.text('That task is already gone or done. Send *today* for your list.'); return; }
  ctx.session.lastAction = { id: 'step', kind: 'pending_step', payload: { taskId: id }, at: ctx.d.now() };
  await ctx.text(`✍️ *${clip(t.text, 120)}*\nWhat is the very first small step? Reply with it (e.g. "Call the bank and ask for the form"), or send *skip*.`);
}

export function hasPendingStep(ctx: Ctx): string | null {
  const la = ctx.session.lastAction;
  if (la?.kind !== 'pending_step' || ctx.d.now() - la.at > STEP_TTL_MS) return null;
  return String((la.payload as { taskId?: string }).taskId ?? '') || null;
}

/**
 * The reply after "Next step". Only a short single-line text counts as the step; anything else (a list of new tasks, a
 * command, a voice note) just ends the wait and is handled normally. Returns true when the message was consumed.
 */
export async function takeStep(ctx: Ctx, text: string | undefined): Promise<boolean> {
  const taskId = hasPendingStep(ctx);
  if (!taskId) { if (ctx.session.lastAction?.kind === 'pending_step') ctx.session.lastAction = undefined; return false; }
  const t = (text ?? '').trim();
  if (!t || t.length > 200 || /[\n;]/.test(t) || (t.match(/,/g)?.length ?? 0) > 1) { ctx.session.lastAction = undefined; return false; }
  ctx.session.lastAction = undefined;
  if (SKIP_STEP.test(t)) { await ctx.text('Okay, I left it as it is.'); return true; }
  try {
    const { old, task } = await ctx.d.renameTask!(ctx.uid, taskId, t);
    ctx.undos.push({ k: 'rename', id: taskId, old, label: `rewrote ${clip(old, 30)}` });
    ctx.rememberTasks([task]);
    await flush(ctx, [`✏️ Now: *${clip(task.text, 150)}*`, `Was: ${clip(old, 80)}`]);
  } catch (e) {
    console.error('[bot] rename failed', taskId, e);
    await ctx.text('⚠️ I could not change that task.');
  }
  return true;
}

// ---------- undo ----------

export async function undoLast(ctx: Ctx, actionId?: string): Promise<void> {
  const la = ctx.session.lastAction;
  if (!la || (actionId && la.id !== actionId) || la.kind !== 'batch') {
    await ctx.text('Nothing to undo.');
    return;
  }
  const undos = ((la.payload as { undos?: Undo[] }).undos ?? []);
  ctx.session.lastAction = undefined;
  const labels: string[] = [];
  for (const u of undos) {
    try {
      if (u.k === 'add') for (const id of u.ids) await ctx.d.deleteTask(ctx.uid, id);
      else if (u.k === 'complete') for (const id of u.ids) await ctx.d.uncompleteTask(ctx.uid, id);
      else if (u.k === 'delete') for (const id of u.ids) await ctx.d.restoreTask(ctx.uid, id);
      else if (u.k === 'defer') for (const id of u.ids) await ctx.d.deferTask(ctx.uid, id, u.to);
      else if (u.k === 'rename') await ctx.d.renameTask?.(ctx.uid, u.id, u.old);
      else if (u.k === 'workout') await ctx.d.undoLastWorkout(ctx.uid);
      labels.push(u.label);
    } catch (e) {
      console.error('[bot] undo failed', u.k, e);
      labels.push(`(could not undo: ${u.label})`);
    }
  }
  await ctx.text(`↩️ Undone: ${labels.join(', ') || 'nothing'}`);
}

// ---------- fitness ----------

const METRIC_MAP: Record<string, { key: Metric; unit: string; label: string }> = {
  steps: { key: 'steps', unit: '', label: 'steps' },
  weight_kg: { key: 'weightKg', unit: ' kg', label: 'weight' },
  sleep_h: { key: 'sleepH', unit: ' h', label: 'sleep' },
  water_l: { key: 'waterL', unit: ' L', label: 'water' },
};

export interface WorkoutArgs { type: string; minutes?: number; distanceKm?: number; sets?: number; reps?: number; note?: string; date?: string }

export function parseWorkout(a: Record<string, unknown>): WorkoutArgs | null {
  const type = str(a.type);
  if (!type) return null;
  const pos = (v: unknown) => { const n = num(v); return n !== undefined && n > 0 ? n : undefined; };
  return {
    type: clip(type, 60),
    minutes: pos(a.minutes),
    distanceKm: pos(a.distance_km),
    sets: pos(a.sets),
    reps: pos(a.reps),
    note: str(a.note) ? clip(str(a.note)!, 300) : undefined,
    date: validWhen(a.date)?.slice(0, 10),
  };
}

export function describeWorkout(w: WorkoutArgs): string {
  const bits = [w.type];
  if (w.distanceKm) bits.push(`${fmtNum(w.distanceKm)} km`);
  if (w.minutes) bits.push(`${fmtNum(w.minutes)} min`);
  if (w.sets) bits.push(`${w.sets} sets${w.reps ? ` x ${w.reps}` : ''}`);
  return bits.join(' · ');
}

export async function logWorkoutAction(ctx: Ctx, w: WorkoutArgs): Promise<string[]> {
  await ctx.d.logWorkout(ctx.uid, w);
  ctx.undos.push({ k: 'workout', label: `workout ${clip(w.type, 20)}` });
  const lines = [`💪 Logged: ${describeWorkout(w)}`];
  ctx.sticker = 'flex';
  ctx.wantMeme({ moment: 'workout', topic: w.type });
  try {
    const wk = await ctx.d.weekSummary(ctx.uid);
    lines.push(wk.goal ? `${wk.workouts}/${wk.goal} workouts this week` : `${wk.workouts} workout${wk.workouts === 1 ? '' : 's'} this week`);
  } catch (e) {
    console.error('[bot] weekSummary failed', e);
  }
  return lines;
}

export async function logMetricAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  const m = METRIC_MAP[String(a.metric)];
  const v = num(a.value);
  if (!m || v === undefined || v < 0) return ['⚠️ I could not read that number.'];
  await ctx.d.logMetric(ctx.uid, m.key, v, validWhen(a.date)?.slice(0, 10));
  return [`📏 Logged ${m.label}: ${m.key === 'steps' ? v.toLocaleString('en-US') : fmtNum(v)}${m.unit}`];
}

export async function weekLines(ctx: Ctx): Promise<string[]> {
  const w = await ctx.d.weekSummary(ctx.uid);
  const bits = [`${w.workouts}${w.goal ? `/${w.goal}` : ''} workouts`];
  if (w.minutes) bits.push(`${fmtNum(w.minutes)} min`);
  if (w.distanceKm) bits.push(`${fmtNum(w.distanceKm)} km`);
  if (w.lastWeightKg) bits.push(`${fmtNum(w.lastWeightKg)} kg`);
  return [`*This week* 🏃`, bits.join(' · ')];
}

export async function setGoalAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  const g: { workoutsPerWeek?: number; stepsPerDay?: number; targetWeightKg?: number } = {};
  const w = num(a.workouts_per_week), s = num(a.steps_per_day), t = num(a.target_weight_kg);
  if (w !== undefined && w > 0) g.workoutsPerWeek = Math.round(w);
  if (s !== undefined && s > 0) g.stepsPerDay = Math.round(s);
  if (t !== undefined && t > 0) g.targetWeightKg = t;
  if (!Object.keys(g).length) return ['⚠️ What goal should I set?'];
  await ctx.d.setGoals(ctx.uid, g);
  const bits: string[] = [];
  if (g.workoutsPerWeek) bits.push(`${g.workoutsPerWeek} workouts/week`);
  if (g.stepsPerDay) bits.push(`${g.stepsPerDay.toLocaleString('en-US')} steps/day`);
  if (g.targetWeightKg) bits.push(`${fmtNum(g.targetWeightKg)} kg target`);
  return [`🎯 Goal set: ${bits.join(', ')}`];
}

// ---------- social ----------

export async function friendsLines(ctx: Ctx): Promise<string[]> {
  const acts = await ctx.d.friendsActivity(ctx.uid);
  if (!acts.length) return ["No friends on Nudge yet. Add some in the app and I'll show what they get done."];
  const lines = ['*Friends today*'];
  for (const a of acts) {
    const bits: string[] = [];
    if (a.doneToday.length) bits.push(`✅ ${a.doneToday.length} done`);
    if (a.workoutsToday.length) bits.push(`🏃 ${a.workoutsToday.join(', ')}`);
    if (a.focus?.total) bits.push(`⭐ ${a.focus.done}/${a.focus.total} focus`);
    if (a.streak > 1) bits.push(`🔥 ${a.streak}`);
    lines.push(`• ${a.displayName}: ${bits.join(' · ') || 'quiet so far'}`);
  }
  return lines;
}

export async function nudgeAction(ctx: Ctx, name: string, message?: string): Promise<string[]> {
  const f = await ctx.d.findFriend(ctx.uid, name);
  if (!f) return [`I couldn't find a friend called "${clip(name, 30)}". Send *friends* to see who's here.`];
  return nudgeUid(ctx, f.uid, f.displayName, message);
}

export async function nudgeUid(ctx: Ctx, friendUid: string, displayName?: string, message?: string): Promise<string[]> {
  const r = await ctx.d.nudgeFriend(ctx.uid, friendUid, message);
  const who = displayName ?? 'your friend';
  return [r.ok ? `⚡ Nudged ${who}` : `Couldn't nudge ${who}${r.reason ? `: ${r.reason}` : ''}`];
}

export async function reactAction(ctx: Ctx, name: string, emoji: string): Promise<string[]> {
  const f = await ctx.d.findFriend(ctx.uid, name);
  if (!f) return [`I couldn't find a friend called "${clip(name, 30)}".`];
  const acts = await ctx.d.friendsActivity(ctx.uid);
  const a = acts.find((x) => x.uid === f.uid);
  const last = a?.doneToday[a.doneToday.length - 1];
  if (!last) return [`${f.displayName} hasn't finished anything I can react to yet today.`];
  await ctx.d.reactToTask(ctx.uid, last.taskId, emoji);
  return [`${emoji} Sent to ${f.displayName} for "${clip(last.text, 40)}"`];
}

// ---------- schedule ----------

export async function setScheduleAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  const patch: Partial<WaLink> = {};
  const lines: string[] = [];
  for (const [arg, field, label] of [['checkin_time', 'checkinTime', 'Morning check-in'], ['recap_time', 'recapTime', 'Evening recap']] as const) {
    const raw = str(a[arg]);
    if (!raw) continue;
    if (raw.toLowerCase() === 'off') { patch[field] = null; lines.push(`${label}: off`); continue; }
    const t = validTime(raw);
    if (t) { patch[field] = t; lines.push(`${label}: ${time12(t)}`); }
  }
  if (!Object.keys(patch).length) return ['⚠️ What time should I use? e.g. "check in at 8am".'];
  await ctx.d.updateLink(ctx.waId, patch);
  return ['⏰ Saved', ...lines];
}

/** Switch coach. Returns the new coach's hello line; the whistle sticker marks the change. */
export async function setCoachAction(ctx: Ctx, id: string | undefined): Promise<string[]> {
  if (!isCoachId(id)) return ["⚠️ I don't know that coach. Send *coach* to see the list."];
  await ctx.d.updateLink(ctx.waId, { coach: id });
  ctx.link.coach = id;
  ctx.sticker = 'blowing';
  return [COACHES[id].hello];
}

/** The coach picker (WhatsApp list, ids `coach:<id>`). */
export async function coachMenu(ctx: Ctx): Promise<void> {
  const cur = COACHES[isCoachId(ctx.link.coach) ? ctx.link.coach : 'buddy'];
  await ctx.list(
    `Who should coach you? Right now it's *${cur.title.replace(/^\S+\s/, '')}*.`,
    'Pick a coach',
    COACH_IDS.map((id) => ({ id: `coach:${id}`, title: COACHES[id].title, description: COACHES[id].blurb })),
  );
}
