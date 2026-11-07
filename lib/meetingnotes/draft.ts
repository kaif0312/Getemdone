// Pure parts of the meeting-notes feature: draft shape, validation of model output (the notes are UNTRUSTED), the WhatsApp
// message, the owner's commands, and which items a "go" applies. No IO.
import { parseNumbers } from '@/lib/bot/fastpath';

export const MAX_TASKS = 25;
export const MAX_EVENTS = 5;
export const TAG_MINE = '🎬';
export const TAG_WAITING = '⏳';

export interface DraftTask { text: string; owner: 'me' | 'other'; ownerName?: string; /** YYYY-MM-DD, only if the notes state it */ due?: string }
export interface DraftEvent { title: string; /** YYYY-MM-DD */ date: string; /** HH:mm, missing = all day */ time?: string; notes?: string }
export interface Draft { meeting: string; date?: string; tasks: DraftTask[]; events: DraftEvent[] }

const clean = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';

/** A real calendar date in YYYY-MM-DD, else undefined. */
export function isoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] && +m[1] >= 2020 && +m[1] <= 2100
    ? `${m[1]}-${m[2]}-${m[3]}` : undefined;
}

function isoTime(v: unknown): string | undefined {
  const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
  return m && +m[1] < 24 && +m[2] < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

/** Clamp whatever the model returned into a safe Draft. Never throws; unknown or oversize parts are dropped. */
export function sanitizeDraft(raw: unknown, fallbackMeeting = 'Meeting'): Draft {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tasks: DraftTask[] = [];
  const seen = new Set<string>();
  for (const t of Array.isArray(o.tasks) ? o.tasks : []) {
    const r = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
    const text = clean(r.text, 300);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    const owner = r.owner === 'other' ? 'other' : 'me';
    const ownerName = clean(r.ownerName, 60);
    const due = isoDate(r.due);
    tasks.push({ text, owner, ...(owner === 'other' && ownerName ? { ownerName } : {}), ...(due ? { due } : {}) });
    if (tasks.length >= MAX_TASKS) break;
  }
  tasks.sort((a, b) => (a.owner === b.owner ? 0 : a.owner === 'me' ? -1 : 1)); // stable: his tasks first
  const events: DraftEvent[] = [];
  for (const e of Array.isArray(o.events) ? o.events : []) {
    const r = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const title = clean(r.title, 150);
    const date = isoDate(r.date);
    if (!title || !date) continue;
    const time = isoTime(r.time);
    const notes = clean(r.notes, 600);
    events.push({ title, date, ...(time ? { time } : {}), ...(notes ? { notes } : {}) });
    if (events.length >= MAX_EVENTS) break;
  }
  const date = isoDate(o.date);
  return { meeting: clean(o.meeting, 120) || clean(fallbackMeeting, 120) || 'Meeting', ...(date ? { date } : {}), tasks, events };
}

/** The text a task gets in Nudge. Other people's tasks are prefixed so they read as "waiting". */
export function taskText(t: DraftTask): string {
  return t.owner === 'other' ? `Waiting on ${t.ownerName || 'someone'}: ${t.text}`.slice(0, 400) : t.text;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dateLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return `${WEEKDAY[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
}
function time12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Items in the order the owner sees them: his tasks, others' tasks, then events. Numbers are 1-based and continuous. */
export function numbered(d: Draft): ({ kind: 'task'; i: number; t: DraftTask } | { kind: 'event'; i: number; e: DraftEvent })[] {
  return [
    ...d.tasks.map((t, i) => ({ kind: 'task' as const, i, t })),
    ...d.events.map((e, i) => ({ kind: 'event' as const, i, e })),
  ];
}

export const HOWTO = [
  'Reply:',
  '*go* creates everything',
  '*go 1 2 5* only those',
  '*drop 3* removes one',
  '*skip* discards the lot',
  'or tell me a change, like "make 2 due Friday"',
].join('\n');

export function formatDraft(d: Draft, opts: { lead?: string } = {}): string {
  const lines: string[] = [];
  lines.push(opts.lead ?? '📝 *Meeting follow-ups*', `_${d.meeting}_`);
  const items = numbered(d);
  let n = 0;
  const mine = d.tasks.filter((t) => t.owner === 'me');
  const others = d.tasks.filter((t) => t.owner === 'other');
  if (mine.length) {
    lines.push('', '*Your tasks*');
    for (const t of mine) lines.push(`${++n}. ${t.text}${t.due ? ` (due ${dateLabel(t.due)})` : ''}`);
  }
  if (others.length) {
    lines.push('', '*Waiting on others*');
    for (const t of others) lines.push(`${++n}. ${taskText(t)}${t.due ? ` (due ${dateLabel(t.due)})` : ''}`);
  }
  if (d.events.length) {
    lines.push('', '*Events*');
    for (const e of d.events) lines.push(`${++n}. ${e.title}, ${dateLabel(e.date)}${e.time ? ` ${time12(e.time)}` : ' (all day)'}`);
  }
  if (!items.length) lines.push('', 'Nothing left on this draft.');
  lines.push('', HOWTO);
  return lines.join('\n').slice(0, 4000);
}

export type OwnerCommand =
  | { t: 'notes' }
  | { t: 'go'; nums?: number[] }
  | { t: 'drop'; nums: number[] }
  | { t: 'skip' }
  | { t: 'edit'; text: string };

/** The owner's replies. `notes` always works; the rest only while a draft is waiting (`active`), so normal chat is left
 *  alone. A free-text edit must start with an edit verb AND mention a number, so "make coffee" is not swallowed. */
export function parseOwnerCommand(text: string | undefined, active: boolean): OwnerCommand | null {
  const s = (text ?? '').trim().replace(/^\//, '').replace(/[.!]+$/, '').trim();
  if (!s || s.length > 300) return null;
  if (/^notes$/i.test(s)) return { t: 'notes' };
  if (!active) return null;
  const m = /^(go|yes|confirm|drop|remove)\b\s*(.*)$/i.exec(s);
  if (m) {
    const verb = m[1].toLowerCase();
    const rest = m[2].trim();
    if (verb === 'go' || verb === 'yes' || verb === 'confirm') {
      if (!rest || /^(all|everything)$/i.test(rest)) return { t: 'go' };
      const nums = parseNumbers(rest);
      return nums ? { t: 'go', nums } : null; // "go to the gym" is chat, not a command
    }
    const nums = parseNumbers(rest);
    return nums ? { t: 'drop', nums } : null;
  }
  if (/^(skip|discard|reject|cancel notes)$/i.test(s)) return { t: 'skip' };
  if (/^(edit|make|change|rename|reword|move|set|merge|update)\b/i.test(s) && /\d/.test(s)) {
    return { t: 'edit', text: s.replace(/^edit\s+/i, '') };
  }
  return null;
}

export interface Plan { tasks: DraftTask[]; events: DraftEvent[]; restTasks: DraftTask[]; restEvents: DraftEvent[]; bad: number[] }

/** Which items a "go" applies. nums undefined = all. Numbers outside the list are reported in `bad`. */
export function planApply(d: Draft, nums?: number[]): Plan {
  const items = numbered(d);
  const pick = nums ? new Set(nums.filter((n) => n >= 1 && n <= items.length)) : new Set(items.map((_, i) => i + 1));
  const bad = (nums ?? []).filter((n) => n < 1 || n > items.length);
  const p: Plan = { tasks: [], events: [], restTasks: [], restEvents: [], bad };
  items.forEach((it, idx) => {
    const sel = pick.has(idx + 1);
    if (it.kind === 'task') (sel ? p.tasks : p.restTasks).push(it.t);
    else (sel ? p.events : p.restEvents).push(it.e);
  });
  return p;
}

/** Remove numbered items; returns the draft and how many numbers matched. */
export function dropItems(d: Draft, nums: number[]): { draft: Draft; removed: number } {
  const p = planApply(d, nums);
  return { draft: { ...d, tasks: p.restTasks, events: p.restEvents }, removed: p.tasks.length + p.events.length };
}
