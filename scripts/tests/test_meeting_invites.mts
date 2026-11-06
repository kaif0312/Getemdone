// Meeting invites over WhatsApp: idempotency, owner / muted skipped, failures never throw, caps, payload shape. Fake sender and
// fake store (no network, no Firestore). The real send path is checked against the dry-run outbox of lib/wa/send.ts.
//   npx tsx scripts/tests/test_meeting_invites.mts
process.env.NUDGE_WA_DRY_RUN = '1';
import assert from 'node:assert/strict';
import { BadRequest, normalizeRequest } from '../../lib/server/meetings';
import * as inv from '../../lib/server/meetingInvites';
import { dryRunOutbox, sendTemplate } from '../../lib/wa/send';
import type { Meeting } from '../../lib/meetings/types';
import type { WaLink } from '../../lib/wa/types';

const NOW = Date.parse('2026-11-06T10:00:00Z');
const meeting = (extra: Partial<Meeting> = {}): Meeting => ({
  id: 'm1', ownerUid: 'owner', title: 'Project sync', startAt: '2026-11-07T17:30:00.000Z', endAt: '2026-11-07T18:00:00.000Z', tz: 'Asia/Kolkata',
  attendees: [{ name: 'Shamly', waId: '919000000001' }], meetUrl: 'https://meet.google.com/abc-defg-hij', status: 'scheduled', createdVia: 'app',
  reminderMinutes: [30, 10], createdAt: '', updatedAt: '', ...extra,
});
const link = (waId: string, extra: Partial<WaLink> = {}): WaLink => ({
  waId, uid: 'u_' + waId, linkedAt: 1, lastInboundAt: 0, timezone: 'Asia/Kolkata', checkinTime: null, recapTime: null, friendAlerts: true, muted: false, ...extra,
});

interface Rig { docs: Map<string, inv.InviteDoc>; sent: { kind: string; to: string; body?: string; name?: string; vars?: string[]; lang?: string; label?: string; url?: string }[]; slots: { used: number } }
function rig(opts: { links?: Record<string, WaLink>; cap?: number; fail?: boolean; throwOn?: string; ownerWa?: string } = {}): Rig {
  const r: Rig = { docs: new Map(), sent: [], slots: { used: 0 } };
  const cap = opts.cap ?? 100;
  Object.assign(inv.deps, {
    now: () => NOW,
    getLink: async (w: string) => opts.links?.[w] ?? null,
    getLinkByUid: async () => (opts.ownerWa ? link(opts.ownerWa) : null),
    inviterName: async () => 'Ibrahim',
    claim: async (id: string, init: inv.InviteDoc) => { const d = r.docs.get(id); if (d && d.status !== 'failed') return false; r.docs.set(id, init); return true; },
    finish: async (id: string, patch: Partial<inv.InviteDoc>) => { r.docs.set(id, { ...r.docs.get(id)!, ...patch }); },
    sentInviteWaIds: async (mid: string) => [...r.docs.values()].filter((d) => d.meetingId === mid && d.kind === 'invite' && d.status === 'sent').map((d) => d.waId),
    reserve: async () => { if (r.slots.used >= cap) return false; r.slots.used++; return true; },
    release: async () => { r.slots.used--; },
    windowOpen: (last: number, now?: number) => !!last && (now ?? NOW) - last < 24 * 3600_000,
    sendText: async (to: string, body: string) => { r.sent.push({ kind: 'text', to, body }); return opts.fail ? null : 'w1'; },
    sendUrlButton: async (to: string, body: string, label: string, url: string) => { r.sent.push({ kind: 'url_button', to, body, label, url }); return opts.fail ? null : 'w2'; },
    sendTemplate: async (to: string, name: string, vars: string[], o?: { language?: string }) => {
      if (opts.throwOn === to) throw new Error('boom');
      r.sent.push({ kind: 'template', to, name, vars, lang: o?.language });
      return opts.fail ? null : 'w3';
    },
    lastSendError: () => (opts.fail ? '132001: Template does not exist' : ''),
  });
  return r;
}

