// Calendar sync: which tasks become events, the ICS writer, signed OAuth state, the Google sync (fake HTTP + fake store),
// and the WhatsApp /sync command. No Firestore, no network.
//   npx tsx scripts/tests/test_calendar.mts
import assert from 'node:assert/strict';
import type { Task } from '../../lib/types';
import { eventForTask, eventsForTasks, titleOf } from '../../lib/server/calendarEvents';
import { buildIcs, fold, icsText } from '../../lib/server/ics';
import { MAX_WRITES_PER_SYNC, eventId, signState, syncUser, verifyState, type GoogleDeps, type SyncStore } from '../../lib/server/googleCal';
import type { CalendarLink, GoogleLink } from '../../lib/server/calendarLink';
import { parseFast } from '../../lib/bot/fastpath';
import { syncLines, Ctx } from '../../lib/bot/actions';
import { makeFake } from './fakes';

process.env.NUDGE_FORWARD_SECRET = 'test-secret';
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'csec';

const TZ = 'Asia/Dubai'; // UTC+4, no DST
const NOW = Date.parse('2026-11-05T08:00:00Z'); // 12:00 Dubai
const task = (id: string, extra: Partial<Task>): Task => ({ id, userId: 'u1', text: id, isPrivate: false, completed: false, createdAt: 1, completedAt: null, ...extra } as Task);

// ---------- events ----------
{
  const gym = eventForTask(task('gym', { text: 'Gym', deferredTo: '2026-11-06T18:00' }), TZ)!;
  assert.equal(gym.startMs, Date.parse('2026-11-06T14:00:00Z'), 'slotted time is the user\'s wall clock (18:00 Dubai = 14:00Z)');
  assert.equal(gym.endMs! - gym.startMs!, 30 * 60_000);
  assert.equal(gym.date, undefined);

  const dl = eventForTask(task('dl', { text: 'Tax', dueDate: Date.parse('2026-11-10T19:59:00Z') }), TZ)!; // 23:59 Dubai
  assert.equal(dl.date, '2026-11-10');
  assert.equal(dl.title, 'Due: Tax');

  const dt = eventForTask(task('dt', { text: 'Call', dueDate: Date.parse('2026-11-10T11:00:00Z') }), TZ)!;
  assert.equal(dt.startMs, Date.parse('2026-11-10T11:00:00Z'));

  const rem = eventForTask(task('rem', { text: 'Pills', remindFor: Date.parse('2026-11-06T05:00:00Z') }), TZ)!;
  assert.equal(rem.startMs, Date.parse('2026-11-06T05:00:00Z'));

  assert.equal(eventForTask(task('bare', {}), TZ), null, 'no time = no event');
  assert.equal(eventForTask(task('plain', { deferredTo: '2026-11-06' }), TZ), null, 'a date alone is not an event');
  assert.equal(eventForTask(task('done', { deferredTo: '2026-11-06T18:00', completed: true }), TZ), null);
  assert.equal(eventForTask(task('del', { deferredTo: '2026-11-06T18:00', deleted: true }), TZ), null);
  assert.equal(titleOf({ text: 'e1:abcdef' }), 'Nudge task');
  assert.equal(titleOf({ text: '  a\n b  ' }), 'a b');

  // hash moves with anything shown
  const a = eventForTask(task('x', { text: 'A', deferredTo: '2026-11-06T18:00' }), TZ)!;
  const b = eventForTask(task('x', { text: 'B', deferredTo: '2026-11-06T18:00' }), TZ)!;
  const c = eventForTask(task('x', { text: 'A', deferredTo: '2026-11-06T19:00' }), TZ)!;
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  assert.equal(a.hash, eventForTask(task('x', { text: 'A', deferredTo: '2026-11-06T18:00' }), TZ)!.hash);

  // window: yesterday .. +90 days, sorted
  const ev = eventsForTasks([
    task('far', { deferredTo: '2027-06-01T10:00' }), task('old', { deferredTo: '2026-10-01T10:00' }),
    task('b', { deferredTo: '2026-11-07T10:00' }), task('a', { deferredTo: '2026-11-06T10:00' }),
  ], TZ, NOW);
  assert.deepEqual(ev.map((e) => e.taskId), ['a', 'b']);
}

