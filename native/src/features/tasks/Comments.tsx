/** Comments thread + composer + task reactions. Works for your own tasks (owner view) and friends' tasks. */
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useTaskSocial } from '@/hooks/useTaskSocial';
import type { Comment, Reaction } from '@/lib/types';
import { Avatar, haptic, Icon, radius, Text, useTheme, useToast, fonts } from '@/ui';
import { fmtAgo } from './helpers';

export const QUICK_EMOJI = ['👍', '❤️', '🔥', '💪', '😂', '👏'];

function groupReactions(reactions: Reaction[] | undefined, uid: string | null | undefined) {
  const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions ?? []) {
    const cur = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    cur.count += 1;
    if (r.userId === uid) cur.mine = true;
    map.set(r.emoji, cur);
  }
  return [...map.values()];
}

/** Row of emoji reactions on the task itself. `canReact` shows the quick picker (friends react, owners just see). */
export function TaskReactions({ taskId, reactions, canReact }: { taskId: string; reactions?: Reaction[]; canReact: boolean }) {
  const { colors } = useTheme();
  const { uid } = useAuth();
  const { addReaction } = useTaskSocial();
  const toast = useToast();
  const grouped = groupReactions(reactions, uid);
  const send = (emoji: string) => {
    haptic.select();
    void addReaction(taskId, emoji).catch(() => toast.show('Could not react.', { kind: 'error' }));
  };
  if (!canReact && grouped.length === 0) return null;
  return (
    <View style={{ gap: 8 }}>
      {grouped.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {grouped.map((g) => (
            <View key={g.emoji} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: g.mine ? colors.primarySoft : colors.surfaceAlt }}>
              <Text style={{ fontSize: 15 }}>{g.emoji}</Text>
              <Text variant="caption" tone={g.mine ? 'primary' : 'muted'}>{g.count}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {canReact ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {QUICK_EMOJI.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`React ${e}`}
              onPress={() => send(e)}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: groupReactions(reactions, uid).find((g) => g.emoji === e)?.mine ? colors.primarySoft : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 20 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export interface ReplyTarget {
  id: string;
  userName: string;
  text: string;
}

export function CommentsThread({ taskId, comments, onReply }: { taskId: string; comments: Comment[]; onReply: (r: ReplyTarget) => void }) {
  const { colors } = useTheme();
  const { uid } = useAuth();
  const toast = useToast();
  const { addCommentReaction, deleteComment } = useTaskSocial();
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  if (comments.length === 0) return <Text tone="muted">No comments yet.</Text>;
  const sorted = [...comments].sort((a, b) => a.timestamp - b.timestamp);
  return (
    <View style={{ gap: 14 }}>
      {sorted.map((c) => {
        const mine = c.userId === uid;
        const grouped = groupReactions(c.reactions, uid);
        return (
          <View key={c.id} style={{ flexDirection: 'row', gap: 10 }}>
            <Avatar name={c.userName} photoURL={c.photoURL} size={34} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{mine ? 'You' : c.userName}</Text>
                <Text variant="caption" tone="faint">{fmtAgo(c.timestamp)}</Text>
              </View>
              {c.replyToUserName ? (
                <View style={{ borderLeftWidth: 3, borderLeftColor: colors.primary, paddingLeft: 8 }}>
                  <Text variant="caption" tone="primary">{c.replyToUserName}</Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>{c.replyToText}</Text>
                </View>
              ) : null}
              <Text>{c.text}</Text>
              {grouped.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {grouped.map((g) => (
                    <Pressable
                      key={g.emoji}
                      onPress={() => void addCommentReaction(taskId, c.id, g.emoji).catch(() => {})}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 26, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: g.mine ? colors.primarySoft : colors.surfaceAlt }}
                    >
                      <Text style={{ fontSize: 13 }}>{g.emoji}</Text>
                      <Text variant="caption" tone={g.mine ? 'primary' : 'muted'} style={{ fontSize: 12 }}>{g.count}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <Pressable hitSlop={10} onPress={() => onReply({ id: c.id, userName: c.userName, text: c.text })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 }}>
                  <Icon name="reply" size={14} color={colors.textMuted} />
                  <Text variant="caption" tone="muted">Reply</Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => setPickerFor(pickerFor === c.id ? null : c.id)} style={{ minHeight: 28, justifyContent: 'center' }}>
                  <Text variant="caption" tone="muted">React</Text>
                </Pressable>
                {mine ? (
                  <Pressable
                    hitSlop={10}
                    onPress={() => {
                      void deleteComment(taskId, c.id).catch(() => toast.show('Could not delete.', { kind: 'error' }));
                    }}
                    style={{ minHeight: 28, justifyContent: 'center' }}
                  >
                    <Text variant="caption" tone="muted">Delete</Text>
                  </Pressable>
                ) : null}
              </View>
              {pickerFor === c.id ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {QUICK_EMOJI.map((e) => (
                    <Pressable
                      key={e}
                      onPress={() => {
                        haptic.select();
                        setPickerFor(null);
                        void addCommentReaction(taskId, c.id, e).catch(() => {});
                      }}
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontSize: 18 }}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function CommentComposer({ taskId, reply, onClearReply }: { taskId: string; reply: ReplyTarget | null; onClearReply: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { addComment } = useTaskSocial();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const canSend = text.trim().length > 0 && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      await addComment(taskId, text.trim(), reply ? { id: reply.id, userName: reply.userName, text: reply.text } : undefined);
      haptic.success();
      setText('');
      onClearReply();
    } catch {
      toast.show('Could not send that.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 6 }}>
      {reply ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.primarySoft }}>
          <Text variant="caption" tone="primary" numberOfLines={1} style={{ flex: 1 }}>Replying to {reply.userName}: {reply.text}</Text>
          <Pressable onPress={onClearReply} hitSlop={10} accessibilityLabel="Cancel reply">
            <Icon name="x" size={16} color={colors.primary} />
          </Pressable>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Write a comment"
          placeholderTextColor={colors.textFaint}
          multiline
          maxLength={500}
          accessibilityLabel="Comment"
          style={{
            flex: 1, minHeight: 48, maxHeight: 110, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border,
            backgroundColor: colors.surface, color: colors.text, fontFamily: fonts.bold, fontSize: 16,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send comment"
          disabled={!canSend}
          onPress={send}
          style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: canSend ? colors.primary : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="send" size={20} color={canSend ? colors.onFill : colors.textFaint} />
        </Pressable>
      </View>
    </View>
  );
}
