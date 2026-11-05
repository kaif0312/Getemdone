// Emulator test: lib/server/expoPush.ts with a mocked fetch. Run: FIRESTORE_PORT=8187 bash scripts/test-emulator.sh scripts/tests/test_expo_push.mts
import assert from 'node:assert/strict';
import { adminDb } from '../../lib/server/firebaseAdmin';
import { EXPO_PUSH_URL, expoTokensOf, sendExpoPush } from '../../lib/server/expoPush';

const db = adminDb();
const calls: { url: string; body: Record<string, unknown>[] }[] = [];
let respond: (body: Record<string, unknown>[]) => { status?: number; json: unknown } = (b) => ({ json: { data: b.map(() => ({ status: 'ok', id: 'x' })) } });
globalThis.fetch = (async (url: string, init: { body: string }) => {
  const body = JSON.parse(init.body) as Record<string, unknown>[];
  calls.push({ url: String(url), body });
  const r = respond(body);
  return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
}) as typeof fetch;

const tok = (n: number | string) => `ExponentPushToken[t${n}]`;
const payload = { title: 'T', body: 'B', data: { type: 'task' as const, taskId: 'abc' } };

// ---- expoTokensOf
assert.deepEqual(expoTokensOf(undefined), []);
assert.deepEqual(expoTokensOf({ expoPushTokens: { a: { token: tok(1) }, b: { token: tok(1) }, c: { token: 'garbage' }, d: null } }), [tok(1)]);

// ---- explicit tokens: batch of 250 -> 3 requests of <= 100, payload shape
const many = Array.from({ length: 250 }, (_, i) => tok(i));
let r = await sendExpoPush(many, payload);
assert.equal(r.sent, 250);
assert.deepEqual(calls.map((c) => c.body.length), [100, 100, 50]);
assert.equal(calls[0].url, EXPO_PUSH_URL);
assert.deepEqual(
  { to: calls[0].body[0].to, title: calls[0].body[0].title, body: calls[0].body[0].body, data: calls[0].body[0].data },
  { to: tok(0), title: 'T', body: 'B', data: { type: 'task', taskId: 'abc' } },
);
calls.length = 0;
r = await sendExpoPush(['not-a-token', ''], payload);
assert.equal(r.sent, 0);
assert.equal(calls.length, 0, 'invalid tokens are never sent');

// ---- by uid: sends to its tokens, removes DeviceNotRegistered ones, keeps the rest
const uid = 'ep_' + Date.now();
await db.doc(`users/${uid}`).set({
  displayName: 'x',
  expoPushTokens: {
    good: { token: tok('good'), platform: 'ios', updatedAt: 1 },
    gone: { token: tok('gone'), platform: 'android', updatedAt: 1 },
  },
});
respond = (b) => ({ json: { data: b.map((m) => (m.to === tok('gone') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' })) } });
calls.length = 0;
r = await sendExpoPush(uid, { title: 'Hi', body: 'There', data: { type: 'friend', friendUid: 'f1' } });
assert.equal(r.sent, 1);
assert.deepEqual(r.dead, [tok('gone')]);
assert.equal(calls[0].body.length, 2);
const after = (await db.doc(`users/${uid}`).get()).data()!;
assert.deepEqual(Object.keys(after.expoPushTokens), ['good']);

// ---- other errors do not remove; HTTP failure is counted and never throws
respond = (b) => ({ json: { data: b.map(() => ({ status: 'error', details: { error: 'MessageRateExceeded' } })) } });
r = await sendExpoPush(uid, payload);
assert.deepEqual([r.sent, r.dead.length, r.errors], [0, 0, 1]);
assert.deepEqual(Object.keys((await db.doc(`users/${uid}`).get()).data()!.expoPushTokens), ['good']);
respond = () => ({ status: 500, json: { errors: [] } });
r = await sendExpoPush(uid, payload);
assert.equal(r.errors, 1);

// ---- user without tokens / missing user: no request
calls.length = 0;
await db.doc(`users/${uid}_none`).set({ displayName: 'n' });
assert.equal((await sendExpoPush(`${uid}_none`, payload)).sent, 0);
assert.equal((await sendExpoPush('no_such_user', payload)).sent, 0);
assert.equal(calls.length, 0);

console.log('test_expo_push OK');
