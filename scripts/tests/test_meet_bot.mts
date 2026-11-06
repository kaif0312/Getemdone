// /meet, /meetings, /cancel meeting with fake deps: no emulator, no network.
// Run: NUDGE_WA_DRY_RUN=1 npx tsx scripts/tests/test_meet_bot.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { handleWith } from '../../lib/bot/core';
import { parseFast, parseSlash } from '../../lib/bot/fastpath';
import { HELP } from '../../lib/bot/actions';
import { MEET_TOOL, fmtMeetingWhen, formatCreated, formatList, meetingRequestFrom, parseCancelMeeting, reminderSummary } from '../../lib/bot/meet';
import type { InboundMessage } from '../../lib/wa/types';
import type { Meeting } from '../../lib/meetings/types';
import type { BotDeps, GeminiResult, MeetingBotDeps } from '../../lib/bot/types';
import { makeFake } from './fakes';

let n = 0;
const text = (s: string, from = '9100'): InboundMessage => ({ id: 'm' + ++n, from, timestamp: 1000 + n, type: 'text', text: s });
let passed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name); console.error(e); process.exitCode = 1; }
}

const NOW = Date.parse('2026-11-01T08:30:00Z'); // the fake clock
const mk = (id: string, title: string, startIso: string, extra: Partial<Meeting> = {}): Meeting => ({
  id, ownerUid: 'u1', title, startAt: startIso, endAt: new Date(Date.parse(startIso) + 30 * 60_000).toISOString(), tz: 'Asia/Kolkata', attendees: [],
  status: 'scheduled', createdVia: 'bot', reminderMinutes: [30, 10], createdAt: '', updatedAt: '', ...extra,
});

// ---------- pure
await test('parseSlash: /meet, /meeting, /meetings, /cancel meeting', () => {
  assert.deepEqual(parseSlash('/meet Sync tomorrow 5pm'), { fast: { t: 'meet', text: 'Sync tomorrow 5pm' } });
  assert.deepEqual(parseSlash('/meeting'), { fast: { t: 'meet', text: '' } });
  assert.deepEqual(parseSlash('/meetings'), { fast: { t: 'meetings' } });
  assert.deepEqual(parseSlash('/cancel meeting 2'), { fast: { t: 'cancelMeeting', n: 2 } });
  assert.deepEqual(parseSlash('/cancel meeting'), { fast: { t: 'cancelMeeting', n: 0 } });
  assert.deepEqual(parseSlash('/cancel meeting 9'), { fast: { t: 'cancelMeeting', n: 0 } });
  // /cancel without "meeting" stays what it was: an unknown command, and "cancel" button ids are untouched
  assert.deepEqual(parseSlash('/cancel'), { fast: { t: 'unknownCmd', cmd: 'cancel' } });
  assert.deepEqual(parseSlash('/cancel something'), { fast: { t: 'unknownCmd', cmd: 'cancel' } });
  assert.deepEqual(parseFast({ id: 'x', from: '9', timestamp: 1, type: 'interactive', reply: { id: 'cancel:abc', title: 'Skip' } }), { t: 'cancel', id: 'abc' });
  assert.equal(parseFast(text('meeting notes')), null);
});

await test('parseCancelMeeting', () => {
  assert.equal(parseCancelMeeting('meeting 3'), 3);
  assert.equal(parseCancelMeeting('Meeting #1'), 1);
  assert.equal(parseCancelMeeting('meeting x'), 0);
  assert.equal(parseCancelMeeting('meeting 0'), 0);
  assert.equal(parseCancelMeeting('task 3'), null);
  assert.equal(parseCancelMeeting(''), null);
});

