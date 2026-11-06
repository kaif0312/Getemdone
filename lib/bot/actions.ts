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
import { agendaText, buildMonth, buildWeek } from '@/lib/calendar/events';
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
/** "/calendar": the month grid or the week agenda as a picture, with Prev / Next / switch buttons; a text agenda if the picture fails. */
export async function showCalendar(ctx: Ctx, view: 'month' | 'week', offset: number): Promise<void> {
  const cal = ctx.d.calendar;
  if (!cal) { await ctx.text('The calendar is not available right now.'); return; }
  const tasks = await cal.tasks(ctx.uid);
  const model = view === 'month' ? buildMonth(tasks, ctx.tz, ctx.today, offset) : buildWeek(tasks, ctx.tz, ctx.today, offset);
  const days = view === 'month' ? (model as ReturnType<typeof buildMonth>).weeks.flat() : (model as ReturnType<typeof buildWeek>).days;
  // Caption: a month shows what is coming up next (this month only); a week shows its own days.
  const upcoming = view === 'month' ? days.filter((d) => d.date >= ctx.today && d.date <= addDays(ctx.today, 7)) : days;
  const agenda = (view === 'week' || offset === 0 ? agendaText(upcoming, ctx.today, view === 'week' ? 7 : 4, 4) : '');
  const headline = view === 'month' ? (model as ReturnType<typeof buildMonth>).title : (model as ReturnType<typeof buildWeek>).title;
  const nothing = 'Nothing planned. Send me what you want to get done.';
  const caption = agenda
    ? `*${headline}*\n\n${view === 'month' ? '*Coming up*\n' : ''}${agenda}`.slice(0, 1000)
    : `*${headline}*\n${model.total ? `${model.total - model.done} to go, ${model.done} done` : nothing}`;
  const other = view === 'month' ? 'week' : 'month';
  const buttons = [
    { id: `cal:${view}:${offset - 1}`, title: '◀ Prev' },
    { id: `cal:${view}:${offset + 1}`, title: 'Next ▶' },
    { id: `cal:${other}:0`, title: other === 'week' ? 'Week view' : 'Month view' },
  ];
  const sent = await cal.sendImage(ctx.waId, view, model, caption, buttons);
  ctx.out.push(caption);
  if (!sent) {
    const text = agendaText(days, ctx.today, 7, 5);
    await ctx.text(`*${headline}*

${text || 'Nothing planned yet. Tell me what you want to get done.'}`);
  }
}

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

/**
 * "/sync": put timed tasks into a calendar. Two ways, both set up from this chat:
 *   link   a private ICS URL to subscribe to in Google / Apple / Outlook (read-only, refreshes about hourly)
 *   google a "Nudge" calendar in the user's Google account, kept in step by the 15-min cron
 * Returns one WhatsApp message per entry (a copyable URL goes alone so it can be long-pressed).
 */
