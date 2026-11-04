// Live Gemini: how each coach sounds on the same messages. Needs GEMINI_API_KEY; never sends WhatsApp or touches Firestore.
// Run: GEMINI_API_KEY=... npx tsx scripts/try_coaches.mts [coachId...]
process.env.NUDGE_WA_DRY_RUN = '1';
import { handleWith } from '../lib/bot/core';
import { callGemini } from '../lib/bot/gemini';
import { COACH_IDS } from '../lib/bot/coaches';
import { makeFake, mkTask } from './tests/fakes';

if (!process.env.GEMINI_API_KEY) { console.log('GEMINI_API_KEY not set: skipping.'); process.exit(0); }

const SAMPLES = [
  "skipping gym today, i'm tired",
  'ran 5k in 28 min',
  'push the deck to tomorrow',
  'my knee hurts after the run',
  'be like david goggins with me',
];
const ids = process.argv.slice(2).length ? process.argv.slice(2) : COACH_IDS;

for (const coach of ids) {
  console.log(`\n===== ${coach} =====`);
  for (const s of SAMPLES) {
    const f = makeFake({
      tasks: [mkTask('t1', 'gym', { deferredTo: '2026-11-01T18:00' }), mkTask('t2', 'finish deck')],
      gemini: (req) => callGemini(req),
    });
    await f.deps.updateLink('9100', { coach });
    await handleWith(f.deps, { id: 'x' + Math.random(), from: '9100', timestamp: Date.now(), type: 'text', text: s });
    console.log(`> ${s}\n${f.sent.map((m) => '  ' + m.body.replace(/\n/g, '\n  ')).join('\n')}`);
  }
}