await test('meetingRequestFrom: maps args, drops invented emails, rejects junk', () => {
  const ok = meetingRequestFrom({ title: ' Sync ', start: '2026-11-07T23:00', duration_min: 45, with_name: 'Shamly', with_email: 'sh@x.com' }, 'Asia/Kolkata', 'Sync with Shamly sh@x.com 11pm');
  assert.deepEqual(ok, { title: 'Sync', start: '2026-11-07 23:00', tz: 'Asia/Kolkata', durationMin: 45, attendees: [{ name: 'Shamly', email: 'sh@x.com' }] });
  const invented = meetingRequestFrom({ title: 'Sync', start: '2026-11-07T23:00', with_name: 'Shamly', with_email: 'shamly@gmail.com' }, 'Asia/Kolkata', 'Sync with Shamly 11pm');
  assert.deepEqual(invented?.attendees, [{ name: 'Shamly' }]);
  assert.equal(meetingRequestFrom({ title: 'Sync' }, 'Asia/Kolkata', 'x'), null);
  assert.equal(meetingRequestFrom({ title: '', start: '2026-11-07T23:00' }, 'Asia/Kolkata', 'x'), null);
  assert.equal(meetingRequestFrom({ title: 'a', start: 'tomorrow' }, 'Asia/Kolkata', 'x'), null);
  assert.equal(meetingRequestFrom({ title: 'a', start: '2026-11-07T23:00', duration_min: 2 }, 'Asia/Kolkata', 'x')?.durationMin, undefined);
  assert.equal(meetingRequestFrom({ title: 'a', start: '2026-11-07T23:00', duration_min: '60' }, 'Asia/Kolkata', 'x')?.durationMin, 60);
});

