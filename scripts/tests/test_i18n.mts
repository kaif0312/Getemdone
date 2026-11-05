// Languages (en/hi/ur/ml) + the care (medicine) chat, with fake deps: no emulator, no network.
// Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_i18n.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { handleWith } from '../../lib/bot/core';
import { parseFast } from '../../lib/bot/fastpath';
import { isConfirmation } from '../../lib/bot/care';
import { LANGS, STR, detectLang, parseLangName, t, type Key } from '../../lib/bot/i18n';
import { groupsFor, parseTime } from '../../lib/server/meds';
import { zonedToMs } from '../../lib/bot/format';
import type { InboundMessage } from '../../lib/wa/types';
import type { GeminiResult, MedBotDeps } from '../../lib/bot/types';
import { makeFake, mkTask } from './fakes';

let n = 0;
const text = (s: string, from = '9100'): InboundMessage => ({ id: 'm' + ++n, from, timestamp: 1000 + n, type: 'text', text: s });
const tap = (id: string, from = '9100'): InboundMessage => ({ id: 'm' + ++n, from, timestamp: 1000 + n, type: 'interactive', reply: { id, title: 'x' } });
const gem = (calls: GeminiResult['calls'], t0 = ''): GeminiResult => ({ calls, text: t0 });

let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}

// ---------- the dictionary
await test('every string exists in all four languages with the same {placeholders}', () => {
  const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const key of Object.keys(STR) as Key[]) {
    const e = STR[key] as Record<string, string>;
    for (const l of LANGS) assert.ok(e[l] && e[l].trim().length > 0, `${key}.${l} is empty`);
    for (const l of LANGS) if (key !== 'undone') assert.equal(ph(e[l]), ph(e.en), `${key}.${l} placeholders differ from en`);
  }
});

await test('the right script is used for each language', () => {
  const has = (re: RegExp, s: string) => re.test(s);
  assert.ok(has(/[ഀ-ൿ]/, t('ml', 'medDue', { name: 'x', meds: 'y' })));
  assert.ok(has(/[ऀ-ॿ]/, t('hi', 'medDue', { name: 'x', meds: 'y' })));
  assert.ok(has(/[؀-ۿ]/, t('ur', 'medDue', { name: 'x', meds: 'y' })));
  assert.equal(t('hi', 'leftToday', { n: 3 }), 'आज 3 बाक़ी');
});

await test('button titles fit WhatsApp (<= 20 characters)', () => {
  for (const key of ['btnDone', 'btnTomorrow', 'btnDelete', 'btnUndo', 'btnPlan', 'btnSkip', 'btnTaken', 'btnLater', 'pickTask', 'pickFocus', 'langPickBtn'] as Key[])
    for (const l of LANGS) assert.ok(Array.from(t(l, key)).length <= 20, `${key}.${l} = ${t(l, key)}`);
});

// ---------- detection
await test('detectLang: scripts, not Latin text', () => {
  assert.equal(detectLang('ഇന്ന് ജിമ്മിൽ പോകണം'), 'ml');
  assert.equal(detectLang('कल बैंक जाना है'), 'hi');
  assert.equal(detectLang('کل بینک جانا ہے ٹھیک ہے'), 'ur');
  assert.equal(detectLang('gym 6pm call mom'), null);
  assert.equal(detectLang('kazhichu'), null);
  assert.equal(detectLang('مرحبا كيف حالك'), null, 'Arabic is not Urdu');
  assert.equal(detectLang('ok'), null);
});

await test('parseLangName / fast paths', () => {
  assert.equal(parseLangName('Malayalam'), 'ml');
  assert.equal(parseLangName('हिंदी'), 'hi');
  assert.equal(parseLangName('اردو'), 'ur');
  assert.equal(parseLangName('English'), 'en');
  assert.equal(parseLangName('banana'), null);
  const f = (s: string) => parseFast({ id: 'x', from: '1', timestamp: 1, type: 'text', text: s });
  assert.deepEqual(f('language'), { t: 'lang' });
  assert.deepEqual(f('/language'), { t: 'lang' });
  assert.deepEqual(f('/lang ml'), { t: 'lang', code: 'ml' });
  assert.deepEqual(f('language hindi'), { t: 'lang', code: 'hi' });
  assert.deepEqual(f('മലയാളം'), { t: 'lang', code: 'ml' });
  assert.equal(f('english'), null, 'bare "english" is not a switch');
  assert.deepEqual(f('language english'), { t: 'lang', code: 'en' });
  assert.deepEqual(f('meds'), { t: 'meds' });
  assert.deepEqual(f('/meds'), { t: 'meds' });
  assert.deepEqual(parseFast({ id: 'x', from: '1', timestamp: 1, type: 'interactive', reply: { id: 'lang:ur', title: 'x' } }), { t: 'lang', code: 'ur' });
});

