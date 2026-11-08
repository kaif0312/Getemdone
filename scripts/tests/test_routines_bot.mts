// Bot side of routines (lib/bot/routines.ts): taps, a bare "done", /routines, the model's add_routine tool.
// No emulator needed: the routines domain is a fake.   npx tsx scripts/tests/test_routines_bot.mts
import assert from 'node:assert/strict';
import { handleWith } from '../../lib/bot/core';
import { parseFast } from '../../lib/bot/fastpath';
import type { InboundMessage } from '../../lib/wa/types';
import type { GeminiResult } from '../../lib/bot/types';
import type { RoutineBotDeps } from '../../lib/bot/routines';
import { makeFake } from './fakes';

let n = 0;
const text = (t: string): InboundMessage => ({ id: 'w' + ++n, from: '9100', timestamp: Date.parse('2026-11-01T08:30:00Z'), type: 'text', text: t });
const tap = (id: string): InboundMessage => ({ id: 'w' + ++n, from: '9100', timestamp: Date.parse('2026-11-01T08:30:00Z'), type: 'interactive', reply: { id, title: 'x' } });
const gem = (calls: GeminiResult['calls']): GeminiResult => ({ calls, text: '' });

// parsing
assert.deepEqual(parseFast(tap('rt:done:r1_2026-11-01')), { t: 'routineTap', id: 'r1_2026-11-01', status: 'done' });
assert.deepEqual(parseFast(tap('rt:skip:r1_2026-11-01')), { t: 'routineTap', id: 'r1_2026-11-01', status: 'skipped' });
assert.equal(parseFast(tap('rt:nope:x')), null);
assert.deepEqual(parseFast(text('routines')), { t: 'routines' });
assert.deepEqual(parseFast(text('/routines')), { t: 'routines' });

function fakeRoutines(open: { id: string } | null = { id: 'r1_2026-11-01' }) {
  const calls: string[] = [];
  const r: RoutineBotDeps = {
    setLogStatus: async (id, uid, status) => { calls.push(`set ${id} ${uid} ${status}`); return id.startsWith('r1_') ? { ok: true, title: 'Take isabgol', already: false, streak: status === 'done' ? 4 : 0 } : { ok: false }; },
    openLogFor: async () => (open ? ({ id: open.id } as never) : null),
    upsertRoutine: async (uid, a) => { calls.push(`upsert ${uid} ${JSON.stringify(a)}`); return { ok: true, created: true, routine: { id: 'r9', uid, title: a.title, time: '22:00', days: [], active: true, createdAt: 1 } }; },
    updateRoutine: async () => ({ ok: false, reason: 'not_found', names: [] }),
    removeRoutine: async () => ({ ok: false, reason: 'not_found', names: [] }),
    statusLines: async () => ['*Take isabgol* · 10:00 PM · every day\ndone ✅ · 🔥 4'],
  };
  return { r, calls };
}

// Done tap
{
  const f = makeFake();
  const { r, calls } = fakeRoutines();
  f.deps.routines = r;
  await handleWith(f.deps, tap('rt:done:r1_2026-11-01'));
  assert.deepEqual(calls, ['set r1_2026-11-01 u1 done']);
  assert.match(f.sent.at(-1)!.body, /Take isabgol.*done/);
  assert.match(f.sent.at(-1)!.body, /4 days in a row/);
}
// Skip tap
{
  const f = makeFake();
  const { r } = fakeRoutines();
  f.deps.routines = r;
  await handleWith(f.deps, tap('rt:skip:r1_2026-11-01'));
  assert.match(f.sent.at(-1)!.body, /skipped/i);
}
// Unknown log id
{
  const f = makeFake();
  const { r } = fakeRoutines();
  f.deps.routines = r;
  await handleWith(f.deps, tap('rt:done:zzz'));
  assert.match(f.sent.at(-1)!.body, /could not find/);
}
// Bare "done" with a routine waiting answers the routine, no model call and no task completion
{
  const f = makeFake();
  const { r, calls } = fakeRoutines();
  f.deps.routines = r;
  const learned: { path: string }[] = [];
  f.deps.logLearning = async (e) => { learned.push(e); };
  await handleWith(f.deps, text('done'));
  assert.deepEqual(calls, ['set r1_2026-11-01 u1 done']);
  assert.equal(f.geminiReqs.length, 0);
  // like every fast path: the turn is saved in the session and logged for learning
  const turns = f.getSession().turns;
  assert.equal(turns[0].text, 'done');
  assert.match(turns[1].text, /Take isabgol.*done/);
  assert.equal(learned.at(-1)?.path, 'fast:routineDone');
}
// Bare "done" with nothing waiting falls through to the normal flow (the model here)
{
  const f = makeFake({ gemini: async () => gem([{ name: 'reply', args: { text: 'ok' } }]) });
  const { r, calls } = fakeRoutines(null);
  f.deps.routines = r;
  await handleWith(f.deps, text('done'));
  assert.deepEqual(calls, []);
  assert.equal(f.geminiReqs.length, 1);
}
// /routines
{
  const f = makeFake();
  const { r } = fakeRoutines();
  f.deps.routines = r;
  await handleWith(f.deps, text('/routines'));
  assert.match(f.sent.at(-1)!.body, /Your routines/);
  assert.match(f.sent.at(-1)!.body, /Take isabgol/);
}
// The model sets one up from "remind me to take isabgol every night at 10"
{
  const f = makeFake({ gemini: async () => gem([{ name: 'add_routine', args: { title: 'Take isabgol', time: '22:00' } }]) });
  const { r, calls } = fakeRoutines();
  f.deps.routines = r;
  await handleWith(f.deps, text('remind me to take isabgol every night at 10'));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /upsert u1 .*Take isabgol.*22:00/);
  assert.match(f.sent.map((s) => s.body).join('\n'), /Routine added.*Take isabgol.*10:00 PM every day/);
}
// Without the routines dependency nothing crashes
{
  const f = makeFake();
  await handleWith(f.deps, tap('rt:done:x'));
  assert.match(f.sent.at(-1)!.body, /not available/);
}
console.log('routines bot: all passed');
