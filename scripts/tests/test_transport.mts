import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { createLinkCode, redeemLinkCode, getLink, getLinkByUid, updateLink, unlink, listLinks } from '../../lib/wa/links';
import { getSession, saveSession, claimMessage } from '../../lib/wa/sessions';
import { parseForwarded, verifySignature } from '../../lib/wa/inbound';
import { sendText, sendButtons, sendList, sendTemplate, sendReaction, markRead, fetchMedia, windowOpen, dryRunOutbox } from '../../lib/wa/send';
import type { ForwardedEvent } from '../../lib/wa/types';

process.env.NUDGE_WA_NUMBER = '96560091617';
process.env.NUDGE_FORWARD_SECRET = 'test-secret';
const db = adminDb();

// ---- link codes
const a = await createLinkCode('uidA', 'Asia/Dubai');
assert.match(a.code, /^[A-HJ-NP-Z2-9]{6}$/);
assert.equal(a.waUrl, `https://wa.me/96560091617?text=${encodeURIComponent('LINK ' + a.code)}`);
const doc = (await db.doc(`waLinkCodes/${a.code}`).get()).data()!;
assert.equal(doc.uid, 'uidA');
assert.equal(doc.usedAt, null);

assert.deepEqual(await redeemLinkCode('971500000001', 'ZZZZZZ'), { ok: false, reason: 'invalid' });
const r1 = await redeemLinkCode('971500000001', a.code.toLowerCase());
assert.ok(r1.ok);
if (r1.ok) {
  assert.equal(r1.link.uid, 'uidA');
  assert.equal(r1.link.timezone, 'Asia/Dubai');
  assert.equal(r1.link.checkinTime, '08:00');
  assert.equal(r1.link.recapTime, '21:00');
  assert.equal(r1.link.friendAlerts, true);
  assert.equal(r1.link.muted, false);
}
assert.equal((await getLink('971500000001'))?.uid, 'uidA');
assert.equal((await getLinkByUid('uidA'))?.waId, '971500000001');
const u = (await db.doc('users/uidA').get()).data()!;
assert.equal(u.whatsapp.waId, '971500000001');
assert.equal(u.timezone, 'Asia/Dubai');

// reuse
assert.deepEqual(await redeemLinkCode('971500000002', a.code), { ok: false, reason: 'invalid' });

// expired
const e = await createLinkCode('uidB');
await db.doc(`waLinkCodes/${e.code}`).update({ expiresAt: Date.now() - 1000 });
assert.deepEqual(await redeemLinkCode('919800000001', e.code), { ok: false, reason: 'expired' });
assert.equal(await getLink('919800000001'), null);

// timezone fallback (no tz in code): India number
const b = await createLinkCode('uidB');
const rb = await redeemLinkCode('919800000001', b.code);
assert.ok(rb.ok && rb.link.timezone === 'Asia/Kolkata');

// relink: same uid, new number -> old waLinks doc removed
await updateLink('971500000001', { checkinTime: '07:00', friendAlerts: false });
assert.equal((await getLink('971500000001'))?.checkinTime, '07:00');
const c = await createLinkCode('uidA', 'Asia/Dubai');
const rc = await redeemLinkCode('971500000009', c.code);
assert.ok(rc.ok);
assert.equal(await getLink('971500000001'), null);
assert.equal((await db.doc('users/uidA').get()).data()!.whatsapp.waId, '971500000009');

// number moves to another account: old account loses pointer
const d = await createLinkCode('uidC', 'Asia/Kuwait');
const rd = await redeemLinkCode('971500000009', d.code);
assert.ok(rd.ok && rd.link.uid === 'uidC');
assert.equal((await db.doc('users/uidA').get()).data()!.whatsapp, undefined);
assert.equal((await getLinkByUid('uidC'))?.waId, '971500000009');

// listLinks skips muted
await updateLink('919800000001', { muted: true });
const ls = (await listLinks()).map((l) => l.waId).sort();
assert.deepEqual(ls, ['971500000009']);

// unlink
await unlink('971500000009');
assert.equal(await getLink('971500000009'), null);
assert.equal((await db.doc('users/uidC').get()).data()!.whatsapp, undefined);

// ---- sessions + dedupe
const s0 = await getSession('555');
assert.deepEqual(s0.turns, []);
await saveSession('555', { turns: [{ role: 'user', text: 'hi', at: 1 }], lastList: ['t1', 't2'], lastAction: { id: 'x', kind: 'add', payload: {}, at: 2 }, updatedAt: 3 });
const s1 = await getSession('555');
assert.deepEqual(s1.lastList, ['t1', 't2']);
assert.equal(s1.lastAction?.id, 'x');
await saveSession('555', { turns: [], lastList: [], updatedAt: 4 });
assert.equal((await getSession('555')).lastAction, undefined);
assert.equal(await claimMessage('wamid.ONE'), true);
assert.equal(await claimMessage('wamid.ONE'), false);
const seen = (await db.doc('waSeen/wamid.ONE').get()).data()!;
assert.ok(seen.expireAt.toMillis() > Date.now() + 47 * 3600_000); // Firestore Timestamp (TTL field)
const race = await Promise.all([claimMessage('wamid.R'), claimMessage('wamid.R'), claimMessage('wamid.R')]);
assert.equal(race.filter(Boolean).length, 1);

