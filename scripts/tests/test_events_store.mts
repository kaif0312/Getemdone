// Emulator test: events through the real store and routes (create, reminders, hidden reminder tasks, repeat roll, cancel one / all,
// update, calendar mirror, ICS feed). Run:
//   FIRESTORE_PORT=8885 bash scripts/test-emulator.sh scripts/tests/test_events_store.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { authDeps } from '../../lib/server/appAuth';
import * as ev from '../../lib/server/events';
import * as mtg from '../../lib/server/meetings';
import { listToday, listOpen, listCalendar } from '../../lib/server/tasks';
import { realStore } from '../../lib/server/googleCal';
import { calendarEntries } from '../../lib/server/calendarEvents';
import { buildIcs } from '../../lib/server/ics';
import { wallToMs } from '../../lib/events/rules';
import { POST, GET } from '../../app/api/events/route';
import { GET as GET_ONE, PATCH, DELETE } from '../../app/api/events/[id]/route';
import { POST as POST_MEETINGS, GET as GET_MEETINGS } from '../../app/api/meetings/route';

const db = adminDb();
authDeps.verify = async (t) => { if (!t.startsWith('tok_')) throw new Error('bad'); return t.slice(4); };
const IST = 'Asia/Kolkata';
await db.doc('users/evowner').set({ displayName: 'Owner', timezone: IST });
await db.doc('users/evother').set({ displayName: 'Other', timezone: IST });
const auth = (u = 'evowner') => ({ authorization: `Bearer tok_${u}` });
const H = 3_600_000;
const now = Date.now();
const wall = (ms: number) => new Date(ms).toISOString();
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const live = async (ids: string[]) => (await Promise.all(ids.map((id) => db.doc(`tasks/${id}`).get()))).filter((s) => s.exists && s.data()!.deleted !== true);

// ---------- one-off ----------
const start = now + 5 * H;
let r = await POST(new Request('http://x/api/events', { method: 'POST', headers: auth(), body: JSON.stringify({ title: 'Physio', start: wall(start), durationMin: 60, tz: IST, createdVia: 'app' }) }));
assert.equal(r.status, 201);
const e1 = await r.json();
assert.equal(e1.kind, 'event');
assert.equal(e1.meetUrl, undefined, 'no Meet link');
assert.deepEqual(e1.attendees, []);
assert.equal(e1.attendeeUids, undefined, 'helper fields are not exposed');
assert.equal(Date.parse(e1.endAt) - Date.parse(e1.startAt), H);
assert.deepEqual(e1.reminderMinutes, [30]);
const d1 = (await db.doc(`meetings/${e1.id}`).get()).data()!;
assert.equal(d1.reminderTaskIds.length, 1);
assert.equal(d1.recurring, false);
const rt = (await db.doc(`tasks/${d1.reminderTaskIds[0]}`).get()).data()!;
assert.equal(rt.reminderOf, e1.id);
assert.equal(rt.remindAt, start - 30 * 60_000);
assert.equal(rt.remindFor, start);
assert.match(rt.text, /^Physio at \d+:\d\d (AM|PM)$/);

// the reminder-only task is not a task anywhere the user looks
assert.equal((await listToday('evowner')).length, 0);
assert.equal((await listOpen('evowner')).length, 0);
assert.equal((await listCalendar('evowner')).length, 0);

// calendar mirror: the event with its real length, once (no duplicate from its reminder task)
const mirror = await realStore.openTasks('evowner');
assert.equal(mirror.events!.length, 1);
const entries = calendarEntries({ tasks: mirror.tasks, events: mirror.events, tz: IST, now });
assert.equal(entries.length, 1, 'the reminder task did not become a second calendar entry');
assert.equal(entries[0].endMs! - entries[0].startMs!, H);
assert.match(buildIcs(entries, { name: 'Nudge', now }), /SUMMARY:Physio/);

// not a meeting: GET /api/meetings does not list it, GET /api/events does
let g: Response = await GET_MEETINGS(new Request('http://x/api/meetings', { headers: auth() }));
assert.equal((await g.json()).meetings.length, 0);
g = await GET(new Request('http://x/api/events', { headers: auth() }));
let list = (await g.json()).events;
assert.equal(list.length, 1);
assert.equal(list[0].next.startAt, wall(start));
g = await GET(new Request('http://x/api/events', { headers: auth('evother') }));
assert.equal((await g.json()).events.length, 0);

