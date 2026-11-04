// Fast paths: button/list ids and exact text commands. No model involved.
import type { InboundMessage } from '@/lib/wa/types';

export type Fast =
  | { t: 'today' }
  | { t: 'done' | 'delete' | 'tomorrow'; nums: number[] }
  | { t: 'undo'; id?: string }
  | { t: 'mute' | 'unmute' | 'help' | 'week' | 'friends' | 'checkinStart' | 'checkinSkip' }
  | { t: 'privacy' | 'forgetAsk' | 'forgetYes' | 'forgetNo' }
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
    case 'focus': return { t: 'focus', id: rest };
    case 'nudge': return { t: 'nudge', uid: rest };
    case 'confirm': return { t: 'confirm', id: rest };
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
    case 'forget':
      return rest === 'yes' ? { t: 'forgetYes' } : rest === 'no' ? { t: 'forgetNo' } : null;
    case 'checkin':
      return rest === 'start' ? { t: 'checkinStart' } : rest === 'skip' ? { t: 'checkinSkip' } : null;
    case 'settime': {
      const m = /^(\d{2}):(\d{2})$/.exec(rest);
      return m && +m[1] < 24 && +m[2] < 60 ? { t: 'setTime', time: rest } : null;
    }
    default: return null;
  }
}

export function parseFast(msg: InboundMessage): Fast | null {
  if (msg.reply) return fromReply(msg.reply.id);
  if (msg.type !== 'text' || !msg.text) return null;
  const t = msg.text.trim().toLowerCase().replace(/[.!]+$/g, '').trim();
  if (/^(today|list|tasks|my tasks|todo|to do|show tasks)$/.test(t)) return { t: 'today' };
  if (t === 'undo') return { t: 'undo' };
  if (t === 'stop') return { t: 'mute' };
  if (t === 'start') return { t: 'unmute' };
  if (/^(help|menu|\?)$/.test(t)) return { t: 'help' };
  if (t === 'week') return { t: 'week' };
  if (t === 'friends') return { t: 'friends' };
  if (/^(privacy|my data|what do you (keep|save|store))\??$/.test(t)) return { t: 'privacy' };
  if (/^((delete|erase|remove|wipe)( all)? (my )?(data|chats?|history|everything)|forget me)$/.test(t)) return { t: 'forgetAsk' };
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