// ---- parseForwarded
const mk = (messages: unknown[], extra: Record<string, unknown> = {}): ForwardedEvent => ({
  tenant: 'nudge',
  receivedAt: 1,
  value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '96560091617', phone_number_id: '1367053206492407' },
    contacts: [{ profile: { name: 'Kaif' }, wa_id: '916238952660' }],
    messages,
    ...extra,
  },
});
const base = { from: '916238952660', timestamp: '1762000000' };
const p = parseForwarded(
  mk([
    { ...base, id: 'w1', type: 'text', text: { body: 'gym 6pm' } },
    { ...base, id: 'w2', type: 'audio', audio: { id: 'm1', mime_type: 'audio/ogg; codecs=opus', voice: true } },
    { ...base, id: 'w3', type: 'image', image: { id: 'm2', mime_type: 'image/jpeg', caption: 'ran 5k' } },
    { ...base, id: 'w4', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'done:abc', title: 'Done' } } },
    { ...base, id: 'w5', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'task:xyz', title: 'Call mom', description: 'd' } } },
    { ...base, id: 'w6', type: 'button', button: { payload: 'checkin:start', text: "Let's go" } },
    { ...base, id: 'w7', type: 'reaction', reaction: { message_id: 'wamid.BOT', emoji: '\u{1F44D}' } },
    { ...base, id: 'w8', type: 'sticker', sticker: { id: 'm3' } },
    { ...base, id: 'w9', type: 'unsupported' },
  ]),
);
assert.equal(p.messages.length, 9);
const [t, au, im, ib, il, bt, rx, st, un] = p.messages;
assert.deepEqual([t.type, t.text, t.profileName, t.timestamp], ['text', 'gym 6pm', 'Kaif', 1762000000000]);
assert.deepEqual([au.type, au.media?.id, au.media?.mimeType], ['audio', 'm1', 'audio/ogg; codecs=opus']);
assert.deepEqual([im.type, im.text, im.media?.id], ['image', 'ran 5k', 'm2']);
assert.deepEqual([ib.type, ib.reply], ['interactive', { id: 'done:abc', title: 'Done' }]);
assert.deepEqual([il.type, il.reply], ['interactive', { id: 'task:xyz', title: 'Call mom' }]);
assert.deepEqual([bt.type, bt.reply], ['button', { id: 'checkin:start', title: "Let's go" }]);
assert.deepEqual([rx.type, rx.reaction], ['reaction', { emoji: '\u{1F44D}', messageId: 'wamid.BOT' }]);
assert.equal(st.type, 'other');
assert.equal(un.type, 'other');
const ps = parseForwarded(mk([], { statuses: [{ id: 'w1', status: 'delivered' }] }));
assert.equal(ps.messages.length, 0);
assert.equal(ps.statuses.length, 1);
assert.deepEqual(parseForwarded({ tenant: 'nudge', receivedAt: 1, value: {} }), { messages: [], statuses: [] });

// ---- verifySignature
const raw = JSON.stringify(mk([]));
const sig = createHmac('sha256', 'test-secret').update(raw).digest('hex');
assert.equal(verifySignature(raw, sig), true);
assert.equal(verifySignature(raw, 'sha256=' + sig), true);
assert.equal(verifySignature(raw + ' ', sig), false);
assert.equal(verifySignature(raw, 'deadbeef'), false);
assert.equal(verifySignature(raw, null), false);

// ---- dry-run outbox
const out = dryRunOutbox();
out.length = 0;
const id1 = await sendText('916238952660', 'hello', 'wamid.X');
assert.ok(id1 && id1.startsWith('wamid.'));
await sendButtons('1', 'pick', [
  { id: 'a', title: 'A very long button title indeed' },
  { id: 'b', title: 'B' }, { id: 'c', title: 'C' }, { id: 'd', title: 'D' },
]);
const btn = out[1].payload as { interactive: { action: { buttons: { reply: { title: string } }[] } } };
assert.equal(btn.interactive.action.buttons.length, 3);
assert.ok(btn.interactive.action.buttons[0].reply.title.length <= 20);
await sendList('1', 'body', 'Open', Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, title: 'T'.repeat(40), description: 'D'.repeat(100) })));
const lst = out[2].payload as { interactive: { action: { sections: { rows: { title: string; description: string }[] }[] } } };
assert.equal(lst.interactive.action.sections[0].rows.length, 10);
assert.ok(lst.interactive.action.sections[0].rows[0].title.length <= 24);
assert.ok(lst.interactive.action.sections[0].rows[0].description.length <= 72);
await sendTemplate('1', 'nudge_checkin', ['Kaif', '3'], { buttonPayloads: ['checkin:start', 'checkin:skip'] });
const tp = out[3].payload as { template: { components: { type: string; sub_type?: string; index?: string }[] } };
assert.equal(tp.template.components.length, 3);
assert.equal(tp.template.components[2].sub_type, 'quick_reply');
assert.equal(tp.template.components[2].index, '1');
await sendReaction('1', 'wamid.X', '\u{1F44D}');
await markRead('wamid.X', true);
assert.deepEqual((out[5].payload as { typing_indicator: unknown }).typing_indicator, { type: 'text' });
assert.equal((await fetchMedia('m1')).data.length > 0, true);
assert.equal(out.map((o) => o.kind).join(','), 'text,buttons,list,template,reaction,read,fetchMedia');

// ---- windowOpen
const now = Date.now();
assert.equal(windowOpen(now - 3600_000, now), true);
assert.equal(windowOpen(now - 24 * 3600_000, now), false);
assert.equal(windowOpen(now - (24 * 60 - 6) * 60_000, now), true);
assert.equal(windowOpen(now - (24 * 60 - 4) * 60_000, now), false);
assert.equal(windowOpen(0, now), false);

console.log('TRANSPORT OK');
