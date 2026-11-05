// Fast paths: button/list ids and exact text commands. No model involved.
import type { InboundMessage } from '@/lib/wa/types';

export type Fast =
  | { t: 'today' }
  | { t: 'addTask'; text: string }
  | { t: 'files' }
  | { t: 'calendar'; view: 'month' | 'week'; offset: number }
  | { t: 'unknownCmd'; cmd: string }
  | { t: 'done' | 'delete' | 'tomorrow'; nums: number[] }
  | { t: 'undo'; id?: string }
  | { t: 'mute' | 'unmute' | 'help' | 'week' | 'friends' | 'checkinStart' | 'checkinSkip' | 'coachMenu' }
  | { t: 'setCoach'; id: string }
  | { t: 'meme'; format?: 'meme' | 'gif' | 'sticker' }
  | { t: 'memesOn' | 'memesOff' }
  | { t: 'doneId' | 'tmrwId' | 'delId' | 'taskOpen' | 'focus'; id: string }
  | { t: 'react'; taskId: string; emoji: string }
  | { t: 'nudge'; uid: string }
  | { t: 'setTime'; time: string }
  | { t: 'confirm' | 'cancel'; id: string }
  | { t: 'invite'; id: string; accept: boolean };

/** "1,3", "1 and 3", "1-3", "#2" -> [1,3]. null if the text holds anything else. */
export function parseNumbers(s: string): number[] | null {
  const t = s.toLowerCase().replace(/\b(and|&)\b/g, ',').replace(/#/g, '');
  if (!/^[\d\s,+-]+$/.test(t) || !/\d/.test(t)) return null;
  const out: number[] = [];
  for (const part of t.split(/[\s,+]+/).filter(Boolean)) {
    const r = /^(\d+)-(\d+)$/.exec(part);
    if (r) {
      const a = +r[1], b = +r[2];
      if (a > b || b - a > 20) return null;
      for (let i = a; i <= b; i++) out.push(i);
    } else if (/^\d+$/.test(part)) out.push(+part);
    else return null;
  }
  return out.length && out.length <= 20 ? [...new Set(out)] : null;
}

function fromReply(id: string): Fast | null {
  const i = id.indexOf(':');
  if (i < 0) return null;
  const kind = id.slice(0, i);
  const rest = id.slice(i + 1);
  if (!rest) return null;
  switch (kind) {
    case 'done': return { t: 'doneId', id: rest };
    case 'tmrw': return { t: 'tmrwId', id: rest };
    case 'del': return { t: 'delId', id: rest };
    case 'undo': return { t: 'undo', id: rest };
    case 'task': return { t: 'taskOpen', id: rest };
    case 'cal': { // cal:month:0 / cal:week:-1 (offset from the current month / week)
      const m = /^(month|week):(-?\d{1,3})$/.exec(rest);
      return m ? { t: 'calendar', view: m[1] as 'month' | 'week', offset: Math.max(-24, Math.min(24, +m[2])) } : null;
    }
    case 'focus': return { t: 'focus', id: rest };
    case 'nudge': return { t: 'nudge', uid: rest };
    case 'confirm': return { t: 'confirm', id: rest };
    case 'coach': return { t: 'setCoach', id: rest };
    case 'cancel': return { t: 'cancel', id: rest };
    case 'react': {
      const j = rest.indexOf(':');
      if (j < 1 || j === rest.length - 1) return null;
      return { t: 'react', taskId: rest.slice(0, j), emoji: rest.slice(j + 1) };
    }
    case 'invite': { // invite:accept:<id> / invite:decline:<id> (lib/server/social.ts inviteFriend)
      const m = /^(accept|decline):(.+)$/.exec(rest);
      return m ? { t: 'invite', id: m[2], accept: m[1] === 'accept' } : null;
    }
    case 'checkin':
      return rest === 'start' ? { t: 'checkinStart' } : rest === 'skip' ? { t: 'checkinSkip' } : null;
    case 'settime': {
      const m = /^(\d{2}):(\d{2})$/.exec(rest);
      return m && +m[1] < 24 && +m[2] < 60 ? { t: 'setTime', time: rest } : null;
    }
    default: return null;
  }
}

/** Commands that take the rest of the line as written (not lower-cased). */
const ADD_CMDS = new Set(['task', 'add']);
const FILE_CMDS = new Set(['files', 'vault']);
const CAL_CMDS = new Set(['calendar', 'cal', 'month', 'agenda', 'schedule']);

/** "calendar", "cal week", "month next", "agenda", "calendar last month"... null = not a calendar request. */
export function parseCalendar(cmd: string, arg: string): Fast | null {
  const a = arg.toLowerCase().replace(/[.!]+$/g, '').trim();
  const off = /(next|following)/.test(a) ? 1 : /(prev|previous|last|before)/.test(a) ? -1 : 0;
  if (a && !/^((this|next|last|prev|previous|following)\s*)?(week|month)?$/.test(a)) return null;
  const view: 'month' | 'week' = /week/.test(a) ? 'week' : /month/.test(a) ? 'month' : cmd === 'agenda' ? 'week' : 'month';
  return { t: 'calendar', view, offset: off };
}
/** "/done 2" and friends: a leading slash on a bare-word command just runs that command. */
const BARE_CMDS = new Set(['today', 'list', 'tasks', 'todo', 'done', 'did', 'finished', 'complete', 'completed', 'del', 'delete', 'remove',
  'tmrw', 'tomorrow', 'undo', 'stop', 'start', 'help', 'menu', 'week', 'friends']);

/**
 * Slash commands (WhatsApp has no native slash menu, so these are typed). null = not a slash command (text starts with
 * anything but "/" and a letter). `{ rest }` = a bare-word command with the slash removed, parsed by the normal rules.
 * `{ fast }` = decided here. Every "/word" is handled without Gemini: unknown ones get a short hint.
 */
export function parseSlash(text: string): { rest: string } | { fast: Fast } | null {
  const m = /^\s*\/([A-Za-z]+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const arg = (m[2] ?? '').trim();
  if (ADD_CMDS.has(cmd)) return { fast: { t: 'addTask', text: arg } };
  if (FILE_CMDS.has(cmd)) return { fast: { t: 'files' } };
  if (CAL_CMDS.has(cmd)) return { fast: parseCalendar(cmd, arg) ?? { t: 'calendar', view: 'month', offset: 0 } };
  if (BARE_CMDS.has(cmd)) return { rest: arg ? `${cmd} ${arg}` : cmd };
  return { fast: { t: 'unknownCmd', cmd } };
}

export function parseFast(msg: InboundMessage): Fast | null {
  if (msg.reply) return fromReply(msg.reply.id);
  if (msg.type !== 'text' || !msg.text) return null;
  const slash = parseSlash(msg.text);
  if (slash && 'fast' in slash) return slash.fast;
  const t = (slash ? slash.rest : msg.text).trim().toLowerCase().replace(/[.!]+$/g, '').trim();
  if (/^(today|list|tasks|my tasks|todo|to do|show tasks)$/.test(t)) return { t: 'today' };
  if (t === 'undo') return { t: 'undo' };
  if (t === 'stop') return { t: 'mute' };
  if (t === 'start') return { t: 'unmute' };
  if (/^(help|menu|\?)$/.test(t)) return { t: 'help' };
  if (t === 'week') return { t: 'week' };
  const cal = /^(?:show |open |see |my )?(calendar|cal|agenda|schedule|month)(?: view)?(?:\s+(.+))?$/.exec(t) ?? /^(week|next week|this week)\s+(?:calendar|agenda|schedule)$/.exec(t);
  if (cal) return cal[2] === undefined && /^(week|next week|this week)$/.test(cal[1]) ? parseCalendar('calendar', cal[1]) : parseCalendar(cal[1], cal[2] ?? '');
  if (t === 'friends') return { t: 'friends' };
  if (/^(coach|coaches|change coach|switch coach|personality)$/.test(t)) return { t: 'coachMenu' };
  if (/^(memes? off|no memes?|stop memes?)$/.test(t)) return { t: 'memesOff' };
  if (/^(memes? on|start memes?)$/.test(t)) return { t: 'memesOn' };
  if (/^(meme|memes|send (a |me a )?meme)$/.test(t)) return { t: 'meme', format: 'meme' };
  if (/^(gif|send (a |me a )?gif)$/.test(t)) return { t: 'meme', format: 'gif' };
  if (/^(sticker|send (a |me a )?sticker)$/.test(t)) return { t: 'meme', format: 'sticker' };
  const m = /^(done|did|finished|complete|completed|del|delete|remove|tmrw|tomorrow)\s+(.+)$/.exec(t);
  if (m) {
    const nums = parseNumbers(m[2]);
    if (nums) {
      const k = m[1];
      const kind = ['done', 'did', 'finished', 'complete', 'completed'].includes(k) ? 'done'
        : ['del', 'delete', 'remove'].includes(k) ? 'delete' : 'tomorrow';
      return { t: kind, nums };
    }
  }
  return null;
}