// ---------- the bot talks in the user's language
const three = () => [mkTask('t1', 'gym', { deferredTo: '2026-11-01T18:00' }), mkTask('t2', 'call mom')];

await test('English users see exactly what they saw before', async () => {
  const f = makeFake({ tasks: three() });
  await handleWith(f.deps, text('today'));
  assert.match(f.sent[0].body, /\*Today\* · 2 open/);
});

await test('Malayalam letters switch the language; the list comes back in Malayalam', async () => {
  const f = makeFake({ tasks: three(), gemini: async () => gem([{ name: 'list_today', args: {} }]) });
  await handleWith(f.deps, text('ഇന്നത്തെ ലിസ്റ്റ് കാണിക്കൂ'));
  assert.equal(f.getLink()!.lang, 'ml');
  assert.match(f.sent.at(-1)!.body, /\*ഇന്ന്\* · 2 ബാക്കി/);
  assert.ok(f.geminiReqs[0].user.at(-1)!.text!.includes('Reply language: Malayalam'));
  const list = f.sent.at(-1)!;
  assert.equal(list.kind, 'list');
});

await test('a typed language name switches it by hand and sticks', async () => {
  const f = makeFake({ tasks: three(), gemini: async () => gem([{ name: 'list_today', args: {} }]) });
  await handleWith(f.deps, text('language hindi'));
  assert.equal(f.getLink()!.lang, 'hi');
  assert.equal(f.getLink()!.langManual, true);
  assert.match(f.sent.at(-1)!.body, /हिन्दी/);
  // a Malayalam message no longer flips it (manual choice)
  await handleWith(f.deps, text('ഇന്ന് ഒന്നുമില്ല'), );
  assert.equal(f.getLink()!.lang, 'hi');
});

await test('language picker is a list of four; tapping a row sets it', async () => {
  const f = makeFake();
  await handleWith(f.deps, text('language'));
  const m = f.sent.at(-1)!;
  assert.equal(m.kind, 'list');
  assert.deepEqual(m.rows!.map((r) => r.id), ['lang:en', 'lang:hi', 'lang:ur', 'lang:ml']);
  await handleWith(f.deps, tap('lang:ur'));
  assert.equal(f.getLink()!.lang, 'ur');
  assert.match(f.sent.at(-1)!.body, /اردو/);
});

await test('set_language from the model (voice note: "reply in Malayalam")', async () => {
  const f = makeFake({ gemini: async () => gem([{ name: 'set_language', args: { language: 'ml' } }]) });
  await handleWith(f.deps, text('please reply in malayalam from now'));
  assert.equal(f.getLink()!.lang, 'ml');
  assert.match(f.sent.at(-1)!.body, /മലയാള/);
});