export async function syncLines(ctx: Ctx, arg: string): Promise<string[]> {
  const cal = ctx.d.calSync;
  if (!cal) return ['Calendar sync is not available right now.'];
  const a = arg.trim();
  const uid = ctx.uid;

  if (a === 'link' || a === 'ics' || a === 'url' || a === 'reset' || a === 'new link') {
    const f = await cal.ensureFeed(uid, a === 'reset' || a === 'new link');
    return [
      [
        a === 'reset' || a === 'new link' ? '🔄 New calendar link made. The old one stopped working.' : '📅 *Your calendar link*',
        '',
        '*iPhone / Mac:* tap this: ' + f.webcalUrl,
        '*Google Calendar:* open calendar.google.com on a computer → Other calendars (+) → *From URL* → paste the link below. (The phone app can\'t add it; once added it shows there too.)',
        '',
        'Timed tasks show up (like "gym 6pm"); done ones disappear. Calendars refresh it by themselves, Google can take a few hours. Anyone with the link can see your task titles, so keep it private. */sync reset* makes a new one.',
      ].join('\n'),
      f.url,
    ];
  }

  if (a === 'google' || a === 'connect' || a === 'gcal') {
    if (!cal.googleAvailable()) return ['Google Calendar is not switched on yet. Send */sync link* for the link version, which works everywhere.'];
    const st = await cal.status(uid);
    if (st.google.connected) return [`Google Calendar is already connected${st.google.email ? ` (${st.google.email})` : ''}. Send */sync now* to update it, or */sync off* to disconnect.`];
    return [
      [
        '📅 *Connect Google Calendar*',
        'Tap the link, pick your Google account and allow it. Nudge only gets its own calendar called *Nudge*; it can\'t see or change your other events.',
        'The link works for 20 minutes.',
      ].join('\n'),
      cal.googleLink(uid),
    ];
  }

  if (a === 'now' || a === 'refresh') {
    const st = await cal.status(uid);
    if (!st.google.connected) return [st.google.needsReconnect ? 'Google lost access. Send */sync google* to reconnect.' : 'Google Calendar isn\'t connected. Send */sync google* to set it up.'];
    const r = await cal.syncNow(uid);
    if (r.status === 'revoked') return ['Google lost access. Send */sync google* to reconnect.'];
    if (r.status === 'error') return ['I couldn\'t reach Google just now. I\'ll retry on my own in a few minutes.'];
    const bits = [r.created && `${r.created} added`, r.updated && `${r.updated} updated`, r.deleted && `${r.deleted} removed`].filter(Boolean);
    return [bits.length ? `✅ Calendar updated: ${bits.join(', ')}.` : '✅ Calendar is already up to date.'];
  }

  if (a === 'off' || a === 'stop' || a === 'disconnect') {
    const st = await cal.status(uid);
    if (!st.feed && !st.google.connected) return ['Nothing is connected.'];
    if (st.google.connected || st.google.needsReconnect) await cal.disconnectGoogle(uid);
    if (st.feed) await cal.removeFeed(uid);
    return ['Done. The link no longer works and the *Nudge* calendar was removed from Google. Your tasks in Nudge are untouched.'];
  }

  const st = await cal.status(uid);
  const g = st.google;
  return [[
    '📅 *Calendar sync*',
    'Tasks with a time ("gym 6pm") can show up in your calendar.',
    '',
    `• */sync link*: a private link for Apple, Google or Outlook ${st.feed ? '✅ on' : '(not set up)'}`,
    `• */sync google*: its own *Nudge* calendar in Google, updated every few minutes ${g.connected ? `✅ connected${g.email ? ` (${g.email})` : ''}` : g.needsReconnect ? '⚠️ lost access, send it again' : '(not connected)'}`,
    ...(g.connected && g.error ? [`⚠️ ${g.error}`] : []),
    '',
    st.feed || g.connected ? '*/sync now* updates Google right away, */sync off* turns it all off.' : 'The app has the same under *Me → Calendar*.',
  ].join('\n')];
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
    const btns: WaButton[] = [];
    if (ctx.doneAlready && !ctx.undos.some((u) => u.k === 'complete')) btns.push({ id: BUTTON_IDS.done(ctx.doneAlready), title: 'Done already ✅' });
    btns.push({ id: BUTTON_IDS.undo(id), title: ctx.t('btnUndo') });
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

/** "16:00" + 45 -> "16:45" (wraps past midnight). */
function addMinutes(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (h * 60 + m + min) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
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
        durationMin: (() => { const d = num(o.duration_min); return d && d > 0 && d <= 1440 ? Math.round(d) : undefined; })(),
        ...reminderFor(ctx, o, when, due),
        alreadyDone: o.already_done === true && !str(o.recurrence),
        parked: o.someday === true && !str(o.recurrence) && o.already_done !== true,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, 15);
  if (!items.length) return [];
  const created = await ctx.d.addTasks(ctx.uid, items.map(({ text, when, dueDate, recurrenceText, remindAt, remindFor, parked }) => ({ text, when, dueDate, recurrenceText, remindAt, remindFor, parked })));
  ctx.rememberTasks(created);
  // "I already called mom": the task is logged and ticked in one go (the two-minute rule), so the day's streak counts it.
  const finished = created.filter((_, i) => items[i]?.alreadyDone);
  const parkedNew = created.filter((_, i) => items[i]?.parked);
  const pending = created.filter((_, i) => !items[i]?.alreadyDone && !items[i]?.parked);
  const lines = pending.length ? [pending.length === 1 ? ctx.t('addedOne') : ctx.t('addedMany', { n: pending.length })] : [];
  for (const t of pending) {
    const forToday = !t.deferredTo || t.deferredTo.slice(0, 10) === ctx.today;
    if (forToday && !ctx.session.lastList.includes(t.id)) ctx.session.lastList.push(t.id);
    const n = ctx.session.lastList.indexOf(t.id) + 1;
    const w = whenLabel(t.deferredTo, ctx.today, ctx.lang);
    const due = t.dueDate ? ctx.t('dueOn', { when: whenLabel(new Date(t.dueDate).toLocaleDateString('en-CA', { timeZone: ctx.tz }), ctx.today, ctx.lang) || ctx.t('today') }) : '';
    const rem = t.remindAt ? ` · ⏰ ${time12(ctx.d.localTime(ctx.tz, t.remindAt))}` : '';
    const span = t.durationMin && t.deferredTo?.includes('T') ? `–${time12(addMinutes(t.deferredTo.split('T')[1], t.durationMin))}` : '';
    lines.push(`${n > 0 ? n + '.' : '•'} ${t.text}${w ? ` (${w}${span})` : ''}${due}${rem}`);
  }
  for (const t of parkedNew) lines.push(`💤 Parked: ${t.text} (find it with *someday*)`);
  if (finished.length) lines.push(...await completeByIds(ctx, finished.map((t) => t.id)));
  ctx.undos.push({ k: 'add', ids: created.map((t) => t.id), label: `added ${created.length === 1 ? clip(created[0].text, 30) : created.length + ' tasks'}` });
  // Two-minute rule: one plain task for today gets a "Done already" tap (a timed or recurring one is not "already").
  const only = created.length === 1 && pending.length === 1 ? pending[0] : null; // a parked or finished task gets no tap
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
    await ctx.text(done ? ctx.t('todayEmptyDone', { done }) : ctx.t('todayEmpty'));
    return;
  }
  const shown = open.slice(0, MAX_LIST);
  ctx.session.lastList = shown.map((t) => t.id);
  const head = done ? ctx.t('todayHeadDone', { open: open.length, done }) : ctx.t('todayHead', { open: open.length });
  const line = (t: Task, i: number) => (isFocus(t) ? taskLine(i + 1, t, ctx.today, ctx.lang).replace(/^(\d+\.) /, '$1 ⭐ ') : taskLine(i + 1, t, ctx.today, ctx.lang));
  const body = [head, ...shown.map((t, i) => line(t, i)), open.length > shown.length ? ctx.t('moreAsk', { n: open.length - shown.length }) : ''].filter(Boolean).join('\n');
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

