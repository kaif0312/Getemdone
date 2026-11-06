// Meetings: time parsing, request validation, reminder times/text, Calendar body, auth (signed / token). No Firestore, no network.
//   npx tsx scripts/tests/test_meetings.mts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { BadRequest, calendarBody, meetUrlOf, normalizeRequest, parseStart, reminderFireTimes, reminderText } from '../../lib/server/meetings';
import { authenticate, deps, freshTs } from '../../lib/server/meetingsApi';

process.env.NUDGE_FORWARD_SECRET = 'test-secret';
const NOW = Date.parse('2026-11-06T10:00:00Z');

// parseStart
assert.equal(parseStart('2026-11-07T23:00:00+05:30', 'UTC'), Date.parse('2026-11-07T17:30:00Z'));
assert.equal(parseStart('2026-11-07T23:00:00Z', 'Asia/Kolkata'), Date.parse('2026-11-07T23:00:00Z'));
assert.equal(parseStart('2026-11-07 23:00', 'Asia/Kolkata'), Date.parse('2026-11-07T17:30:00Z'));
assert.equal(parseStart('2026-11-07 23:00', 'Asia/Dubai'), Date.parse('2026-11-07T19:00:00Z'));
assert.equal(parseStart('2026-07-01 09:00', 'America/New_York'), Date.parse('2026-07-01T13:00:00Z'), 'DST');
assert.throws(() => parseStart('tomorrow 5pm', 'UTC'), BadRequest);

// normalizeRequest
const n = normalizeRequest({ title: ' Meeting with Shamly ', start: '2026-11-07 23:00', createdVia: 'claude-code', attendees: [{ name: 'Shamly', email: 's@x.com' }, { waId: '+91 62389 52660' }] }, NOW);
assert.equal(n.title, 'Meeting with Shamly');
assert.equal(n.tz, 'Asia/Kolkata');
assert.equal(n.endMs - n.startMs, 30 * 60_000);
assert.deepEqual(n.reminderMinutes, [30, 10]);
assert.equal(n.attendees[1].waId, '916238952660');
assert.throws(() => normalizeRequest({ title: '', start: '2026-11-07 23:00', createdVia: 'app' }, NOW), BadRequest);
assert.throws(() => normalizeRequest({ title: 'a', start: '2026-11-01 10:00', createdVia: 'app' }, NOW), /past/);
assert.throws(() => normalizeRequest({ title: 'a', start: '2026-11-07 10:00', createdVia: 'bot' as never, tz: 'Nope/Zone' }, NOW), /tz/);
assert.throws(() => normalizeRequest({ title: 'a', start: '2026-11-07 10:00', createdVia: 'app', attendees: [{ email: 'bad' }] }, NOW), /email/);
assert.throws(() => normalizeRequest({ title: 'a', start: '2026-11-07 10:00', createdVia: 'x' as never }, NOW), /createdVia/);
assert.deepEqual(normalizeRequest({ title: 'a', start: '2026-11-07 10:00', createdVia: 'app', reminderMinutes: [10, 60, 10], durationMin: 60 }, NOW).reminderMinutes, [60, 10]);

// reminders
assert.equal(reminderText('Meeting with Shamly', 'Asia/Kolkata', Date.parse('2026-11-07T17:30:00Z'), 'https://meet.google.com/abc-defg-hij'), 'Meeting with Shamly at 11:00 PM https://meet.google.com/abc-defg-hij');
assert.equal(reminderText('Sync', 'Asia/Kolkata', Date.parse('2026-11-07T06:30:00Z')), 'Sync at 12:00 PM');
const start = NOW + 20 * 60_000;
assert.deepEqual(reminderFireTimes(start, [30, 10], NOW).map((r) => r.minutes), [10], '30-min reminder already passed');
assert.equal(reminderFireTimes(start, [30, 10], NOW)[0].fireAt, start - 600_000);

// Calendar
const body = calendarBody(n, 'req-1') as { conferenceData: { createRequest: { requestId: string; conferenceSolutionKey: { type: string } } }; attendees: { email: string }[]; start: { timeZone: string } };
assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
assert.deepEqual(body.attendees, [{ email: 's@x.com', displayName: 'Shamly' }], 'only attendees with an email are invited');
assert.equal(body.start.timeZone, 'Asia/Kolkata');
assert.equal(meetUrlOf({ hangoutLink: 'https://meet.google.com/a' }), 'https://meet.google.com/a');
assert.equal(meetUrlOf({ conferenceData: { entryPoints: [{ entryPointType: 'phone', uri: 'tel:1' }, { entryPointType: 'video', uri: 'https://meet.google.com/b' }] } }), 'https://meet.google.com/b');
assert.equal(meetUrlOf({}), undefined);

// auth
const sign = (s: string) => createHmac('sha256', 'test-secret').update(s, 'utf8').digest('hex');
deps.uidFromWa = async (wa) => (wa === '916238952660' ? 'owner-uid' : null);
deps.uidFromToken = async (req) => (req.headers.get('authorization') === 'Bearer good' ? 'tok-uid' : null);
const mk = (h: Record<string, string>) => new Request('http://x/api/meetings', { method: 'POST', headers: h });
const raw = JSON.stringify({ title: 't', ownerWa: '+916238952660', ts: NOW });
assert.equal(await authenticate(mk({ 'x-nudge-signature': sign(raw) }), raw, JSON.parse(raw), NOW), 'owner-uid');
assert.equal(await authenticate(mk({ 'x-nudge-signature': sign(raw) }), raw, JSON.parse(raw), NOW + 6 * 60_000), null, 'replay after 5 min');
assert.equal(await authenticate(mk({ 'x-nudge-signature': sign('other') }), raw, JSON.parse(raw), NOW), null, 'bad signature');
const noTs = JSON.stringify({ ownerWa: '916238952660' });
assert.equal(await authenticate(mk({ 'x-nudge-signature': sign(noTs) }), noTs, JSON.parse(noTs), NOW), null, 'ts required');
const unknown = JSON.stringify({ ownerWa: '911111', ts: NOW });
assert.equal(await authenticate(mk({ 'x-nudge-signature': sign(unknown) }), unknown, JSON.parse(unknown), NOW), null, 'unlinked number');
const q = '/api/meetings?ownerUid=u9&ts=' + NOW;
assert.equal(await authenticate(mk({ 'x-nudge-signature': sign(q) }), q, { ownerUid: 'u9', ts: String(NOW) }, NOW), 'u9', 'signed GET');
assert.equal(await authenticate(mk({ authorization: 'Bearer good' }), '', { ownerUid: 'someone-else' }, NOW), 'tok-uid', 'token user cannot choose another owner');
assert.equal(await authenticate(mk({ authorization: 'Bearer bad' }), '', {}, NOW), null);
assert.equal(await authenticate(mk({}), '', {}, NOW), null);
assert.ok(freshTs(String(NOW), NOW) && !freshTs('abc', NOW));

console.log('test_meetings: all passed');