// ---------- ICS ----------
{
  assert.equal(icsText('a,b;c\\d\ne'), 'a\\,b\\;c\\\\d\\ne');
  const long = 'x'.repeat(200);
  for (const l of fold('SUMMARY:' + long).split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75, 'folded line within 75 octets');
  const ar = 'مهمة'.repeat(30);
  const folded = fold('SUMMARY:' + ar);
  assert.equal(folded.replace(/\r\n /g, ''), 'SUMMARY:' + ar, 'unfolding restores it; no UTF-8 char split');
  const ics = buildIcs(eventsForTasks([
    task('t1', { text: 'Gym, legs; heavy', deferredTo: '2026-11-06T18:00' }),
    task('t2', { text: 'Tax', dueDate: Date.parse('2026-11-10T19:59:00Z') }),
  ], TZ, NOW), { name: 'Nudge', now: NOW, url: 'https://x.test' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.ok(ics.includes('SUMMARY:Gym\\, legs\\; heavy'));
  assert.ok(ics.includes('DTSTART:20261106T140000Z') && ics.includes('DTEND:20261106T143000Z'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261110') && ics.includes('DTEND;VALUE=DATE:20261111'));
  assert.ok(ics.includes('UID:t1@getemdone.vercel.app'));
  assert.ok(!/[^\r]\n/.test(ics.replace(/\r\n/g, '')), 'CRLF only');
}

// ---------- signed state ----------
{
  const s = signState('u1', 'wa', 1000, 60_000);
  assert.deepEqual({ ...verifyState(s, 2000), n: '' }, { uid: 'u1', via: 'wa', exp: 61_000, n: '' });
  assert.equal(verifyState(s, 61_001), null, 'expired');
  assert.equal(verifyState(s.slice(0, -2) + 'ab', 2000), null, 'tampered');
  assert.equal(verifyState('junk', 2000), null);
  const [part] = s.split('.');
  assert.equal(verifyState(part + '.' + 'a'.repeat(64), 2000), null);
}

// ---------- the Google sync ----------
type Call = { method: string; url: string; body?: any };
function harness(tasks: Task[], g: Partial<GoogleLink> = {}) {
  const calls: Call[] = [];
  const events = new Map<string, any>(); // id -> body
  let link: CalendarLink = { google: { refreshToken: 'rt', calendarId: 'cal1', scope: 's', connectedAt: 1, synced: {}, ...g } };
  let refresh: 'ok' | 'revoked' = 'ok';
  const deps: GoogleDeps = {
    now: () => NOW,
    fetch: async (url, init) => {
      const method = init?.method ?? 'GET';
      const body = init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init?.body;
      calls.push({ method, url, body });
      const j = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });
      if (url.includes('oauth2.googleapis.com/token')) return refresh === 'ok' ? j({ access_token: 'at' }) : j({ error: 'invalid_grant' }, 400);
      const m = /\/calendars\/cal1\/events(?:\/([0-9a-f]+))?$/.exec(url);
      if (!m) return j({}, 404);
      if (method === 'POST') { if (events.has(body.id)) return j({}, 409); events.set(body.id, body); return j(body); }
      if (method === 'PUT') { if (!events.has(m[1])) return j({}, 404); events.set(m[1], body); return j(body); }
      if (method === 'DELETE') { if (!events.has(m[1])) return j({}, 404); events.delete(m[1]); return new Response(null, { status: 204 }); }
      return j({}, 400);
    },
  };
  const store: SyncStore = {
    getLink: async () => link,
    patchGoogle: async (_u, patch) => { link = { ...link, google: { ...link.google!, ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === null ? undefined : v])) } as GoogleLink }; },
    openTasks: async () => ({ tasks, tz: TZ }),
  };
  return { deps, store, calls, events, get link() { return link; }, setRefresh: (r: 'ok' | 'revoked') => { refresh = r; } };
}

