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
import { LANGS, LANG_NAMES, langOf, t as tr, type Key, type Lang, type Params } from './i18n';

export const MAX_LIST = 10;

export const HELP = tr('en', 'help');
export const helpFor = (lang: Lang) => tr(lang, 'help');

export const UNKNOWN_CMD = (cmd: string, lang: Lang = 'en') => tr(lang, 'unknownCmd', { cmd: cmd.slice(0, 20) });
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
  /** The user's language (waLinks.lang); `setLang` changes it mid-turn. */
  lang: Lang;
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
  ) {
    this.lang = langOf(link);
  }

  get uid(): string { return this.link.uid; }

  /** A fixed reply in the user's language. */
  t(key: Key, params?: Params): string { return tr(this.lang, key, params); }

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
    ctx.undos.length = 0;
    await ctx.buttons(text, [{ id: BUTTON_IDS.undo(id), title: ctx.t('btnUndo') }]);
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
    if (!id) return { err: ctx.t('noNumber', { n }) };
    return { id };
  }
  const t = await ctx.d.findTask(ctx.uid, r);
  if (!t) return { err: ctx.t('cantPin', { q: clip(r, 40) }) };
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
      lines.push(ctx.t('couldNotComplete'));
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
          if (s.streak > 0) extra = ctx.t('streak', { n: s.streak });
        } catch { /* streak is a nicety */ }
        lines.push(ctx.t('allDone', { extra }));
        ctx.sticker = 'cheer';
        ctx.wantMeme({ moment: 'all_done', topic: names[0] });
      } else {
        lines.push(ctx.t('leftToday', { n: left.length }));
        ctx.wantMeme({ moment: 'done', topic: names[0] });
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
    return [ctx.t('moved', { task: t.text, when: whenLabel(to, ctx.today, ctx.lang) || ctx.t('today') })];
  } catch (e) {
    console.error('[bot] defer failed', id, e);
    return [ctx.t('couldNotMove')];
  }
}

export async function deleteById(ctx: Ctx, id: string): Promise<string[]> {
  const title = await ctx.titleOf(id);
  try {
    await ctx.d.deleteTask(ctx.uid, id);
    ctx.undos.push({ k: 'delete', ids: [id], label: `deleted ${clip(title, 30)}` });
    return [ctx.t('deleted', { task: title })];
  } catch (e) {
    console.error('[bot] delete failed', id, e);
    return [ctx.t('couldNotDelete')];
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
  if (!ctx.d.setReminder) return [ctx.t('remUnavailable')];
  const r = await resolveRef(ctx, str(a.ref) ?? String(a.ref ?? ''));
  if ('err' in r) return [r.err];
  const t = ctx.known.get(r.id);
  const title = clip(t?.text ?? r.text ?? 'task', 30);
  if (a.off === true) {
    await ctx.d.setReminder(ctx.uid, r.id, null);
    return [ctx.t('remOff', { task: title })];
  }
  const ev = eventMsOf(t, ctx.tz);
  const abs = validWhen(a.remind_at);
  const before = num(a.minutes_before);
  const at = abs?.includes('T') ? zonedToMs(abs, ctx.tz) : ev && before != null && before >= 0 ? ev - before * 60_000 : null;
  if (!at) return [ctx.t('remWhen')];
  if (at <= ctx.d.now()) return [ctx.t('remPassed')];
  await ctx.d.setReminder(ctx.uid, r.id, at, ev ?? at);
  const date = ctx.d.localDate(ctx.tz, at);
  const label = whenLabel(`${date}T${ctx.d.localTime(ctx.tz, at)}`, ctx.today, ctx.lang);
  return [ctx.t('remSet', { task: title, when: label })];
}

const CHANNEL_KEY: Record<string, Key> = { auto: 'remChannelAuto', app: 'remChannelApp', whatsapp: 'remChannelWa', both: 'remChannelBoth' };

export async function setReminderChannelAction(ctx: Ctx, channel?: string): Promise<string[]> {
  const c = (channel ?? '').toLowerCase();
  if (!ctx.d.setReminderChannel || !(c in CHANNEL_KEY)) return [ctx.t('remChannelAsk')];
  await ctx.d.setReminderChannel(ctx.uid, c as 'auto' | 'app' | 'whatsapp' | 'both');
  return [ctx.t(CHANNEL_KEY[c])];
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
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 15);
  if (!items.length) return [];
  const created = await ctx.d.addTasks(ctx.uid, items);
  ctx.rememberTasks(created);
  const lines = [created.length === 1 ? ctx.t('addedOne') : ctx.t('addedMany', { n: created.length })];
  for (const t of created) {
    const forToday = !t.deferredTo || t.deferredTo.slice(0, 10) === ctx.today;
    if (forToday && !ctx.session.lastList.includes(t.id)) ctx.session.lastList.push(t.id);
    const n = ctx.session.lastList.indexOf(t.id) + 1;
    const w = whenLabel(t.deferredTo, ctx.today, ctx.lang);
    const due = t.dueDate ? ctx.t('dueOn', { when: whenLabel(new Date(t.dueDate).toLocaleDateString('en-CA', { timeZone: ctx.tz }), ctx.today, ctx.lang) || ctx.t('today') }) : '';
    const rem = t.remindAt ? ` · ⏰ ${time12(ctx.d.localTime(ctx.tz, t.remindAt))}` : '';
    lines.push(`${n > 0 ? n + '.' : '•'} ${t.text}${w ? ` (${w})` : ''}${due}${rem}`);
  }
  ctx.undos.push({ k: 'add', ids: created.map((t) => t.id), label: `added ${created.length === 1 ? clip(created[0].text, 30) : created.length + ' tasks'}` });
  return lines;
}

