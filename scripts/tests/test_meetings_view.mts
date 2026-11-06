// Pure tests for components/meetings/view.ts (no emulator). Run: npx tsx scripts/tests/test_meetings_view.mts
import assert from 'node:assert/strict';
import type { Meeting } from '../../lib/meetings/types';
import {
  attendeeInitials, attendeeLabel, dayLabel, defaultStart, fmtDuration, groupMeetings, joinState, reminderLabel,
  sourceMeta, timeLines, toCreateBody, upcoming, validateDraft, wallToUtcMs, zoneChoices, zoneCity, soon48h,
} from '../../components/meetings/view';
import type { NewMeetingDraft } from '../../components/meetings/view';

const ms = (iso: string) => Date.parse(iso);
const mk = (o: Partial<Meeting>): Meeting => ({
  id: 'm', ownerUid: 'u', title: 'T', startAt: '2026-11-07T13:15:00.000Z', endAt: '2026-11-07T13:45:00.000Z', tz: 'Asia/Kolkata',
  attendees: [], status: 'scheduled', createdVia: 'app', reminderMinutes: [10], createdAt: '', updatedAt: '', ...o,
});

// wallToUtcMs
assert.equal(wallToUtcMs('2026-11-07', '18:45', 'Asia/Kolkata'), Date.UTC(2026, 10, 7, 13, 15));
assert.equal(wallToUtcMs('2026-11-07', '17:15', 'Asia/Dubai'), Date.UTC(2026, 10, 7, 13, 15));
assert.equal(wallToUtcMs('2026-07-01', '09:00', 'America/New_York'), Date.UTC(2026, 6, 1, 13, 0)); // EDT
assert.equal(wallToUtcMs('2026-01-01', '09:00', 'America/New_York'), Date.UTC(2026, 0, 1, 14, 0)); // EST

// timeLines
const kol = mk({});
assert.deepEqual(timeLines(kol, 'Asia/Dubai'), { main: '5:15 PM – 5:45 PM', other: '6:45 PM in Kolkata' });
assert.equal(timeLines(kol, 'Asia/Kolkata').other, null);
assert.equal(timeLines(kol, 'Asia/Kolkata').main, '6:45 PM – 7:15 PM');
// different calendar day adds the day to the second line
assert.match(timeLines(mk({ startAt: '2026-11-07T19:00:00.000Z', endAt: '2026-11-07T19:30:00.000Z' }), 'Asia/Dubai').other ?? '', /Sun 8 Nov in Kolkata/);

// groupMeetings: 23:30 Dubai (= 01:00 IST next day) on 7 Nov, now = 7 Nov 12:00 UTC
const late = mk({ id: 'late', startAt: '2026-11-07T19:30:00.000Z', endAt: '2026-11-07T20:00:00.000Z' });
const now = ms('2026-11-07T12:00:00.000Z');
assert.deepEqual(groupMeetings([late], 'Asia/Dubai', now).map((g) => g.key), ['today']);
assert.deepEqual(groupMeetings([late], 'Asia/Kolkata', now).map((g) => g.key), ['tomorrow']);
const later = mk({ id: 'later', startAt: '2026-11-12T10:00:00.000Z', endAt: '2026-11-12T10:30:00.000Z' });
assert.deepEqual(groupMeetings([later, late], 'Asia/Dubai', now).map((g) => g.key), ['today', 'later']);

// cancelled and ended dropped, sorted by start
const ended = mk({ id: 'ended', startAt: '2026-11-07T10:00:00.000Z', endAt: '2026-11-07T11:00:00.000Z' });
const cancelled = mk({ id: 'c', status: 'cancelled', startAt: '2026-11-08T10:00:00.000Z', endAt: '2026-11-08T10:30:00.000Z' });
assert.deepEqual(upcoming([later, cancelled, ended, late], now).map((m) => m.id), ['late', 'later']);
assert.deepEqual(soon48h([later, late], now).map((m) => m.id), ['late']);
// started yesterday, still running = today
const running = mk({ id: 'run', startAt: '2026-11-06T23:00:00.000Z', endAt: '2026-11-07T13:00:00.000Z' });
assert.deepEqual(groupMeetings([running], 'UTC', now).map((g) => g.key), ['today']);

// dayLabel
assert.equal(dayLabel(late.startAt, 'Asia/Dubai', now), 'Today');
assert.equal(dayLabel(late.startAt, 'Asia/Kolkata', now), 'Tomorrow');
assert.equal(dayLabel(later.startAt, 'Asia/Dubai', now), 'Thu 12 Nov');