{
  const tasks = [task('a', { text: 'Gym', deferredTo: '2026-11-06T18:00' }), task('b', { text: 'Tax', dueDate: Date.parse('2026-11-10T19:59:00Z') }), task('c', { text: 'no time' })];
  const h = harness(tasks);
  let r = await syncUser('u1', h.deps, h.store);
  assert.equal(r.status, 'ok');
  assert.deepEqual([r.created, r.updated, r.deleted], [2, 0, 0]);
  assert.equal(h.events.size, 2);
  const ga = h.events.get(eventId('a'));
  assert.equal(ga.summary, 'Gym');
  assert.deepEqual(ga.start, { dateTime: '2026-11-06T14:00:00.000Z', timeZone: TZ });
  assert.deepEqual(h.events.get(eventId('b')).start, { date: '2026-11-10' });
  assert.equal(h.events.get(eventId('b')).end.date, '2026-11-11');
  assert.equal(ga.extendedProperties.private.nudgeTask, 'a');
  assert.ok(h.link.google!.lastSyncAt);

  // second run changes nothing and writes nothing to Google
  const before = h.calls.filter((c) => c.method !== 'POST' || !c.url.includes('oauth2')).length;
  r = await syncUser('u1', h.deps, h.store);
  assert.deepEqual([r.created, r.updated, r.deleted], [0, 0, 0]);
  assert.equal(h.calls.filter((c) => c.method !== 'POST' || !c.url.includes('oauth2')).length, before + 0, 'only the token call');

  // edit -> one update; complete -> one delete
  tasks[0] = task('a', { text: 'Gym legs', deferredTo: '2026-11-06T19:00' });
  tasks[1] = task('b', { text: 'Tax', dueDate: Date.parse('2026-11-10T19:59:00Z'), completed: true });
  r = await syncUser('u1', h.deps, h.store);
  assert.deepEqual([r.created, r.updated, r.deleted], [0, 1, 1]);
  assert.equal(h.events.get(eventId('a')).summary, 'Gym legs');
  assert.equal(h.events.has(eventId('b')), false);
  assert.deepEqual(Object.keys(h.link.google!.synced), ['a']);

  // the user deleted our event by hand in Google: the next change re-creates it
  h.events.delete(eventId('a'));
  tasks[0] = task('a', { text: 'Gym legs!', deferredTo: '2026-11-06T19:00' });
  r = await syncUser('u1', h.deps, h.store);
  assert.equal(h.events.get(eventId('a')).summary, 'Gym legs!');

  // retried insert (we crashed before saving the map): 409 -> update, no duplicate
  const h2 = harness([task('a', { text: 'Gym', deferredTo: '2026-11-06T18:00' })]);
  h2.events.set(eventId('a'), { id: eventId('a'), summary: 'old' });
  r = await syncUser('u1', h2.deps, h2.store);
  assert.equal(h2.events.size, 1);
  assert.equal(h2.events.get(eventId('a')).summary, 'Gym');
}

{
  // revoked access: marks the link, never throws, never touches Google again
  const h = harness([task('a', { deferredTo: '2026-11-06T18:00' })]);
  h.setRefresh('revoked');
  const r = await syncUser('u1', h.deps, h.store);
  assert.equal(r.status, 'revoked');
  assert.equal(h.link.google!.revoked, true);
  assert.ok(h.link.google!.lastError);
  assert.equal((await syncUser('u1', h.deps, h.store)).status, 'revoked');
  assert.equal(h.calls.filter((c) => c.url.includes('/events')).length, 0);

  const none = harness([]);
  none.store.getLink = async () => ({});
  assert.equal((await syncUser('u1', none.deps, none.store)).status, 'not_connected');
}