await test('done / buttons are in the language; error text too', async () => {
  const f = makeFake({ tasks: three(), link: { lang: 'ml', langManual: true } });
  await handleWith(f.deps, text('today'));
  assert.equal(f.sent.at(-1)!.kind, 'list');
  await handleWith(f.deps, text('done 1'));
  const last = f.sent.at(-1)!;
  assert.equal(last.kind, 'buttons');
  assert.equal(last.buttons![0].title, 'തിരിച്ചെടുക്കുക ↩️');
  const g = makeFake({ link: { lang: 'hi', langManual: true } });
  await handleWith(g.deps, text('done 9'));
  assert.match(g.sent.at(-1)!.body, /#9/);
  assert.match(g.sent.at(-1)!.body, /लिस्ट/);
});

await test('help and unsupported media follow the language', async () => {
  const f = makeFake({ link: { lang: 'ur', langManual: true } });
  await handleWith(f.deps, text('help'));
  assert.match(f.sent.at(-1)!.body, /میں کیا کیا کر سکتا ہوں/);
  await handleWith(f.deps, { id: 'v1', from: '9100', timestamp: 5000, type: 'video' });
  assert.match(f.sent.at(-1)!.body, /ٹیکسٹ/);
});

// ---------- the medicine chat (a parent)
function fakeMeds(open: { id: string; wamid?: string }[] = [{ id: 'p_2026-11-01_0800' }]) {
  const log: string[] = [];
  const meds = {
    openDosesFor: async () => open.map((o) => ({ ...o, planId: 'p', patientWaId: '9100', ownerUid: 'o', date: '2026-11-01', time: '08:00', dueAt: 1, meds: ['BP tablet'], lang: 'ml', status: 'sent', sentAt: 1, tries: 1 })),
    takeDose: async (id: string) => { log.push('take ' + id); return { ok: true, name: 'അമ്മ', lang: 'ml', already: false }; },
    snoozeDose: async (id: string) => { log.push('snooze ' + id); return { ok: true, lang: 'ml' }; },
    forwardToOwner: async (_w: string, what: { text?: string; media?: boolean }) => { log.push('forward ' + JSON.stringify(what)); },
    statusLines: async () => ['status'],
    addMedication: async () => ({ ok: false, reason: 'no_person', names: [] }),
    removeMedication: async () => ({ ok: false, reason: 'no_person', names: [] }),
  } as unknown as MedBotDeps;
  return { meds, log };
}
const parent = { care: true, lang: 'ml', langManual: true };

await test('care: the Taken button records it and thanks in Malayalam; no to-do bot, no Gemini', async () => {
  const { meds, log } = fakeMeds();
  const f = makeFake({ link: parent, meds });
  await handleWith(f.deps, tap('med:taken:p_2026-11-01_0800'));
  assert.deepEqual(log, ['take p_2026-11-01_0800']);
  assert.match(f.sent.at(-1)!.body, /ശരി അമ്മ/);
  assert.equal(f.geminiReqs.length, 0);
});

await test('care: Later snoozes; the template quick-reply works the same', async () => {
  const { meds, log } = fakeMeds();
  const f = makeFake({ link: parent, meds });
  await handleWith(f.deps, tap('med:later:p_2026-11-01_0800'));
  assert.deepEqual(log, ['snooze p_2026-11-01_0800']);
  assert.match(f.sent.at(-1)!.body, /30 മിനിറ്റ്/);
  await handleWith(f.deps, { id: 'b1', from: '9100', timestamp: 7000, type: 'button', reply: { id: 'med:taken:p_2026-11-01_0800', title: 'കഴിച്ചു' } });
  assert.equal(log.at(-1), 'take p_2026-11-01_0800');
});

await test('care: "kazhichu" / "കഴിച്ചു" / "ले ली" / a thumbs-up confirm the newest open dose', async () => {
  for (const w of ['kazhichu', 'കഴിച്ചു', 'കഴിച്ചൂ അമ്മേ', 'ले ली', 'لے لی', 'taken', '👍', 'ok']) {
    const { meds, log } = fakeMeds([{ id: 'new' }, { id: 'old' }]);
    const f = makeFake({ link: parent, meds });
    await handleWith(f.deps, text(w));
    assert.deepEqual(log, ['take new'], w);
  }
});

await test('care: a "no" is never a confirmation; other text is passed to the family member', async () => {
  for (const w of ['not taken', 'കഴിച്ചില്ല', 'नहीं ली', 'نہیں لی', 'kazhichilla', 'തല വേദനിക്കുന്നു']) {
    assert.equal(isConfirmation(w), false, w);
    const { meds, log } = fakeMeds();
    const f = makeFake({ link: parent, meds });
    await handleWith(f.deps, text(w));
    assert.deepEqual(log, ['forward ' + JSON.stringify({ text: w })], w);
    assert.match(f.sent.at(-1)!.body, /എത്തിച്ചിട്ടുണ്ട്/);
  }
});

await test('care: a thumbs-up REACTION on the reminder confirms that dose; a reaction elsewhere does nothing', async () => {
  const { meds, log } = fakeMeds([{ id: 'd1', wamid: 'wamid.A' }]);
  const f = makeFake({ link: parent, meds });
  await handleWith(f.deps, { id: 'r1', from: '9100', timestamp: 9000, type: 'reaction', reaction: { emoji: '👍', messageId: 'wamid.OTHER' } });
  assert.deepEqual(log, []);
  await handleWith(f.deps, { id: 'r2', from: '9100', timestamp: 9001, type: 'reaction', reaction: { emoji: '👍', messageId: 'wamid.A' } });
  assert.deepEqual(log, ['take d1']);
});

await test('care: a voice note is passed on as "sent a voice note"', async () => {
  const { meds, log } = fakeMeds();
  const f = makeFake({ link: parent, meds });
  await handleWith(f.deps, { id: 'a1', from: '9100', timestamp: 9100, type: 'audio', media: { id: 'm', mimeType: 'audio/ogg' } });
  assert.deepEqual(log, ['forward {"media":true}']);
  assert.equal(f.geminiReqs.length, 0);
});

await test('care: nothing due -> a short Malayalam line, nothing forwarded', async () => {
  const { meds, log } = fakeMeds([]);
  const f = makeFake({ link: parent, meds });
  await handleWith(f.deps, text('കഴിച്ചു'));
  assert.deepEqual(log, []);
  assert.match(f.sent.at(-1)!.body, /ഇപ്പോൾ കഴിക്കേണ്ട/);
});

// ---------- the family member's side
await test('/meds and add_medication reach the meds module in the owner language', async () => {
  const calls: unknown[] = [];
  const meds = {
    statusLines: async (_u: string, _n: number, lang: string) => ['status ' + lang],
    addMedication: async (_u: string, person: string | undefined, med: string, times: string[]) => {
      calls.push([person, med, times]);
      return { ok: true, plan: { ownerLabel: 'Amma' }, med: { name: med, times: ['08:00', '21:00'] } };
    },
    removeMedication: async () => ({ ok: false, reason: 'no_med', names: ['Amma'] }),
  } as unknown as MedBotDeps;
  const f = makeFake({ meds, link: { lang: 'hi', langManual: true }, gemini: async () => gem([{ name: 'add_medication', args: { person: 'Amma', medicine: 'BP tablet', times: ['08:00', '21:00'] } }]) });
  await handleWith(f.deps, text('/meds'));
  assert.equal(f.sent.at(-1)!.body, 'status hi');
  await handleWith(f.deps, text('remind Amma to take BP tablet at 8am and 9pm'));
  assert.deepEqual(calls, [['Amma', 'BP tablet', ['08:00', '21:00']]]);
  assert.match(f.sent.at(-1)!.body, /Amma के लिए जोड़ा: BP tablet, 8:00 AM, 9:00 PM/);
});

// ---------- the pure schedule maths
await test('parseTime', () => {
  assert.equal(parseTime('8am'), '08:00');
  assert.equal(parseTime('9 pm'), '21:00');
  assert.equal(parseTime('6:30'), '06:30');
  assert.equal(parseTime('12am'), '00:00');
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('soon'), null);
});

