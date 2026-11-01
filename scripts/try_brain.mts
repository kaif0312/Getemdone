// Calls the REAL Gemini (needs GEMINI_API_KEY) with fake domain deps and prints the chosen tool calls.
// Run: GEMINI_API_KEY=... npx tsx scripts/try_brain.mts   (never sends WhatsApp, never touches Firestore)
process.env.NUDGE_WA_DRY_RUN = '1';
import { handleWith } from '../lib/bot/core';
import { callGemini } from '../lib/bot/gemini';
import { makeFake, mkTask } from './tests/fakes';

if (!process.env.GEMINI_API_KEY) {
  console.log('GEMINI_API_KEY not set: skipping the live Gemini try-out.');
  process.exit(0);
}

const SAMPLES = [
  'gym 6pm, call mom, finish deck by fri',
  'kal subah 7 baje doctor appointment',
  'ran 5k in 28 min',
  'chest day 45 min, bench 4 sets of 8',
  'weight 82.4 kg today, slept 6.5 hours',
  'finished the deck and called mom',
  'push the gym one to tomorrow',
  'delete the doctor thing',
  'what do i have today?',
  'nudge ali, he is slacking',
  'send a fire emoji to ali',
  'remind me every monday to water plants',
  'set my goal to 4 workouts a week and 8000 steps',
  'check in with me at 7:30 am',
  'ഇന്ന് വൈകുന്നേരം 5 മണിക്ക് ജിമ്മിൽ പോകണം',
  'اشتري حليب بعد العمل',
  'thanks!',
  'how did my week go?',
];

for (const s of SAMPLES) {
  const f = makeFake({
    tasks: [mkTask('t1', 'gym', { deferredTo: '2026-11-01T18:00' }), mkTask('t2', 'call mom'), mkTask('t3', 'finish deck'), mkTask('t4', 'doctor appointment')],
    gemini: async (req) => {
      const r = await callGemini(req);
      console.log(`  -> ${r.model}: ${JSON.stringify(r.calls)}${r.text ? ' text=' + r.text : ''}`);
      return r;
    },
  });
  console.log(`\n> ${s}`);
  await handleWith(f.deps, { id: 'x', from: '9100', timestamp: Date.now(), type: 'text', text: s });
  for (const m of f.sent) console.log('  <- ' + m.body.replace(/\n/g, '\n     '));
}