{
  // a big backlog is spread over several runs
  const many = Array.from({ length: MAX_WRITES_PER_SYNC + 10 }, (_, i) => task('t' + i, { deferredTo: '2026-11-06T18:00' }));
  const h = harness(many);
  let r = await syncUser('u1', h.deps, h.store);
  assert.equal(r.created, MAX_WRITES_PER_SYNC);
  assert.equal(r.pending, 10);
  r = await syncUser('u1', h.deps, h.store);
  assert.equal(r.created, 10);
  assert.equal(h.events.size, MAX_WRITES_PER_SYNC + 10);
}

// ---------- WhatsApp /sync ----------
{
  assert.deepEqual(parseFast({ type: 'text', text: '/sync' } as any), { t: 'sync', arg: '' });
  assert.deepEqual(parseFast({ type: 'text', text: '/sync Link' } as any), { t: 'sync', arg: 'link' });
  assert.deepEqual(parseFast({ type: 'text', text: 'sync calendar' } as any), { t: 'sync', arg: '' });
  assert.deepEqual(parseFast({ type: 'text', text: 'connect google calendar' } as any), { t: 'sync', arg: '' });
  assert.equal(parseFast({ type: 'text', text: '/calendar' } as any)?.t, 'unknownCmd', '/calendar belongs to the month/week image command');
}
{
  const f = makeFake();
  let st: any = { feed: null, google: { connected: false } };
  const log: string[] = [];
  f.deps.calendar = {
    status: async () => st,
    ensureFeed: async (_u, rotate) => { log.push('feed' + (rotate ? ':rotate' : '')); st = { ...st, feed: { url: 'https://h/api/cal/T.ics', webcalUrl: 'webcal://h/api/cal/T.ics' } }; return st.feed; },
    removeFeed: async () => { log.push('removeFeed'); st = { ...st, feed: null }; },
    googleAvailable: () => true,
    googleLink: (u) => `https://h/start?u=${u}`,
    disconnectGoogle: async () => { log.push('disconnect'); st = { ...st, google: { connected: false } }; },
    syncNow: async () => ({ status: 'ok', created: 2, updated: 0, deleted: 1 }),
  };
  const user = await f.deps.getUserLite('u1');
  const ctx = new Ctx(f.deps, '9100', (await f.deps.getLink('9100'))!, user, 'Asia/Dubai', { turns: [], lastList: [], updatedAt: 0 }, '2026-11-05', '12:00');

  let out = await syncLines(ctx, '');
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('/sync link') && out[0].includes('/sync google') && out[0].includes('not connected'));

  out = await syncLines(ctx, 'link');
  assert.equal(out.length, 2, 'instructions + the bare URL alone (long-press to copy)');
  assert.equal(out[1], 'https://h/api/cal/T.ics');
  assert.ok(out[0].includes('webcal://h/api/cal/T.ics'));

  out = await syncLines(ctx, 'reset');
  assert.ok(log.includes('feed:rotate') && out[0].includes('old one stopped'));

  out = await syncLines(ctx, 'google');
  assert.equal(out[1], 'https://h/start?u=u1');
  assert.ok(out[0].includes('20 minutes'));

  assert.ok((await syncLines(ctx, 'now'))[0].includes("isn't connected"));
  st = { ...st, google: { connected: true, email: 'a@b.c' } };
  assert.ok((await syncLines(ctx, 'google'))[0].includes('already connected'));
  assert.equal((await syncLines(ctx, 'now'))[0], '✅ Calendar updated: 2 added, 1 removed.');
  assert.ok((await syncLines(ctx, 'off'))[0].startsWith('Done.'));
  assert.deepEqual(log.slice(-2), ['disconnect', 'removeFeed']);
  assert.equal((await syncLines(ctx, 'off'))[0], 'Nothing is connected.');

  f.deps.calendar = { ...f.deps.calendar, googleAvailable: () => false };
  assert.ok((await syncLines(ctx, 'google'))[0].includes('not switched on'));
  delete (f.deps as any).calendar;
  assert.ok((await syncLines(ctx, ''))[0].includes('not available'));
}

console.log('calendar tests ok');