// ---- payload shape: template copy
{
  const c = inv.inviteCopy(meeting(), 'Ibrahim');
  assert.equal(c.template, 'nudge_meeting_invite');
  assert.deepEqual(c.vars, ['Ibrahim', 'Project sync', 'Sat 7 Nov', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']);
  assert.equal(c.button?.url, 'https://meet.google.com/abc-defg-hij');
  const r = inv.reminderCopy(meeting());
  assert.deepEqual(r.vars, ['Project sync', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']);
  assert.equal(inv.inviteCopy(meeting({ meetUrl: undefined }), 'I').button, undefined, 'no link, no button');
  assert.equal(inv.inviteCopy(meeting({ title: 'a\n\n  b   c' }), 'I').vars[1], 'a b c', 'no newlines in variables');
  assert.ok(inv.clean('x'.repeat(100)).length <= 60);
  assert.deepEqual(inv.cancelCopy(meeting(), 'Ibrahim').vars, ['Ibrahim', 'Project sync', 'Sat 7 Nov', '11:00 PM']);
}

// ---- the real Graph payload (dry-run outbox)
{
  await sendTemplate('919000000001', 'nudge_meeting_invite', inv.inviteCopy(meeting(), 'Ibrahim').vars, { language: 'en' });
  const p = dryRunOutbox().at(-1)!.payload as { type: string; template: { name: string; language: { code: string }; components: { type: string; parameters: { type: string; text: string }[] }[] } };
  assert.equal(p.type, 'template');
  assert.equal(p.template.name, 'nudge_meeting_invite');
  assert.equal(p.template.language.code, 'en');
  assert.equal(p.template.components[0].type, 'body');
  assert.equal(p.template.components[0].parameters.length, 5);
  assert.equal(p.template.components[0].parameters[4].text, 'https://meet.google.com/abc-defg-hij');
}

// ---- invite: template when no window; one per person; second call is a no-op
{
  const r = rig();
  let out = await inv.inviteAttendees(meeting());
  assert.deepEqual(out.map((o) => [o.waId, o.status, o.via]), [['919000000001', 'sent', 'template']]);
  assert.equal(r.sent.length, 1);
  assert.equal(r.sent[0].name, 'nudge_meeting_invite');
  assert.equal(r.sent[0].lang, 'en');
  assert.equal(r.docs.get('m1_919000000001')!.status, 'sent');
  out = await inv.inviteAttendees(meeting());
  assert.equal(out[0].status, 'duplicate');
  assert.equal(r.sent.length, 1, 'idempotent: still one message');
  assert.equal(r.slots.used, 1);
}

// ---- inside the 24 h window: URL button, no template slot used; user's language
{
  const r = rig({ links: { '919000000001': link('919000000001', { lastInboundAt: NOW - 3600_000, lang: 'ml' }) } });
  const out = await inv.inviteAttendees(meeting());
  assert.equal(out[0].via, 'url_button');
  assert.equal(r.sent[0].kind, 'url_button');
  assert.equal(r.sent[0].label, 'Join meeting');
  assert.equal(r.sent[0].url, 'https://meet.google.com/abc-defg-hij');
  assert.match(r.sent[0].body!, /^Ibrahim invited you to "Project sync" on Sat 7 Nov at 11:00 PM/);
  assert.equal(r.slots.used, 0);
  // window open but no link yet -> plain text
  const r2 = rig({ links: { '919000000001': link('919000000001', { lastInboundAt: NOW - 1000 }) } });
  await inv.inviteAttendees(meeting({ meetUrl: undefined }));
  assert.equal(r2.sent[0].kind, 'text');
  // window closed with a known language -> template in that language
  const r3 = rig({ links: { '919000000001': link('919000000001', { lang: 'hi' }) } });
  await inv.inviteAttendees(meeting());
  assert.equal(r3.sent[0].lang, 'hi');
}

// ---- skips the owner (by uid and by linked number), duplicates, attendees without a number
{
  const r = rig({ ownerWa: '919000000009' });
  const m = meeting({ attendees: [
    { name: 'Me', waId: '919000000009' }, { name: 'Me2', uid: 'owner', waId: '919000000008' }, { name: 'Mail only', email: 'a@x.com' },
    { name: 'A', waId: '919000000001' }, { name: 'A again', waId: '919000000001' },
  ] });
  const out = await inv.inviteAttendees(m);
  assert.deepEqual(out.map((o) => o.waId), ['919000000001']);
  assert.equal(r.sent.length, 1);
}

// ---- STOP (muted): never messaged, and recorded as skipped
{
  const r = rig({ links: { '919000000001': link('919000000001', { muted: true, lastInboundAt: NOW - 1000 }) } });
  const out = await inv.inviteAttendees(meeting());
  assert.equal(out[0].status, 'skipped_muted');
  assert.equal(r.sent.length, 0);
  assert.equal(r.docs.get('m1_919000000001')!.status, 'skipped_muted');
  assert.equal((await inv.remindAttendees(meeting(), 10))[0].status, 'skipped_muted');
  assert.equal(r.sent.length, 0);
}

// ---- failure never throws; error recorded; slot given back; a failed invite may be retried
{
  const r = rig({ fail: true });
  const out = await inv.inviteAttendees(meeting());
  assert.equal(out[0].status, 'failed');
  assert.equal(r.docs.get('m1_919000000001')!.status, 'failed');
  assert.equal(r.docs.get('m1_919000000001')!.error, '132001: Template does not exist');
  assert.equal(r.slots.used, 0, 'slot released');
  const r2 = rig();
  r2.docs.set('m1_919000000001', { meetingId: 'm1', waId: '919000000001', kind: 'invite', status: 'failed', at: 1 });
  assert.equal((await inv.inviteAttendees(meeting()))[0].status, 'sent');
  // a thrown sender
  const r3 = rig({ throwOn: '919000000001' });
  const o3 = await inv.inviteAttendees(meeting({ attendees: [{ waId: '919000000001' }, { waId: '919000000002' }] }));
  assert.deepEqual(o3.map((o) => o.status), ['failed', 'sent'], 'one failure does not stop the others');
  assert.equal(r3.docs.get('m1_919000000001')!.error, 'boom');
  // the store itself broken
  Object.assign(inv.deps, { inviterName: async () => { throw new Error('db down'); }, getLinkByUid: async () => { throw new Error('db down'); }, claim: async () => { throw new Error('db down'); }, finish: async () => { throw new Error('db down'); } });
  const o4 = await inv.inviteAttendees(meeting());
  assert.equal(o4[0].status, 'failed');
}

// ---- cap respected: no send once the daily template slots are gone
{
  const r = rig({ cap: 1 });
  const out = await inv.inviteAttendees(meeting({ attendees: [{ waId: '919000000001' }, { waId: '919000000002' }] }));
  assert.deepEqual(out.map((o) => o.status), ['sent', 'skipped_cap']);
  assert.equal(r.sent.length, 1);
  assert.equal(r.docs.get('m1_919000000002')!.status, 'skipped_cap');
}

// ---- reminders: per minutes, once each; not after the meeting; cancelled meeting is silent
{
  const r = rig();
  const m = meeting();
  assert.equal((await inv.remindAttendees(m, 30))[0].status, 'sent');
  assert.equal(r.sent[0].name, 'nudge_meeting_reminder');
  assert.deepEqual(r.sent[0].vars, ['Project sync', '11:00 PM (Asia/Kolkata)', 'https://meet.google.com/abc-defg-hij']);
  assert.equal((await inv.remindAttendees(m, 30))[0].status, 'duplicate');
  assert.equal((await inv.remindAttendees(m, 10))[0].status, 'sent', 'another lead time is another reminder');
  assert.equal(r.sent.length, 2);
  assert.ok(r.docs.has('m1_919000000001_r30'));
  assert.deepEqual(await inv.remindAttendees(meeting({ status: 'cancelled' }), 10), []);
  assert.deepEqual(await inv.remindAttendees(meeting({ endAt: '2026-11-05T00:00:00.000Z' }), 10), []);
  assert.deepEqual(await inv.inviteAttendees(meeting({ status: 'cancelled' })), []);
}

// ---- cancellation: only to those who were invited, once
{
  const r = rig();
  const m = meeting({ attendees: [{ waId: '919000000001' }, { waId: '919000000002' }] });
  await inv.inviteAttendees(m);
  r.docs.get('m1_919000000002')!.status = 'failed'; // never got the invite -> no cancellation either
  r.sent.length = 0;
  const out = await inv.cancelAttendees({ ...m, status: 'cancelled' });
  assert.deepEqual(out.map((o) => [o.waId, o.status]), [['919000000001', 'sent']]);
  assert.equal(r.sent[0].name, 'nudge_meeting_cancelled');
  assert.deepEqual(r.sent[0].vars, ['Ibrahim', 'Project sync', 'Sat 7 Nov', '11:00 PM']);
  assert.equal((await inv.cancelAttendees({ ...m, status: 'cancelled' }))[0].status, 'duplicate');
}

// ---- remindForTask ignores tasks that are not meeting reminders (no store access)
await inv.remindForTask('t1', ['x'], 1, 1);
await inv.remindForTask('t1', undefined, 1, 1);

// ---- attendee validation: {name, waId} only
{
  const base = { title: 'Call', start: '2026-11-07 23:00', createdVia: 'bot' as const };
  const a = normalizeRequest({ ...base, attendees: [{ name: 'Shamly', waId: '+91 62389 52660' }, { waId: '(971) 50-123-4567' }] }, NOW).attendees;
  assert.deepEqual(a, [{ name: 'Shamly', waId: '916238952660' }, { waId: '971501234567' }]);
  assert.throws(() => normalizeRequest({ ...base, attendees: [{ name: 'X', waId: '12345' }] }, NOW), BadRequest);
  assert.throws(() => normalizeRequest({ ...base, attendees: [{ waId: '1'.repeat(16) }] }, NOW), /phone/);
  assert.throws(() => normalizeRequest({ ...base, attendees: [{}] }, NOW), /attendee needs/);
}

console.log('meeting invites ok');
