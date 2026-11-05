// In-memory fake BotDeps shared by test_brain.mts and try_brain.mts.
import type { BotDeps, GeminiResult, VaultItem } from '../../lib/bot/types';
import type { Task } from '../../lib/types';
import type { WaLink, WaSession } from '../../lib/wa/types';

export interface Sent { kind: 'text' | 'buttons' | 'list'; to: string; body: string; buttons?: { id: string; title: string }[]; rows?: { id: string; title: string }[] }

export function mkTask(id: string, text: string, extra: Partial<Task> = {}): Task {
  return { id, userId: 'u1', text, isPrivate: false, completed: false, createdAt: 1, completedAt: null, ...extra } as Task;
}

export function makeFake(opts: { linked?: boolean; tasks?: Task[]; vault?: VaultItem[]; gemini?: (req: Parameters<BotDeps['gemini']>[0]) => Promise<GeminiResult> } = {}) {
  const calls: string[] = [];
  const sent: Sent[] = [];
  const tasks = new Map<string, Task>((opts.tasks ?? []).map((t) => [t.id, t]));
  let seq = 100;
  let link: WaLink | null = opts.linked === false ? null : {
    waId: '9100', uid: 'u1', linkedAt: 1, lastInboundAt: 0, timezone: 'Asia/Kolkata', checkinTime: null, recapTime: null, friendAlerts: true, muted: false,
  };
  let session: WaSession = { turns: [], lastList: [], updatedAt: 0 };
  const log = (s: string) => calls.push(s);
  const stickers: string[] = [];
  const geminiReqs: Parameters<BotDeps['gemini']>[0][] = [];
  const workouts: unknown[] = [];

  const deps: BotDeps = {
    now: () => Date.parse('2026-11-01T08:30:00Z'),
    gemini: async (req) => {
      geminiReqs.push(req);
      if (!opts.gemini) throw new Error('no gemini in this test');
      return opts.gemini(req);
    },
    getLink: async () => link,
    redeemLinkCode: async (waId, code) => {
      log(`redeem ${code}`);
      if (code !== 'ABC234') return { ok: false, reason: 'invalid' };
      link = { waId, uid: 'u1', linkedAt: 1, lastInboundAt: 0, timezone: 'Asia/Kolkata', checkinTime: null, recapTime: null, friendAlerts: true, muted: false };
      return { ok: true, link };
    },
    updateLink: async (_w, patch) => { log(`updateLink ${JSON.stringify(patch)}`); if (link) link = { ...link, ...patch }; },
    getSession: async () => session,
    saveSession: async (_w, s) => { session = JSON.parse(JSON.stringify(s)); },
    sendText: async (to, body) => { sent.push({ kind: 'text', to, body }); return 'w1'; },
    sendButtons: async (to, body, buttons) => { sent.push({ kind: 'buttons', to, body, buttons }); return 'w1'; },
    sendList: async (to, body, _l, rows) => { sent.push({ kind: 'list', to, body, rows }); return 'w1'; },
    sendSticker: async (_to, name) => { stickers.push(name); return 'w1'; },
    markRead: async () => undefined,
    fetchMedia: async (id) => { log(`fetchMedia ${id}`); return { data: Buffer.from('abc'), mimeType: 'audio/ogg; codecs=opus' }; },
    getUserLite: async () => ({ uid: 'u1', displayName: 'Kaif', friends: [], timezone: 'Asia/Kolkata' }),
    setProfile: async (_u, patch) => { log('setProfile ' + JSON.stringify(patch)); },
    localDate: () => '2026-11-01',
    localTime: () => '14:00',
    addTasks: async (_u, items) => items.map((it) => {
      const t = mkTask('n' + ++seq, it.text, { deferredTo: it.when, dueDate: it.dueDate ?? null });
      tasks.set(t.id, t);
      log(`addTasks ${JSON.stringify(it)}`);
      return t;
    }),
    listToday: async () => [...tasks.values()].filter((t) => !t.deleted && !t.parkedAt && (!t.deferredTo || t.deferredTo.slice(0, 10) <= '2026-11-01')),
    listOpen: async () => [...tasks.values()].filter((t) => !t.deleted && !t.completed),
    completeTask: async (_u, id) => { log(`complete ${id}`); const t = tasks.get(id)!; t.completed = true; return t; },
    uncompleteTask: async (_u, id) => { log(`uncomplete ${id}`); const t = tasks.get(id)!; t.completed = false; return t; },
    deferTask: async (_u, id, to) => { log(`defer ${id} ${to}`); const t = tasks.get(id)!; t.deferredTo = to; return t; },
    deleteTask: async (_u, id) => { log(`delete ${id}`); tasks.get(id)!.deleted = true; },
    restoreTask: async (_u, id) => { log(`restore ${id}`); tasks.get(id)!.deleted = false; },
    findTask: async (_u, q) => [...tasks.values()].find((t) => !t.completed && !t.deleted && t.text.toLowerCase().includes(q.toLowerCase())) ?? null,
    listVaultFiles: async (wa, n) => { log(`vaultFiles ${wa} ${n}`); return (opts.vault ?? []).slice(0, n); },
    setFocus: async (_u, ids) => {
      log(`focus ${ids.join(',')}`);
      for (const t of tasks.values()) t.focusDate = ids.includes(t.id) ? '2026-11-01' : null;
    },
    parkTask: async (_u, id) => {
      log(`park ${id}`);
      const t = tasks.get(id)!;
      if (t.recurrence) throw new Error('recurring');
      const before = { ...t };
      t.parkedAt = 5; t.focusDate = null;
      return before;
    },
    unparkTask: async (_u, id, o) => {
      log(`unpark ${id}${o && 'deferredTo' in o ? ' restore ' + o.deferredTo : ''}`);
      const t = tasks.get(id)!;
      t.parkedAt = null;
      t.deferredTo = o && 'deferredTo' in o ? (o.deferredTo ?? undefined) : '2026-11-01';
      return t;
    },
    listParked: async (_u, n = 50) => [...tasks.values()].filter((t) => !t.deleted && !t.completed && t.parkedAt).sort((a, b) => b.parkedAt! - a.parkedAt!).slice(0, n),
    markParkedAsked: async (_u, id) => { log(`parkedAsked ${id}`); },
    renameTask: async (_u, id, text) => { log(`rename ${id} ${text}`); const t = tasks.get(id)!; const old = t.text; t.text = text; return { task: t, old }; },
    daySummary: async () => ({ done: [], open: [], streak: 4, fitnessStreak: 0 }),
    logWorkout: async (_u, w) => { log(`logWorkout ${JSON.stringify(w)}`); workouts.push(w); return { date: '2026-11-01', workouts: [], updatedAt: 1 }; },
    logMetric: async (_u, m, v, date) => { log(`logMetric ${m} ${v} ${date ?? ''}`); return { date: '2026-11-01', workouts: [], updatedAt: 1 }; },
    setGoals: async (_u, g) => { log(`setGoals ${JSON.stringify(g)}`); return { visibility: 'friends', ...g }; },
    weekSummary: async () => ({ workouts: workouts.length, goal: 4, minutes: 28, distanceKm: 5, days: [] }),
    undoLastWorkout: async () => { log('undoLastWorkout'); workouts.pop(); },
    listFriends: async () => [],
    findFriend: async (_u, name) => (name.toLowerCase() === 'ali' ? { uid: 'f1', displayName: 'Ali', waLinked: true } : null),
    nudgeFriend: async (_u, f, m) => { log(`nudge ${f} ${m ?? ''}`); return { ok: true }; },
    answerInvite: async (_u, id, accept) => { log(`invite ${id} ${accept}`); },
    reactToTask: async (_u, id, e) => { log(`react ${id} ${e}`); },
    friendsActivity: async () => [{ uid: 'f1', displayName: 'Ali', doneToday: [{ taskId: 'ft1', text: 'Study' }], workoutsToday: ['ran 5k'], streak: 12 }],
  };
  return { deps, calls, sent, stickers, tasks, geminiReqs, getSession: () => session, getLink: () => link };
}