// POST /api/meetings with kind:'event' makes the same thing
r = await POST_MEETINGS(new Request('http://x/api/meetings', { method: 'POST', headers: auth(), body: JSON.stringify({ kind: 'event', title: 'Dinner', start: wall(now + 30 * H), tz: IST, createdVia: 'app' }) }));
assert.equal(r.status, 201);
const dinner = await r.json();
assert.equal(dinner.kind, 'event');
assert.equal(Date.parse(dinner.endAt) - Date.parse(dinner.startAt), H, 'default length 60');
// ...and cancelling it through the meetings route works (events cancel through their own module)
const del0 = await (await import('../../app/api/meetings/[id]/route')).DELETE(new Request('http://x', { method: 'DELETE', headers: auth() }), ctx(dinner.id));
assert.equal(del0.status, 200);
assert.equal((await del0.json()).status, 'cancelled');

// validation + auth + ownership
assert.equal((await POST(new Request('http://x', { method: 'POST', body: '{}' }))).status, 401);
assert.equal((await POST(new Request('http://x', { method: 'POST', headers: auth(), body: JSON.stringify({ title: 'x', start: wall(now - 5 * H), createdVia: 'app' }) }))).status, 400);
assert.equal((await GET_ONE(new Request('http://x', { headers: auth('evother') }), ctx(e1.id))).status, 404);
assert.equal((await DELETE(new Request('http://x', { method: 'DELETE', headers: auth('evother') }), ctx(e1.id))).status, 404);

// edit: move + longer; reminders rebuilt for the new time
r = await PATCH(new Request('http://x', { method: 'PATCH', headers: auth(), body: JSON.stringify({ start: wall(start + 2 * H), durationMin: 90 }) }), ctx(e1.id));
assert.equal(r.status, 200);
const moved = await r.json();
assert.equal(Date.parse(moved.endAt) - Date.parse(moved.startAt), 90 * 60_000);
const d1b = (await db.doc(`meetings/${e1.id}`).get()).data()!;
assert.equal((await live(d1.reminderTaskIds)).length, 0, 'the old reminder is gone');
assert.equal(d1b.reminderTaskIds.length, 1);
assert.equal((await db.doc(`tasks/${d1b.reminderTaskIds[0]}`).get()).data()!.remindFor, start + 2 * H);

// cancel: reminders go, not listed
r = await DELETE(new Request('http://x', { method: 'DELETE', headers: auth() }), ctx(e1.id));
assert.equal(r.status, 200);
assert.equal((await r.json()).status, 'cancelled');
assert.equal((await live(d1b.reminderTaskIds)).length, 0);
g = await GET(new Request('http://x/api/events', { headers: auth() }));
assert.equal((await g.json()).events.length, 0);
assert.equal((await realStore.openTasks('evowner')).events!.length, 0);

// ---------- repeat ----------
// A Tuesday 6pm class, weekly. Start from "now" so the test works on any day: anchor on the next matching day.
const dayOf = (ms: number) => new Date(ms + 5.5 * H).getUTCDay();
const wd = dayOf(now + 2 * 86_400_000);
r = await POST(new Request('http://x', { method: 'POST', headers: auth(), body: JSON.stringify({ title: 'Music class', start: new Date(wallToMs(new Date(now + 2 * 86_400_000 + 5.5 * H).toISOString().slice(0, 10), '18:00', IST)).toISOString(), durationMin: 60, tz: IST, repeat: { freq: 'weekly', days: [wd] }, createdVia: 'bot' }) }));
assert.equal(r.status, 201);
const series = await r.json();
assert.deepEqual(series.repeat, { freq: 'weekly', days: [wd] });
let sd = (await db.doc(`meetings/${series.id}`).get()).data()!;
assert.equal(sd.recurring, true);
assert.equal(sd.reminderTaskIds.length, 1, 'only the NEXT occurrence has a reminder task');
assert.equal(sd.remindersFor, Date.parse(series.startAt));
const firstRem = sd.reminderTaskIds[0];