/**
 * The three taps on a task. Default: Done / Tomorrow / Someday. `review` (a stale task, the Sunday list): Done / Someday /
 * Drop it, because postponing a task that has already sat for a week only kicks the can. `parked`: Do it today / Done / Delete.
 * Delete is always one text away (*delete 2*).
 */
export function taskButtons(id: string, lang: Lang = 'en', variant: 'default' | 'review' | 'parked' = 'default'): WaButton[] {
  if (variant === 'parked') {
    return [
      { id: BUTTON_IDS.unpark(id), title: 'Do it today' },
      { id: BUTTON_IDS.done(id), title: tr(lang, 'btnDone') },
      { id: BUTTON_IDS.del(id), title: tr(lang, 'btnDelete') },
    ];
  }
  if (variant === 'review') {
    return [
      { id: BUTTON_IDS.done(id), title: tr(lang, 'btnDone') },
      { id: BUTTON_IDS.park(id), title: 'Someday 💤' },
      { id: BUTTON_IDS.del(id), title: 'Drop it 🗑' },
    ];
  }
  return [
    { id: BUTTON_IDS.done(id), title: tr(lang, 'btnDone') },
    { id: BUTTON_IDS.tomorrow(id), title: tr(lang, 'btnTomorrow') },
    { id: BUTTON_IDS.park(id), title: 'Someday 💤' },
  ];
}