/** Numbered today list (open tasks); sets session.lastList. List message when >1, buttons when 1. */
export async function showToday(ctx: Ctx): Promise<void> {
  const all = await ctx.d.listToday(ctx.uid);
  ctx.rememberTasks(all);
  const open = all.filter((t) => !t.completed);
  const done = all.length - open.length;
  if (!open.length) {
    ctx.session.lastList = [];
    await ctx.text(done ? ctx.t('todayEmptyDone', { done }) : ctx.t('todayEmpty'));
    return;
  }
  const shown = open.slice(0, MAX_LIST);
  ctx.session.lastList = shown.map((t) => t.id);
  const head = done ? ctx.t('todayHeadDone', { open: open.length, done }) : ctx.t('todayHead', { open: open.length });
  const body = [head, ...shown.map((t, i) => taskLine(i + 1, t, ctx.today, ctx.lang)), open.length > shown.length ? ctx.t('moreAsk', { n: open.length - shown.length }) : ''].filter(Boolean).join('\n');
  if (shown.length === 1) {
    await ctx.buttons(body, taskButtons(shown[0].id, ctx.lang));
    return;
  }
  const rows: WaListRow[] = shown.map((t, i) => ({
    id: BUTTON_IDS.task(t.id),
    title: clip(`${i + 1}. ${t.text}`, 24),
    description: clip(whenLabel(t.deferredTo, ctx.today, ctx.lang) || t.text, 72),
  }));
  await ctx.list(body, ctx.t('pickTask'), rows);
}

export function taskButtons(id: string, lang: Lang = 'en'): WaButton[] {
  return [
    { id: BUTTON_IDS.done(id), title: tr(lang, 'btnDone') },
    { id: BUTTON_IDS.tomorrow(id), title: tr(lang, 'btnTomorrow') },
    { id: BUTTON_IDS.del(id), title: tr(lang, 'btnDelete') },
  ];
}

export async function openTask(ctx: Ctx, id: string): Promise<void> {
  await ctx.loadKnown();
  const t = ctx.known.get(id);
  if (!t || t.deleted) { await ctx.text(ctx.t('taskGone')); return; }
  const w = whenLabel(t.deferredTo, ctx.today, ctx.lang);
  await ctx.buttons(`*${clip(t.text, 200)}*${w ? `\n${w}` : ''}`, taskButtons(id, ctx.lang));
}

// ---------- undo ----------

