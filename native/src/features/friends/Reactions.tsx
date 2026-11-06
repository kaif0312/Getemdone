import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useTaskSocial } from '@/hooks/useTaskSocial';
import type { Reaction } from '@/lib/types';
import type { FriendTask } from '@/lib/types-extra';
import { haptic, Icon, radius, Text, useReduceMotion, useTheme } from '@/ui';
import { groupReactions, QUICK_REACTIONS } from './logic';

/**
 * Reaction chips + a quick emoji bar + the comment button for one task. Optimistic: your pick shows at once (the write needs a
 * read first, so on a slow network the server copy arrives later). One reaction per person; the same emoji again removes it.
 */
export function TaskReactions({ task }: { task: FriendTask }) {
  const { colors } = useTheme();
  const { uid, profile } = useAuth();
  const social = useTaskSocial();
  const router = useRouter();
  const reduce = useReduceMotion();
  const [open, setOpen] = useState(false);
  const [opt, setOpt] = useState<{ emoji: string | null } | null>(null);

  useEffect(() => setOpt(null), [task.reactions]);

  const reactions = useMemo<Reaction[]>(() => {
    const base = task.reactions ?? [];
    if (!opt || !uid) return base;
    const others = base.filter((r) => r.userId !== uid);
    return opt.emoji ? [...others, { userId: uid, emoji: opt.emoji, userName: profile?.displayName ?? '', timestamp: Date.now() }] : others;
  }, [task.reactions, opt, uid, profile?.displayName]);

  const groups = groupReactions(reactions, uid);
  const myEmoji = reactions.find((r) => r.userId === uid)?.emoji ?? null;
  const comments = task.comments?.length ?? 0;

  const react = (emoji: string) => {
    haptic.select();
    setOpt({ emoji: myEmoji === emoji ? null : emoji });
    setOpen(false);
    void social.addReaction(task.id, emoji).catch(() => setOpt(null));
  };

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {groups.map((g) => (
          <Pressable
            key={g.emoji}
            accessibilityRole="button"
            accessibilityLabel={`${g.emoji} ${g.count}${g.mine ? ', yours' : ''}`}
            onPress={() => react(g.emoji)}
            hitSlop={5}
            style={{
              height: 34, paddingHorizontal: 10, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 4,
              backgroundColor: g.mine ? colors.primarySoft : colors.surfaceAlt, borderWidth: 2, borderColor: g.mine ? colors.primary : 'transparent',
            }}
          >
            <Text style={{ fontSize: 14 }}>{g.emoji}</Text>
            <Text variant="caption" style={{ color: g.mine ? colors.primary : colors.textMuted, fontFamily: 'Nunito_800ExtraBold' }}>{g.count}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="React"
          onPress={() => {
            haptic.select();
            setOpen((o) => !o);
          }}
          hitSlop={5}
          style={{ height: 34, width: 40, borderRadius: radius.pill, backgroundColor: open ? colors.primarySoft : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="smile" size={16} color={open ? colors.primary : colors.textMuted} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={comments ? `${comments} comments` : 'Comment'}
          onPress={() => {
            haptic.select();
            router.push({ pathname: '/friends/comments', params: { taskId: task.id } });
          }}
          hitSlop={5}
          style={{ height: 34, minWidth: 40, justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 5 }}
        >
          <Icon name="message" size={15} color={colors.textMuted} />
          {comments ? <Text variant="caption" tone="muted" style={{ fontFamily: 'Nunito_800ExtraBold' }}>{comments}</Text> : null}
        </Pressable>
      </View>
      {open ? (
        <Animated.View
          entering={reduce ? undefined : FadeIn.duration(140)}
          exiting={reduce ? undefined : FadeOut.duration(100)}
          style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 4, alignSelf: 'flex-start' }}
        >
          {QUICK_REACTIONS.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`React ${e}`}
              onPress={() => react(e)}
              style={{
                width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                backgroundColor: myEmoji === e ? colors.primarySoft : 'transparent',
              }}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
