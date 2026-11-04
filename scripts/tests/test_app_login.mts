// Emulator test: app "Continue with WhatsApp" login. Run: FIRESTORE_PORT=8187 bash scripts/test-emulator.sh scripts/tests/test_app_login.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { deps, pollAppLogin, startAppLogin, tryAppLogin, RATE_MAX, LOGIN_TTL_MS } from '../../lib/wa/appLogin';
import type { InboundMessage } from '../../lib/wa/types';

process.env.NUDGE_WA_NUMBER = '96560091617';
const db = adminDb();

let clock = Date.now();
const sent: string[] = [];
const stickers: string[] = [];
let n = 0;
const deleted: string[] = [];
deps.now = () => clock;
deps.createUser = async () => `newuid_${++n}`;
deps.deleteUser = async (u) => { deleted.push(u); };
deps.createCustomToken = async (uid) => `token_for_${uid}`;
deps.sendText = async (_to, text) => { sent.push(text); return 'w'; };
deps.sendSticker = async (_to, name) => { stickers.push(name); return 'w'; };

const msg = (from: string, text: string, profileName?: string): InboundMessage =>
  ({ id: 'm' + Math.random(), from, timestamp: clock, type: 'text', text, ...(profileName ? { profileName } : {}) });
const sfx = String(Date.now()).slice(-6);

// ---- start: shapes
const s1 = await startAppLogin('1.1.1.1' + sfx);
assert.ok(s1.ok);
if (!s1.ok) throw new Error();
assert.match(s1.code, /^[A-HJ-NP-Z2-9]{6}$/);
assert.ok(s1.pollToken.length >= 32 && /^[A-Za-z0-9_-]+$/.test(s1.pollToken));
assert.equal(s1.waLink, `https://wa.me/96560091617?text=LOGIN%20${s1.code}`);
assert.equal(s1.expiresAt, clock + LOGIN_TTL_MS);
assert.equal((await db.doc(`appLogins/${s1.pollToken}`).get()).data()?.status, 'pending');
assert.equal((await db.doc(`appLoginCodes/${s1.code}`).get()).data()?.pollToken, s1.pollToken);
assert.deepEqual(await pollAppLogin(s1.pollToken), { status: 'pending' });
assert.deepEqual(await pollAppLogin('x'.repeat(40)), { status: 'expired' }, 'unknown token');

// ---- wrong code / not a login message
assert.equal(await tryAppLogin(msg('971500000001', 'hello there')), false);
assert.equal(await tryAppLogin({ ...msg('971500000001', ''), type: 'image' }), false);
assert.equal(await tryAppLogin(msg('971500000001', 'LOGIN ZZZZZZ')), true);
assert.equal(sent.at(-1), 'That code expired. Tap Continue with WhatsApp in the app again.');
assert.deepEqual(await pollAppLogin(s1.pollToken), { status: 'pending' }, 'wrong code leaves the real login pending');

// ---- new user: account created, linked, token issued once
sent.length = 0;
assert.equal(await tryAppLogin(msg('971500000001', `  login ${s1.code.toLowerCase()} `, 'Sara')), true);
assert.equal(sent.at(-1), "You're signed in on the Nudge app ✅");
assert.deepEqual(stickers, ['blowing']);
assert.equal((await db.doc(`appLoginCodes/${s1.code}`).get()).exists, false, 'code doc deleted');
const link = (await db.doc('waLinks/971500000001').get()).data()!;
assert.equal(link.uid, 'newuid_1');
assert.equal(link.timezone, 'Asia/Dubai');
const u = (await db.doc('users/newuid_1').get()).data()!;
assert.equal(u.displayName, 'Sara');
assert.equal(u.id, 'newuid_1');
assert.equal(u.email, '');
assert.match(u.friendCode, /^[A-Z2-9]{6}$/);
assert.deepEqual(u.friends, []);
assert.equal(u.notificationSettings.enabled, true);
assert.equal(u.whatsapp.waId, '971500000001');
const keys = (await db.doc('userKeys/newuid_1').get()).data()!;
assert.equal(Buffer.from(keys.masterKey, 'base64').length, 32);
assert.deepEqual(await pollAppLogin(s1.pollToken), { status: 'done', customToken: 'token_for_newuid_1' });
assert.deepEqual(await pollAppLogin(s1.pollToken), { status: 'expired' }, 'double poll: single use');

// a replayed code does nothing
assert.equal(await tryAppLogin(msg('971500000002', `LOGIN ${s1.code}`)), true);
assert.equal(sent.at(-1), 'That code expired. Tap Continue with WhatsApp in the app again.');
assert.equal((await db.doc('waLinks/971500000002').get()).exists, false);

// ---- no profile name -> default name
const s2 = await startAppLogin('2.2.2.2' + sfx);
if (!s2.ok) throw new Error();
await tryAppLogin(msg('919000000003', `LOGIN ${s2.code}`));
assert.equal((await db.doc('users/newuid_2').get()).data()?.displayName, 'Nudge friend');
assert.equal((await db.doc('waLinks/919000000003').get()).data()?.timezone, 'Asia/Kolkata');

// ---- linked user: no new account, same uid
await db.doc('users/olduid').set({ id: 'olduid', displayName: 'Old', email: 'o@x.com', friendCode: 'ABC234', friends: [], createdAt: 1 });
await db.doc('waLinks/971500000009').set({ waId: '971500000009', uid: 'olduid', linkedAt: 1, lastInboundAt: 1, timezone: 'Asia/Dubai', checkinTime: null, recapTime: null, friendAlerts: true, muted: false });
const s3 = await startAppLogin('3.3.3.3' + sfx);
if (!s3.ok) throw new Error();
const before = n;
await tryAppLogin(msg('971500000009', `LOGIN ${s3.code}`, 'Whoever'));
assert.equal(n, before, 'no account created');
assert.deepEqual(await pollAppLogin(s3.pollToken), { status: 'done', customToken: 'token_for_olduid' });
assert.equal((await db.doc('users/olduid').get()).data()?.displayName, 'Old', 'existing profile untouched');

// ---- expired code (pending login too)
const s4 = await startAppLogin('4.4.4.4' + sfx);
if (!s4.ok) throw new Error();
clock += LOGIN_TTL_MS + 1000;
assert.deepEqual(await pollAppLogin(s4.pollToken), { status: 'expired' });
await tryAppLogin(msg('971500000004', `LOGIN ${s4.code}`));
assert.equal(sent.at(-1), 'That code expired. Tap Continue with WhatsApp in the app again.');
assert.equal((await db.doc('waLinks/971500000004').get()).exists, false);
assert.equal((await db.doc(`appLogins/${s4.pollToken}`).get()).data()?.status, 'pending', 'never completed');

// ---- rate limit: RATE_MAX per client per window, then 429-able
const ip = '9.9.9.9' + sfx;
for (let i = 0; i < RATE_MAX; i++) assert.ok((await startAppLogin(ip)).ok, `start ${i}`);
const lim = await startAppLogin(ip);
assert.deepEqual(lim, { ok: false, reason: 'rate_limited' });
assert.ok((await startAppLogin('8.8.8.8' + sfx)).ok, 'other clients unaffected');

console.log('test_app_login OK');
