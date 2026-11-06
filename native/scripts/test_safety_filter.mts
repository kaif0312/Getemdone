// Pure check of src/features/safety/filter.ts (blocked people's comments/reactions hidden). Run: npx tsx scripts/test_safety_filter.mts
import assert from 'node:assert/strict';
import { stripBlocked } from '../src/features/safety/filter';

const b = new Set(['bad']);
const t = {
  id: 't',
  reactions: [{ userId: 'bad', emoji: '👎', userName: 'B', timestamp: 1 }, { userId: 'ok', emoji: '👍', userName: 'O', timestamp: 1 }],
  comments: [
    { id: 'c1', userId: 'bad', userName: 'B', text: 'mean', timestamp: 1 },
    { id: 'c2', userId: 'ok', userName: 'O', text: 'reply', timestamp: 2, replyToId: 'c1', replyToUserName: 'B', replyToText: 'mean',
      reactions: [{ userId: 'bad', emoji: '😂', userName: 'B', timestamp: 3 }, { userId: 'me', emoji: '❤️', userName: 'M', timestamp: 3 }] },
    { id: 'c3', userId: 'me', userName: 'M', text: 'hi', timestamp: 3 },
  ],
};
const s = stripBlocked(t, b);
assert.deepEqual(s.reactions?.map((r) => r.userId), ['ok']);
assert.deepEqual(s.comments?.map((c) => c.id), ['c2', 'c3']);
assert.equal(s.comments?.[0].replyToText, undefined, 'quote of a hidden comment dropped');
assert.deepEqual(s.comments?.[0].reactions?.map((r) => r.userId), ['me']);
assert.equal(t.comments.length, 3, 'input not mutated');
assert.equal(stripBlocked(t, new Set()), t, 'no blocks: same object');
const clean = { id: 'x', comments: [{ id: 'c', userId: 'ok', userName: 'O', text: 'a', timestamp: 1 }] };
assert.equal(stripBlocked(clean, b), clean, 'nothing to hide: same object');
console.log('safety filter ok');