await test('groupsFor: due doses only, merged per time, a late-night dose is still tracked after midnight', () => {
  const tz = 'Asia/Kolkata';
  const plan = { tz, meds: [{ name: 'BP tablet', times: ['08:00', '21:00', '23:30'] }, { name: 'Thyroid', times: ['08:00'] }] };
  const at = (d: string) => zonedToMs(d, tz)!;
  const show = (gs: ReturnType<typeof groupsFor>) => gs.map((g) => `${g.date} ${g.time} ${g.names}`);
  assert.deepEqual(show(groupsFor(plan, at('2026-11-05T07:59'))), []);
  assert.deepEqual(show(groupsFor(plan, at('2026-11-05T08:10'))), ['2026-11-05 08:00 BP tablet,Thyroid']);
  assert.deepEqual(show(groupsFor(plan, at('2026-11-05T01:00'))), ['2026-11-04 21:00 BP tablet', '2026-11-04 23:30 BP tablet']);
  assert.deepEqual(show(groupsFor(plan, at('2026-11-05T06:00'))), ['2026-11-04 23:30 BP tablet'], '21:00 is 9 h ago: dropped, 23:30 still tracked');
  assert.deepEqual(show(groupsFor(plan, at('2026-11-05T15:00'))), ['2026-11-05 08:00 BP tablet,Thyroid'], '08:00 is 7 h ago: still tracked');
  assert.deepEqual(show(groupsFor(plan, at('2026-11-05T17:00'))), [], '08:00 is 9 h ago: no longer tracked');
  assert.equal(groupsFor(plan, at('2026-11-05T09:00'), true).filter((g) => g.date === '2026-11-05').length, 3, 'status view lists the whole day');
});

console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
