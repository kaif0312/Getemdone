// File vault: parser, naming, allowlist and the save/ack/failure paths. No Firestore or network needed.
//   npx tsx scripts/tests/test_vault.mts
import assert from 'node:assert/strict';
import { parseForwarded } from '../../lib/wa/inbound';
import { cleanName, fileNameFor, handleVault, stamp, vaultUsers, wantsLink, type VaultDeps } from '../../lib/vault/vault';
import { signUploadToken, verifyUploadToken } from '../../lib/vault/link';
import type { InboundMessage } from '../../lib/wa/types';

process.env.NUDGE_VAULT_TZ = 'Asia/Dubai';
process.env.NUDGE_VAULT_ROOT = 'Nudge Vault';

// ---- allowlist parsing
assert.deepEqual(vaultUsers('971501234567:Fairooz, +91 98000 00001:Asha ,bad,:x'), { '971501234567': 'Fairooz', '919800000001': 'Asha' });
assert.deepEqual(vaultUsers(undefined), {});

// ---- parser: document + video + captions
const value = {
  messages: [
    { id: 'wamid.D1', from: '971501234567', timestamp: '1793000000', type: 'document', document: { id: 'm1', mime_type: 'application/pdf', filename: 'Passport Ahmed.pdf', caption: 'Ahmed passport' } },
    { id: 'wamid.V1', from: '971501234567', timestamp: '1793000001', type: 'video', video: { id: 'm2', mime_type: 'video/mp4' } },
    { id: 'wamid.I1', from: '971501234567', timestamp: '1793000002', type: 'image', image: { id: 'm3', mime_type: 'image/jpeg' } },
  ],
};
const { messages } = parseForwarded({ tenant: 'nudge', receivedAt: 1, value });
assert.equal(messages[0].type, 'document');
assert.deepEqual(messages[0].media, { id: 'm1', mimeType: 'application/pdf', filename: 'Passport Ahmed.pdf' });
assert.equal(messages[0].text, 'Ahmed passport');
assert.equal(messages[1].type, 'video');
assert.equal(messages[1].media?.id, 'm2');

// ---- naming
assert.equal(cleanName('  a/b\\c:d*e?"f<g>h|i  '), 'a b c d e f g h i');
assert.equal(cleanName('...hidden'), 'hidden');
assert.equal(cleanName('x'.repeat(200)).length, 80);
const ts = Date.UTC(2026, 10, 4, 21, 5); // 2026-11-04 21:05 UTC = 2026-11-05 01:05 in Dubai
assert.deepEqual(stamp(ts, 'Asia/Dubai'), { date: '2026-11-05', time: '0105' });
const base: InboundMessage = { id: 'w', from: '971501234567', timestamp: ts, type: 'document', media: { id: 'm', mimeType: 'application/pdf', filename: 'scan 12.PDF' } };
assert.equal(fileNameFor(base, 'application/pdf', 'Asia/Dubai'), '2026-11-05_0105_scan 12.pdf');
assert.equal(fileNameFor({ ...base, text: 'Ahmed passport' }, 'application/pdf', 'Asia/Dubai'), '2026-11-05_0105_Ahmed passport.pdf');
assert.equal(fileNameFor({ ...base, type: 'image', media: { id: 'm', mimeType: 'image/jpeg' } }, 'image/jpeg', 'Asia/Dubai'), '2026-11-05_0105_photo.jpg');
assert.equal(fileNameFor({ ...base, type: 'video', media: { id: 'm', mimeType: 'video/mp4' } }, 'video/mp4', 'Asia/Dubai'), '2026-11-05_0105_video.mp4');
assert.equal(fileNameFor({ ...base, media: { id: 'm', mimeType: 'application/x-weird' } }, 'application/x-weird', 'Asia/Dubai'), '2026-11-05_0105_file.bin');

// ---- handleVault
const users = { '971501234567': 'Fairooz' };
function fakes(over: Partial<VaultDeps> = {}) {
  const log = { saved: [] as { path: string[]; name: string; mime: string; bytes: number }[], texts: [] as string[], reactions: [] as string[], records: [] as Record<string, unknown>[] };
  const d: VaultDeps = {
    fetchMedia: async () => ({ data: Buffer.from('pdf-bytes'), mimeType: 'application/pdf' }),
    save: async (path, name, mime, data) => { log.saved.push({ path, name, mime, bytes: data.length }); return { id: 'drive1', link: null }; },
    record: async (e) => { log.records.push(e); },
    sendText: async (_to, body) => { log.texts.push(body); },
    sendReaction: async (_to, _id, emoji) => { log.reactions.push(emoji); },
    markRead: async () => undefined,
    now: () => 123,
    link: (wa, name) => `https://x.test/vault/${wa}-${name}`,
    ...over,
  };
  return { d, log };
}