export async function undoLast(ctx: Ctx, actionId?: string): Promise<void> {
  const la = ctx.session.lastAction;
  if (!la || (actionId && la.id !== actionId) || la.kind !== 'batch') {
    await ctx.text(ctx.t('nothingUndo'));
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
      else if (u.k === 'workout') await ctx.d.undoLastWorkout(ctx.uid);
      labels.push(u.label);
    } catch (e) {
      console.error('[bot] undo failed', u.k, e);
      labels.push(`(could not undo: ${u.label})`);
    }
  }
  await ctx.text(ctx.lang === 'en' ? ctx.t('undone', { labels: labels.join(', ') || 'nothing' }) : ctx.t('undone'));
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
  const lines = [ctx.t('workoutLogged', { desc: describeWorkout(w) })];
  ctx.sticker = 'flex';
  ctx.wantMeme({ moment: 'workout', topic: w.type });
  try {
    const wk = await ctx.d.weekSummary(ctx.uid);
    lines.push(wk.goal ? ctx.t('workoutsWeekGoal', { w: wk.workouts, g: wk.goal }) : ctx.lang === 'en' ? `${wk.workouts} workout${wk.workouts === 1 ? '' : 's'} this week` : ctx.t('workoutsWeek', { w: wk.workouts }));
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
  return [ctx.t('weekHead'), bits.join(' · ')];
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
  if (!acts.length) return [ctx.t('friendsNone')];
  const lines = [ctx.t('friendsHead')];
  for (const a of acts) {
    const bits: string[] = [];
    if (a.doneToday.length) bits.push(`✅ ${a.doneToday.length} done`);
    if (a.workoutsToday.length) bits.push(`🏃 ${a.workoutsToday.join(', ')}`);
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
  if (!Object.keys(patch).length) return [ctx.t('schedAsk')];
  await ctx.d.updateLink(ctx.waId, patch);
  return [ctx.t('schedSaved'), ...lines];
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

// ---------- language ----------

/** Switch the language of every fixed reply (and of Gemini's lead-ins). A manual choice stops script detection. */
export async function setLangAction(ctx: Ctx, code: Lang): Promise<string[]> {
  await ctx.d.updateLink(ctx.waId, { lang: code, langManual: true });
  ctx.link.lang = code;
  ctx.link.langManual = true;
  ctx.lang = code;
  return [ctx.t('langSet')];
}

/** The language picker (WhatsApp list, ids `lang:<code>`). */
export async function langMenu(ctx: Ctx): Promise<void> {
  await ctx.list(
    ctx.t('langPick', { cur: LANG_NAMES[ctx.lang] }),
    ctx.t('langPickBtn'),
    LANGS.map((l) => ({ id: BUTTON_IDS.lang(l), title: LANG_NAMES[l] })),
  );
}

// ---------- medicine reminders (the family member's side) ----------

export async function medsLines(ctx: Ctx): Promise<string[]> {
  if (!ctx.d.meds) return [ctx.t('medsNone')];
  return ctx.d.meds.statusLines(ctx.uid, ctx.d.now(), ctx.lang, ctx.tz);
}

export async function addMedicationAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  if (!ctx.d.meds) return [ctx.t('remUnavailable')];
  const times = (Array.isArray(a.times) ? a.times : [a.times]).map((x) => String(x ?? '')).filter(Boolean);
  const med = str(a.medicine);
  if (!med) return [ctx.t('medNeedTimes')];
  const r = await ctx.d.meds.addMedication(ctx.uid, str(a.person), med, times);
  if (!r.ok) return [r.reason === 'no_times' ? ctx.t('medNeedTimes') : ctx.t('medNoPerson', { names: r.names.join(', ') || '-' })];
  return [ctx.t('medAdded', { name: r.plan.ownerLabel, meds: r.med.name, times: r.med.times.map((x) => time12(x)).join(', ') })];
}

export async function removeMedicationAction(ctx: Ctx, a: Record<string, unknown>): Promise<string[]> {
  if (!ctx.d.meds) return [ctx.t('remUnavailable')];
  const r = await ctx.d.meds.removeMedication(ctx.uid, str(a.person), str(a.medicine) ?? '');
  if (!r.ok) return [r.reason === 'no_med' ? ctx.t('medNoMatch', { name: str(a.person) ?? '' }) : ctx.t('medNoPerson', { names: r.names.join(', ') || '-' })];
  return [ctx.t('medRemoved', { name: r.plan.ownerLabel, meds: r.med.name })];
}