await test('formatting: time in the user zone, link, reminders', () => {
  assert.match(fmtMeetingWhen('2026-11-07T17:30:00.000Z', 'Asia/Kolkata'), /7 Nov.*11:00 PM/);
  assert.match(fmtMeetingWhen('2026-11-07T17:30:00.000Z', 'Asia/Dubai'), /9:30 PM/);
  const start = '2026-11-07T17:30:00.000Z';
  assert.equal(reminderSummary(start, [30, 10], NOW), 'Reminders: 30 min and 10 min before.');
  assert.equal(reminderSummary(start, [30, 10], Date.parse(start) - 20 * 60_000), 'Reminders: 10 min before.');
  assert.match(reminderSummary(start, [30, 10], Date.parse(start) - 60_000), /No reminders/);
  assert.match(reminderSummary(start, [1440, 30], NOW), /24 h and 30 min/);
  const withLink = formatCreated(mk('a', 'Sync', start, { meetUrl: 'https://meet.google.com/abc-defg-hij', attendees: [{ name: 'Shamly', email: 's@x.com' }] }), 'ok', 'Asia/Kolkata', NOW);
  assert.match(withLink, /Meet link: https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(withLink, /with Shamly/);
  assert.match(withLink, /Invite emailed/);
  assert.match(formatCreated(mk('a', 'Sync', start), 'not_connected', 'Asia/Kolkata', NOW), /Google Calendar not connected, no link/);
  assert.match(formatCreated(mk('a', 'Sync', start), 'error', 'Asia/Kolkata', NOW), /failed/);
  assert.match(formatList([], 'Asia/Kolkata'), /No upcoming/);
  assert.match(formatList([mk('a', 'Sync', start), mk('b', 'Call', start)], 'Asia/Kolkata'), /1\. \*Sync\*[\s\S]*2\. \*Call\*/);
});

await test('help lists /meet', () => assert.match(HELP, /\/meet /));

// ---------- through the bot
class Bad extends Error {}
function fakeMeetings(list: Meeting[] = []) {
  const created: unknown[] = [];
  const cancelled: string[] = [];
  const m: MeetingBotDeps = {
    create: async (uid, req) => {
      created.push({ uid, req });
      if (req.start === '2020-01-01 10:00') throw new Bad('start is in the past');
      return { meeting: mk('new1', req.title ?? '', '2026-11-07T17:30:00.000Z', { attendees: req.attendees ?? [] }), calendar: 'not_connected' };
    },
    listUpcoming: async () => list,
    cancel: async (_u, id) => { cancelled.push(id); return { meeting: list.find((x) => x.id === id)!, calendar: 'ok' }; },
    isBadRequest: (e) => e instanceof Bad,
  };
  return { m, created, cancelled };
}
function bot(meetings: MeetingBotDeps | undefined, gemini?: (r: Parameters<BotDeps['gemini']>[0]) => Promise<GeminiResult>) {
  const fake = makeFake({ gemini });
  fake.deps.meetings = meetings;
  return fake;
}
const last = (f: ReturnType<typeof makeFake>) => f.sent[f.sent.length - 1].body;

await test('/meet: ONE tool, createdVia bot, replies with time, link status, reminders', async () => {
  const fm = fakeMeetings();
  let tools: string[] = [];
  const f = bot(fm.m, async (req) => {
    tools = req.tools.map((t) => t.name);
    return { text: '', calls: [{ name: 'create_meeting', args: { title: 'Meeting with Shamly', start: '2026-11-07T23:00', with_name: 'Shamly', with_email: 'shamly@x.com' } }] };
  });
  await handleWith(f.deps, text('/meet Meeting with Shamly Sat 11pm with Shamly shamly@x.com'));
  assert.deepEqual(tools, [MEET_TOOL.name]);
  const c = fm.created[0] as { uid: string; req: Record<string, unknown> };
  assert.equal(c.uid, 'u1');
  assert.equal(c.req.createdVia, 'bot');
  assert.equal(c.req.tz, 'Asia/Kolkata');
  assert.equal(c.req.start, '2026-11-07 23:00');
  const r = last(f);
  assert.match(r, /Meeting with Shamly/);
  assert.match(r, /11:00 PM/);
  assert.match(r, /not connected, no link/);
  assert.match(r, /Reminders: 30 min and 10 min before/);
});

await test('/meet: no text, unusable model output and model failure give the usage text', async () => {
  const fm = fakeMeetings();
  const f1 = bot(fm.m);
  await handleWith(f1.deps, text('/meet'));
  assert.match(last(f1), /\/meet <title> <when>/);
  const f2 = bot(fm.m, async () => ({ text: 'hmm', calls: [] }));
  await handleWith(f2.deps, text('/meet gibberish'));
  assert.match(last(f2), /could not read a title and a time/);
  const f3 = bot(fm.m, async () => { throw new Error('boom'); });
  await handleWith(f3.deps, text('/meet something'));
  assert.match(last(f3), /could not read a title and a time/);
  assert.equal(fm.created.length, 0);
});

await test('/meet: validation errors from the server are shown, other errors are not leaked', async () => {
  const fm = fakeMeetings();
  const f = bot(fm.m, async () => ({ text: '', calls: [{ name: 'create_meeting', args: { title: 'Old', start: '2020-01-01T10:00' } }] }));
  await handleWith(f.deps, text('/meet Old 1 Jan 2020 10am'));
  assert.match(last(f), /start is in the past/);
  const m2: MeetingBotDeps = { ...fm.m, create: async () => { throw new Error('secret firestore detail'); } };
  const f2 = bot(m2, async () => ({ text: '', calls: [{ name: 'create_meeting', args: { title: 'X', start: '2026-11-07T10:00' } }] }));
  await handleWith(f2.deps, text('/meet X 7 Nov 10am'));
  assert.doesNotMatch(last(f2), /secret/);
  assert.match(last(f2), /went wrong/);
});

await test('/meetings and /cancel meeting <n>', async () => {
  const list = [mk('a', 'First', '2026-11-07T17:30:00.000Z'), mk('b', 'Second', '2026-11-08T17:30:00.000Z', { meetUrl: 'https://meet.google.com/x', gcalEventId: 'e1' })];
  const fm = fakeMeetings(list);
  const f = bot(fm.m);
  await handleWith(f.deps, text('/meetings'));
  assert.match(last(f), /1\. \*First\*[\s\S]*2\. \*Second\*/);
  await handleWith(f.deps, text('/cancel meeting 2'));
  assert.deepEqual(fm.cancelled, ['b']);
  assert.match(last(f), /Cancelled \*Second\*/);
  await handleWith(f.deps, text('/cancel meeting 4'));
  assert.deepEqual(fm.cancelled, ['b']);
  assert.match(last(f), /no meeting 4/);
  await handleWith(f.deps, text('/cancel meeting'));
  assert.match(last(f), /Which one/);
});

await test('without meetings deps the commands say so', async () => {
  const f = bot(undefined);
  await handleWith(f.deps, text('/meet x tomorrow'));
  assert.match(last(f), /not available/);
});

console.log(`${passed} passed`);
