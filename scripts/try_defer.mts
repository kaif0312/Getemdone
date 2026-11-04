// Live check: does Gemini move a task only when asked? Real Gemini, fake Firestore, no sends.
// Run: GEMINI_API_KEY=... npx tsx scripts/try_defer.mts [rounds]
process.env.NUDGE_WA_DRY_RUN = '1';
import { handleWith } from '../lib/bot/core';
import { callGemini } from '../lib/bot/gemini';
import type { InboundMessage } from '../lib/wa/types';
import { makeFake, mkTask } from './tests/fakes';

const NO = ["honestly too tired for the gym today", "skipping the gym today, I'm too tired", "can't be bothered with the deck",
  'not feeling the gym today', "ugh I don't want to call mom today"];
const YES = ['move gym to tomorrow', 'push the deck to friday', "I'll do the gym tomorrow instead"];
const rounds = Number(process.argv[2] || 2);
let n = 0, bad = 0;
for (const coach of ['drill', 'buddy']) {
  for (const [msgs, want] of [[NO, false], [YES, true]] as const) {
    for (const t of msgs) {
      for (let r = 0; r < rounds; r++) {
        const f = makeFake({ tasks: [mkTask('t1', 'gym'), mkTask('t2', 'finish deck'), mkTask('t3', 'call mom')], gemini: (req) => callGemini(req) });
        await f.deps.updateLink('9100', { coach });
        const msg: InboundMessage = { id: 'd' + ++n, from: '9100', timestamp: 2000 + n, type: 'text', text: t };
        await handleWith(f.deps, msg);
        const deferred = f.calls.some((c) => c.startsWith('defer'));
        if (deferred !== want) bad++;
        console.log(`${deferred === want ? 'ok ' : 'BAD'} ${coach} "${t}" -> ${deferred ? 'moved' : 'kept'} | ${(f.sent.at(-1)?.body ?? '').replace(/\n/g, ' / ').slice(0, 110)}`);
      }
    }
  }
}
console.log(bad ? `\n${bad} wrong` : '\nALL OK');