export async function openTask(ctx: Ctx, id: string, fromReview = false): Promise<void> {
  await ctx.loadKnown();
  const t = ctx.known.get(id);
  if (!t || t.deleted) { await ctx.text(ctx.t('taskGone')); return; }
  const w = whenLabel(t.deferredTo, ctx.today, ctx.lang);
  const variant = t.parkedAt ? 'parked' : fromReview ? 'review' : 'default';
  await ctx.buttons(`${t.parkedAt ? '💤 ' : ''}*${clip(t.text, 200)}*${w && !t.parkedAt ? `\n${w}` : ''}`, taskButtons(id, ctx.lang, variant));
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

// ---------- Someday/Maybe: tasks you want to keep but not nag yourself with ----------

const PARK_UNAVAILABLE = ['⚠️ Parking tasks is not available right now.'];

export async function parkByIds(ctx: Ctx, ids: string[], errs: string[] = []): Promise<string[]> {
  if (!ctx.d.parkTask) return PARK_UNAVAILABLE;
  const lines: string[] = [];
  let n = 0;
  for (const id of [...new Set(ids)]) {
    try {
      const before = await ctx.d.parkTask(ctx.uid, id);
      ctx.undos.push({ k: 'park', id, deferredTo: before.deferredTo, label: `parked ${clip(before.text, 30)}` });
      lines.push(`💤 Parked: ${before.text}`);
      n++;
    } catch (e) {
      const m = String((e as Error).message);
      lines.push(m === 'recurring' ? '⚠️ A repeating task cannot be parked.' : m === 'completed' ? '⚠️ That one is already done.' : '⚠️ Could not park that task.');
    }
  }
  if (n) lines.push('Find parked tasks any time with *someday*.');
  return [...lines, ...errs];
}

export async function parkByRef(ctx: Ctx, ref: string): Promise<string[]> {
  const r = await resolveRef(ctx, ref);
  return 'err' in r ? [r.err] : parkByIds(ctx, [r.id]);
}

export async function unparkById(ctx: Ctx, id: string): Promise<string[]> {
  if (!ctx.d.unparkTask) return PARK_UNAVAILABLE;
  try {
    const t = await ctx.d.unparkTask(ctx.uid, id);
    ctx.undos.push({ k: 'unpark', id, label: `picked up ${clip(t.text, 30)}` });
    return [`📌 On today's list: ${t.text}`];
  } catch (e) {
    console.error('[bot] unpark failed', id, e);
    return ['⚠️ Could not pick that one up.'];
  }
}

/** The yearly question's "keep it": the question was stamped when it was sent, so there is nothing more to write. */
export async function keepParked(ctx: Ctx, id: string): Promise<void> {
  try { await ctx.d.markParkedAsked?.(ctx.uid, id, ctx.d.now()); } catch { /* the stamp from sending the question stands */ }
  await ctx.text('Okay, it stays parked. I will ask again in a year.');
}

export async function addParked(ctx: Ctx, text: string): Promise<void> {
  const lines = await addItems(ctx, [{ text, someday: true }]);
  await flush(ctx, lines.length ? lines : [TASK_USAGE]);
}

/** "someday": parked tasks, newest first, one tap each. */
export async function somedayList(ctx: Ctx): Promise<void> {
  const parked = (await ctx.d.listParked?.(ctx.uid, 30)) ?? [];
  ctx.rememberTasks(parked);
  if (!parked.length) {
    await ctx.text('Nothing parked yet. Send *someday learn guitar* to keep an idea for later, or tap *Someday* on any task.');
    return;
  }
  const shown = parked.slice(0, MAX_LIST);
  ctx.session.lastList = shown.map((t) => t.id);
  const body = [`💤 *Someday* · ${parked.length} parked`, ...shown.map((t, i) => `${i + 1}. ${t.text}`), parked.length > shown.length ? `+${parked.length - shown.length} more` : '', 'Tap one to do it today, or send *bored* for three ideas.']
    .filter(Boolean).join('\n');
  await ctx.list(body, 'Pick one', shown.map((t, i) => ({ id: BUTTON_IDS.task(t.id), title: clip(`${i + 1}. ${t.text}`, 24) })));
}

/** Three parked tasks to try, the shortest (smallest) ones first, rotated by day so it is not always the same three. */
export function pickSomeday(parked: Task[], dayKey: string, n = 3): Task[] {
  const small = [...parked].sort((a, b) => a.text.length - b.text.length).slice(0, Math.max(n * 2, n));
  let h = 0;
  for (const c of dayKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const start = small.length ? h % small.length : 0;
  return [...small.slice(start), ...small.slice(0, start)].slice(0, n);
}

export async function somedayPick(ctx: Ctx): Promise<void> {
  const parked = (await ctx.d.listParked?.(ctx.uid, 100)) ?? [];
  if (!parked.length) { await ctx.text('Nothing parked yet, so nothing to suggest. Send *someday learn guitar* to keep an idea for later.'); return; }
  const picks = pickSomeday(parked, ctx.today);
  ctx.rememberTasks(picks);
  ctx.session.lastList = picks.map((t) => t.id);
  await ctx.list(
    ['Got a few minutes? Here are some ideas you parked:', ...picks.map((t, i) => `${i + 1}. ${t.text}`)].join('\n'),
    'Pick one',
    picks.map((t, i) => ({ id: BUTTON_IDS.task(t.id), title: clip(`${i + 1}. ${t.text}`, 24) })),
  );
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
      else if (u.k === 'rename') await ctx.d.renameTask?.(ctx.uid, u.id, u.old);
      else if (u.k === 'park') await ctx.d.unparkTask?.(ctx.uid, u.id, { deferredTo: u.deferredTo ?? null });
      else if (u.k === 'unpark') await ctx.d.parkTask?.(ctx.uid, u.id);
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
