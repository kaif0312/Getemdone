/**
 * Hide blocked people's comments and reactions (pure). Used where tasks enter the app (useTasks, useFriends), so every
 * screen agrees. Display only: social writes re-read the task doc, so nothing hidden here is ever deleted.
 */
import type { Comment, Reaction } from '@/lib/types';

interface Social {
  reactions?: Reaction[];
  comments?: Comment[];
}

export function stripBlocked<T extends Social>(t: T, blocked: ReadonlySet<string>): T {
  if (!blocked.size) return t;
  const hasR = t.reactions?.some((r) => blocked.has(r.userId));
  const hasC = t.comments?.some((c) => blocked.has(c.userId) || c.reactions?.some((r) => blocked.has(r.userId)));
  if (!hasR && !hasC) return t;
  const out = { ...t };
  if (hasR) out.reactions = t.reactions!.filter((r) => !blocked.has(r.userId));
  if (hasC) out.comments = stripComments(t.comments!, blocked);
  return out;
}

export function stripComments(comments: Comment[], blocked: ReadonlySet<string>): Comment[] {
  const gone = new Set(comments.filter((c) => blocked.has(c.userId)).map((c) => c.id));
  return comments
    .filter((c) => !blocked.has(c.userId))
    .map((c) => {
      let next = c;
      if (c.reactions?.some((r) => blocked.has(r.userId))) next = { ...next, reactions: c.reactions.filter((r) => !blocked.has(r.userId)) };
      // A reply quoting a hidden comment keeps the reply but drops the quote.
      if (c.replyToId && gone.has(c.replyToId)) next = { ...next, replyToId: undefined, replyToUserName: undefined, replyToText: undefined };
      return next;
    });
}
