// Emulator test: create / list / cancel through the routes, with a fake Google Calendar. Run:
//   FIRESTORE_PORT=8885 bash scripts/test-emulator.sh scripts/tests/test_meetings_store.mts
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { authDeps } from '../../lib/server/appAuth';
import * as mtg from '../../lib/server/meetings';
import { deps as apiDeps } from '../../lib/server/meetingsApi';
import { POST, GET } from '../../app/api/meetings/route';
import { DELETE } from '../../app/api/meetings/[id]/route';

process.env.NUDGE_FORWARD_SECRET = 's';
const db = adminDb();
authDeps.verify = async (t) => { if (!t.startsWith('tok_')) throw new Error('bad'); return t.slice(4); };
apiDeps.uidFromWa = async (wa) => (wa === '916238952660' ? 'owner' : null);
await db.doc('users/owner').set({ displayName: 'Owner', timezone: 'Asia/Kolkata' });

const calls: string[] = [];
mtg.gcalDeps.fetch = async (url, init) => {
  calls.push(`${init?.method ?? 'GET'} ${url.split('?')[0]}`);
  if (url.includes('oauth2')) return Response.json({ access_token: 'at' });
  if (init?.method === 'DELETE') return new Response(null, { status: 204 });
  return Response.json({ id: 'ev1', htmlLink: 'https://calendar.google.com/ev1', hangoutLink: 'https://meet.google.com/abc-defg-hij' });
};
const sign = (s: string) => createHmac('sha256', 's').update(s, 'utf8').digest('hex');
const start = new Date(Date.now() + 3 * 3_600_000).toISOString();
const post = (b: object, h: Record<string, string>) => POST(new Request('http://x/api/meetings', { method: 'POST', headers: h, body: JSON.stringify(b) }));
const signed = (b: Record<string, unknown>) => { const raw = JSON.stringify({ ...b, ts: Date.now() }); return POST(new Request('http://x/api/meetings', { method: 'POST', headers: { 'x-nudge-signature': sign(raw) }, body: raw })); };

// not connected: saved + reminded, no link
let r = await signed({ title: 'Meeting with Shamly', start, ownerWa: '916238952660', createdVia: 'claude-code' });
assert.equal(r.status, 201);
let m = await r.json();
assert.equal(m.calendar, 'not_connected');
assert.equal(m.meetUrl, undefined);
assert.equal(m.attendeeUids, undefined, 'helper fields are not exposed');
const doc = (await db.doc(`meetings/${m.id}`).get()).data()!;
assert.equal(doc.reminderTaskIds.length, 2);
const t0 = (await db.doc(`tasks/${doc.reminderTaskIds[0]}`).get()).data()!;
assert.equal(t0.userId, 'owner');
assert.equal(t0.remindFor, Date.parse(start));
assert.match(t0.text, /^Meeting with Shamly at \d+:\d\d (AM|PM)$/);

// connected: Meet link, invite, link in reminder text
Object.assign(process.env, { GCAL_CLIENT_ID: 'c', GCAL_CLIENT_SECRET: 's', GCAL_REFRESH_TOKEN: 'r' });
r = await post({ title: 'Call', start, attendees: [{ name: 'A', email: 'a@x.com', uid: 'friend' }], createdVia: 'app' }, { authorization: 'Bearer tok_owner' });
m = await r.json();
assert.equal(m.calendar, 'ok');
assert.equal(m.meetUrl, 'https://meet.google.com/abc-defg-hij');
assert.equal(m.gcalEventId, 'ev1');
const d2 = (await db.doc(`meetings/${m.id}`).get()).data()!;
assert.deepEqual(d2.attendeeUids, ['friend']);
assert.match((await db.doc(`tasks/${d2.reminderTaskIds[0]}`).get()).data()!.text, /meet\.google\.com/);

// auth + ownership
assert.equal((await post({ title: 'x', start, createdVia: 'app' }, {})).status, 401);
assert.equal((await post({ title: '', start, createdVia: 'app' }, { authorization: 'Bearer tok_owner' })).status, 400);
let g = await GET(new Request('http://x/api/meetings?limit=5', { headers: { authorization: 'Bearer tok_owner' } }));
assert.equal((await g.json()).meetings.length, 2);
g = await GET(new Request('http://x/api/meetings', { headers: { authorization: 'Bearer tok_other' } }));
assert.equal((await g.json()).meetings.length, 0);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
assert.equal((await DELETE(new Request('http://x', { method: 'DELETE', headers: { authorization: 'Bearer tok_other' } }), ctx(m.id))).status, 404);

// cancel: calendar event + reminders go
const del = await DELETE(new Request('http://x', { method: 'DELETE', headers: { authorization: 'Bearer tok_owner' } }), ctx(m.id));
assert.equal(del.status, 200);
assert.equal((await del.json()).status, 'cancelled');
assert.ok(calls.includes('DELETE https://www.googleapis.com/calendar/v3/calendars/primary/events/ev1'));
assert.equal((await db.doc(`tasks/${d2.reminderTaskIds[0]}`).get()).data()!.deleted, true);
g = await GET(new Request('http://x/api/meetings', { headers: { authorization: 'Bearer tok_owner' } }));
assert.equal((await g.json()).meetings.length, 1, 'cancelled meeting is not upcoming');

console.log('test_meetings_store: all passed');