// joinState boundaries (start 13:15, end 13:45)
const s = ms('2026-11-07T13:15:00.000Z');
const j = (extra: Partial<Meeting>, at: number) => joinState(mk({ meetUrl: 'https://meet.google.com/x', ...extra }), at);
assert.equal(joinState(mk({}), s), 'none'); // no url
assert.equal(j({ status: 'cancelled' }, s), 'none');
assert.equal(j({}, s - 10 * 60_000 - 1), 'later');
assert.equal(j({}, s - 10 * 60_000), 'soon');
assert.equal(j({}, s - 1), 'soon');
assert.equal(j({}, s), 'live');
assert.equal(j({}, ms('2026-11-07T13:45:00.000Z') - 1), 'live');
assert.equal(j({}, ms('2026-11-07T13:45:00.000Z')), 'none');

// defaultStart rounding
assert.deepEqual(defaultStart('Asia/Kolkata', ms('2026-11-07T08:37:00.000Z')), { date: '2026-11-07', time: '14:30' }); // 14:07 IST
assert.deepEqual(defaultStart('Asia/Kolkata', ms('2026-11-07T18:10:00.000Z')), { date: '2026-11-08', time: '00:00' }); // 23:40 IST -> tomorrow
assert.deepEqual(defaultStart('UTC', ms('2026-11-07T14:28:30.000Z')), { date: '2026-11-07', time: '14:30' });
assert.deepEqual(defaultStart('UTC', ms('2026-11-07T14:30:00.000Z')), { date: '2026-11-07', time: '15:00' });

// formatting helpers
assert.equal(fmtDuration(30), '30 min');
assert.equal(fmtDuration(60), '1 h');
assert.equal(fmtDuration(90), '1 h 30 min');
assert.equal(reminderLabel([]), 'No reminder');
assert.equal(reminderLabel([10, 1440]), '1 day, 10 min');
assert.equal(zoneCity('Asia/Kolkata'), 'Kolkata');
assert.equal(zoneCity('America/New_York'), 'New York');
assert.equal(zoneCity('UTC'), 'UTC');
assert.equal(zoneCity('Bad/Zone'), 'Kolkata');
assert.deepEqual(zoneChoices('Asia/Dubai'), ['Asia/Dubai', 'Asia/Kolkata', 'Asia/Kuwait', 'UTC']);
assert.deepEqual(sourceMeta('claude-code'), { label: 'Claude Code', tone: 'primary' });
assert.deepEqual(sourceMeta('bot'), { label: 'WhatsApp', tone: 'success' });
assert.deepEqual(sourceMeta('app'), { label: 'Nudge', tone: 'neutral' });
assert.equal(attendeeLabel({ email: 'a@b.co' }), 'a@b.co');
assert.equal(attendeeLabel({}), 'Guest');
assert.equal(attendeeInitials({ name: 'Ada Lovelace' }), 'AL');
assert.equal(attendeeInitials({ email: 'sam@x.io' }), 'SX');

// validateDraft
const base: NewMeetingDraft = { title: 'Sync', date: '2026-11-08', time: '10:00', durationMin: 30, tz: 'Asia/Kolkata', attendees: [], notes: '', reminderMinutes: [10] };
assert.equal(validateDraft(base, now), null);
assert.equal(validateDraft({ ...base, title: '  ' }, now), 'Give it a title.');
assert.equal(validateDraft({ ...base, title: 'x'.repeat(121) }, now), 'Keep the title under 120 characters.');
assert.equal(validateDraft({ ...base, date: '' }, now), 'Pick a date and time.');
assert.equal(validateDraft({ ...base, time: '9:00' }, now), 'Pick a date and time.');
assert.equal(validateDraft({ ...base, date: '2026-11-07', time: '10:00' }, now), 'That time has passed.');
assert.equal(validateDraft({ ...base, attendees: [{ email: 'nope' }] }, now), 'Check the email address.');
assert.equal(validateDraft({ ...base, attendees: Array.from({ length: 21 }, () => ({ name: 'x' })) }, now), 'Up to 20 people.');

// toCreateBody
const body = toCreateBody({ ...base, title: ' Sync ', notes: '  ' });
assert.deepEqual(body, {
  title: 'Sync', start: '2026-11-08T04:30:00.000Z', durationMin: 30, tz: 'Asia/Kolkata', attendees: undefined, notes: undefined,
  reminderMinutes: [10], createdVia: 'app',
});

console.log('test_meetings_view: ok');
