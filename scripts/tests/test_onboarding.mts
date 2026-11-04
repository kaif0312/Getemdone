// WhatsApp onboarding with fake deps: no emulator, no network. Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_onboarding.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { handleWith } from '../../lib/bot/core';
import { parseClock, parseName, zoneFromTable } from '../../lib/bot/onboarding';
import type { InboundMessage } from '../../lib/wa/types';
import { makeFake } from './fakes';

let n = 0;
const text = (t: string, profileName?: string): InboundMessage => ({ id: 'o' + ++n, from: '9100', timestamp: 1000 + n, type: 'text', text: t, profileName });
const tap = (id: string): InboundMessage => ({ id: 'o' + ++n, from: '9100', timestamp: 1000 + n, type: 'interactive', reply: { id, title: 'x' } });
let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}
const fresh = async () => { const f = makeFake(); await f.deps.updateLink('9100', { onboarding: { step: 'welcome' } }); return f; };

await test('pure helpers', async () => {
  assert.equal(zoneFromTable('Belgium'), 'Europe/Brussels');
  assert.equal(zoneFromTable("I'm in Brussels"), 'Europe/Brussels');
  assert.equal(zoneFromTable('kochi, kerala'), 'Asia/Kolkata');
  assert.equal(zoneFromTable('qwertyland'), null);
  assert.equal(parseClock('6:30'), '06:30');
  assert.equal(parseClock('7am'), '07:00');
  assert.equal(parseClock('9 pm'), '21:00');
  assert.equal(parseClock('25:00'), null);
  assert.equal(parseClock('banana'), null);
  assert.equal(parseName('call me hassan'), 'Hassan');
  assert.equal(parseName("I'm Ali."), 'Ali');
  assert.equal(parseName('gym 6pm'), null);
  assert.equal(parseName('Hassan 🇧🇪'), 'Hassan');
});

await test('full flow: welcome -> name -> city -> confirm -> morning -> recap -> goal', async () => {
  const f = await fresh();
  await handleWith(f.deps, text('hi', 'Hassan 🇧🇪'));
  assert.match(f.sent[0].body, /Quick setup/);
  assert.equal(f.sent[1].kind, 'buttons'); // offers the WhatsApp profile name
  await handleWith(f.deps, tap('ob:name:keep'));
  assert.ok(f.calls.includes('setProfile {"displayName":"Hassan"}'), f.calls.join('|'));
  assert.match(f.sent.at(-1)!.body, /Which city or country/);
  await handleWith(f.deps, text('Belgium'));
  assert.equal(f.sent.at(-1)!.buttons!.length, 2);
  assert.match(f.sent.at(-1)!.body, /Brussels/);
  await handleWith(f.deps, tap('ob:tz:yes'));
  assert.equal(f.getLink()!.timezone, 'Europe/Brussels');
  assert.ok(f.calls.includes('setProfile {"timezone":"Europe/Brussels"}'));
  await handleWith(f.deps, text('6:30'));
  assert.equal(f.getLink()!.checkinTime, '06:30');
  await handleWith(f.deps, tap('ob:recap:21:00'));
  assert.equal(f.getLink()!.recapTime, '21:00');
  assert.deepEqual(f.sent.at(-1)!.buttons!.map((b) => b.id), ['ob:goal:tasks', 'ob:goal:fitness', 'ob:goal:both']);
  await handleWith(f.deps, tap('ob:goal:both'));
  assert.equal(f.getLink()!.onboarding, null);
  assert.equal(f.getLink()!.interest, 'both');
  assert.match(f.sent.at(-1)!.body, /All set/);
  assert.match(f.sent.at(-1)!.body, /6:30/);
  // after setup the normal bot answers
  await handleWith(f.deps, text('help'));
  assert.doesNotMatch(f.sent.at(-1)!.body, /Which city/);
});

await test('bad answers re-ask the same step; wrong city goes back', async () => {
  const f = await fresh();
  await handleWith(f.deps, text('hello'));
  await handleWith(f.deps, text('gym 6pm')); // not a name
  assert.match(f.sent.at(-1)!.body, /Just the name/);
  await handleWith(f.deps, text('Hassan'));
  await handleWith(f.deps, text('Belgium'));
  await handleWith(f.deps, tap('ob:tz:no'));
  assert.match(f.sent.at(-1)!.body, /Which city/);
  assert.deepEqual(f.getLink()!.onboarding, { step: 'tz' });
});

await test('unknown city asks the model; a bad model answer re-asks', async () => {
  const f = makeFake({ gemini: async () => ({ calls: [{ name: 'set_timezone', args: { timezone: 'Asia/Seoul' } }], text: '' }) });
  await f.deps.updateLink('9100', { onboarding: { step: 'tz' } });
  await handleWith(f.deps, text('Gangnam'));
  assert.match(f.sent.at(-1)!.body, /Seoul/);
  const g = makeFake({ gemini: async () => ({ calls: [{ name: 'set_timezone', args: { timezone: '' } }], text: '' }) });
  await g.deps.updateLink('9100', { onboarding: { step: 'tz' } });
  await handleWith(g.deps, text('Narnia'));
  assert.match(g.sent.at(-1)!.body, /couldn't place/);
  assert.deepEqual(g.getLink()!.onboarding, { step: 'tz' });
});

await test('skip keeps defaults; "no" turns the recap off; voice note mid-setup is just re-asked', async () => {
  const f = await fresh();
  await f.deps.updateLink('9100', { onboarding: { step: 'morning' } });
  await handleWith(f.deps, text('skip'));
  assert.equal(f.getLink()!.checkinTime, '08:00');
  await handleWith(f.deps, { id: 'v1', from: '9100', timestamp: 5, type: 'audio', media: { id: 'm', mimeType: 'audio/ogg' } });
  assert.match(f.sent.at(-1)!.body, /Tap a time/);
  await handleWith(f.deps, text('no'));
  assert.equal(f.getLink()!.recapTime, null);
});

await test('`setup` restarts it for a finished user; normal users are untouched', async () => {
  const f = makeFake();
  await handleWith(f.deps, text('today'));
  assert.ok(!f.sent.some((s) => /Quick setup/.test(s.body)));
  await handleWith(f.deps, text('/setup'));
  assert.match(f.sent.at(-2)!.body, /Quick setup/);
  assert.match(f.sent.at(-1)!.body, /What should I call you/);
  assert.deepEqual(f.getLink()!.onboarding, { step: 'name' });
});

console.log(`${passed} passed`);