// not on the allowlist: untouched
{
  const { d, log } = fakes();
  assert.equal(await handleVault(d, { ...base, from: '919999999999' }, users), false);
  assert.equal(log.saved.length, 0);
}
// a file from Fairooz: saved into <root>/Fairooz/<yyyy-mm>/, audited, ticked
{
  const { d, log } = fakes();
  assert.equal(await handleVault(d, { ...base, text: 'Ahmed passport' }, users), true);
  assert.deepEqual(log.saved, [{ path: ['Nudge Vault', 'Fairooz', '2026-11'], name: '2026-11-05_0105_Ahmed passport.pdf', mime: 'application/pdf', bytes: 9 }]);
  assert.deepEqual(log.reactions, ['✅']);
  assert.equal(log.records[0].driveId, 'drive1');
  assert.equal(log.records[0].who, 'Fairooz');
  assert.deepEqual(log.texts, []);
}
// text from Fairooz: help, nothing saved
{
  const { d, log } = fakes();
  assert.equal(await handleVault(d, { id: 't', from: '971501234567', timestamp: ts, type: 'text', text: 'hi' }, users), true);
  assert.equal(log.saved.length, 0);
  assert.match(log.texts[0], /Document/);
}
// Drive failure: no tick, a clear message, still handled (never falls through to the todo bot)
{
  const { d, log } = fakes({ save: async () => { throw new Error('quota'); } });
  assert.equal(await handleVault(d, base, users), true);
  assert.deepEqual(log.reactions, []);
  assert.match(log.texts[0], /send it again/i);
}
// audit-write failure must not turn a saved file into an error
{
  const { d, log } = fakes({ record: async () => { throw new Error('firestore down'); } });
  assert.equal(await handleVault(d, base, users), true);
  assert.deepEqual(log.reactions, ['✅']);
  assert.deepEqual(log.texts, []);
}

// ---- upload link tokens (the console verifies these with the same secret)
process.env.NUDGE_FORWARD_SECRET = 'test-secret';
{
  const t = signUploadToken('971501234567', 'Fairooz', 1000, 5000);
  assert.deepEqual(verifyUploadToken(t, 2000), { wa: '971501234567', name: 'Fairooz', exp: 6000 });
  assert.equal(verifyUploadToken(t, 7000), null); // expired
  const [p, sig] = t.split('.');
  assert.equal(verifyUploadToken(p + '.' + sig.replace(/.$/, sig.endsWith('0') ? '1' : '0'), 2000), null); // tampered signature
  const forged = Buffer.from(JSON.stringify({ wa: '1', name: 'X', exp: 9e15 })).toString('base64url');
  assert.equal(verifyUploadToken(forged + '.' + sig, 2000), null); // tampered payload
  assert.equal(verifyUploadToken('garbage', 2000), null);
}
assert.ok(wantsLink('  Link please') && wantsLink('big') && !wantsLink('hello') && !wantsLink(undefined));

// ---- Meta error 131052 (media over 100 MB) parses and gets the link reply
{
  const { messages: m } = parseForwarded({ tenant: 'nudge', receivedAt: 1, value: { messages: [{ id: 'wamid.E', from: '971501234567', timestamp: '1793000000', type: 'unsupported', errors: [{ code: 131052, title: 'Media file size too big' }] }] } });
  assert.equal(m[0].errorCode, 131052);
  const { d, log } = fakes();
  assert.equal(await handleVault(d, m[0], users), true);
  assert.match(log.texts[0], /too big/i);
  assert.match(log.texts[0], /https:\/\/x\.test\/vault\/971501234567-Fairooz/);
  assert.equal(log.saved.length, 0);
}
// text from Fairooz now carries the link too; "link" alone sends only the link
{
  const { d, log } = fakes();
  await handleVault(d, { id: 't1', from: '971501234567', timestamp: ts, type: 'text', text: 'hi' }, users);
  assert.match(log.texts[0], /vault\/971501234567-Fairooz/);
  assert.match(log.texts[0], /100 MB/);
  await handleVault(d, { id: 't2', from: '971501234567', timestamp: ts, type: 'text', text: 'link' }, users);
  assert.match(log.texts[1], /^Upload link/);
}

console.log('test_vault: ok');