// mirror: one entry per occurrence in the 90-day window, each with a stable key and the real length
const m2 = await realStore.openTasks('evowner');
const ent = calendarEntries({ tasks: m2.tasks, events: m2.events, tz: IST, now });
assert.ok(ent.length >= 12 && ent.length <= 14, `weekly over 90 days, got ${ent.length}`);
assert.equal(new Set(ent.map((x) => x.taskId)).size, ent.length);
assert.ok(ent.every((x) => x.endMs! - x.startMs! === H));

// roll: nothing to do while the first occurrence is ahead
assert.deepEqual(await ev.rollEventReminders(now), { checked: 1, rolled: 0, failed: 0 });
// after the first occurrence started, the reminder moves a week on
const afterFirst = Date.parse(series.startAt) + 10 * 60_000;
const rolled = await ev.rollEventReminders(afterFirst);
assert.deepEqual(rolled, { checked: 1, rolled: 1, failed: 0 });
sd = (await db.doc(`meetings/${series.id}`).get()).data()!;
assert.equal(sd.remindersFor, Date.parse(series.startAt) + 7 * 86_400_000); // Kolkata has no DST
assert.equal(sd.reminderTaskIds.length, 1);
assert.notEqual(sd.reminderTaskIds[0], firstRem);
assert.equal((await live([firstRem])).length, 0, 'the old occurrence\'s reminder is removed');
// a second cron run in the same window does nothing (claimed)
assert.equal((await ev.rollEventReminders(afterFirst + 15 * 60_000)).rolled, 0);

// cancel ONE occurrence: that day is skipped, the series lives on
const nextStart = sd.remindersFor as number;
const day = (ms: number) => new Date(ms + 5.5 * H).toISOString().slice(0, 10);
const skipped = (await ev.cancelEvent('evowner', series.id, { date: day(nextStart) }, afterFirst))!; // simulated clock: just after the first occurrence
assert.deepEqual(skipped.exceptions, [day(nextStart)]);
assert.equal(skipped.status, 'scheduled');
sd = (await db.doc(`meetings/${series.id}`).get()).data()!;
assert.equal(sd.remindersFor, nextStart + 7 * 86_400_000, 'reminders jump to the occurrence after the skipped one');
const m3 = await realStore.openTasks('evowner');
assert.ok(!calendarEntries({ tasks: m3.tasks, events: m3.events, tz: IST, now: afterFirst }).some((x) => x.startMs === nextStart), 'the skipped day is gone from the mirror');
list = (await (await GET(new Request('http://x/api/events', { headers: auth() }))).json()).events;
assert.equal(list.length, 1);
assert.equal(list[0].next.startAt, series.startAt, 'real clock: the first occurrence is still the next one');

// the route takes the same ?date= (a far occurrence, real clock)
const far = nextStart + 21 * 86_400_000;
r = await DELETE(new Request(`http://x?date=${day(far)}`, { method: 'DELETE', headers: auth() }), ctx(series.id));
assert.deepEqual((await r.json()).exceptions, [day(nextStart), day(far)]);

// cancel the whole series
r = await DELETE(new Request('http://x', { method: 'DELETE', headers: auth() }), ctx(series.id));
assert.equal((await r.json()).status, 'cancelled');
sd = (await db.doc(`meetings/${series.id}`).get()).data()!;
assert.equal((await live(sd.reminderTaskIds ?? [])).length, 0);
assert.equal((await db.collection('tasks').where('reminderOf', '==', series.id).get()).docs.filter((d) => d.data().deleted !== true).length, 0, 'no live reminder task is left for the series');
assert.deepEqual(await ev.rollEventReminders(afterFirst), { checked: 0, rolled: 0, failed: 0 });

// a meeting is untouched by all of this
const mm = await mtg.createMeeting('evowner', { title: 'Sync', start: wall(now + 4 * H), createdVia: 'app' });
assert.equal(mm.meeting.kind, undefined);
assert.equal((await (await GET_MEETINGS(new Request('http://x/api/meetings', { headers: auth() }))).json()).meetings.length, 1);

console.log('test_events_store: all passed');
