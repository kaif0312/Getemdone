import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Avatar, Card, CoachSticker, haptic, Text, useReduceMotion, useTheme, type CoachPose } from '@/ui';
import { first, type BoardRow } from './logic';

function Bar({ done, total, cleared }: { done: number; total: number; cleared: boolean }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const w = useSharedValue(0);
  const target = total > 0 ? Math.min(1, done / total) : 0;
  useEffect(() => {
    w.value = reduce ? target : withTiming(target, { duration: 600 });
  }, [target, reduce, w]);
  const fill = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 12, borderRadius: 6, backgroundColor: cleared ? colors.success : colors.primary }, fill]} />
    </View>
  );
}

function rankColors(rank: number, colors: ReturnType<typeof useTheme>['colors']) {
  if (rank === 1) return { bg: colors.sun, fg: '#1E1433' };
  if (rank === 2) return { bg: colors.surfaceAlt, fg: colors.text };
  if (rank === 3) return { bg: colors.accentSoft, fg: colors.accent };
  return { bg: 'transparent', fg: colors.textFaint };
}

export interface TodayBoardProps {
  rows: BoardRow[];
  headline: string;
}

/** "Today" leaderboard: everyone's done/total, ranked, you included. */
export function TodayBoard({ rows, headline }: TodayBoardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const me = rows.find((r) => r.me);
  const top = rows[0];
  const pose: CoachPose = !me ? 'clipboard' : top?.me && me.done > 0 ? 'flex' : me.done === 0 && rows.some((r) => !r.me && r.done > 0) ? 'blowing' : 'clipboard';
  return (
    <Card padding={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <CoachSticker pose={pose} size={64} animated={false} />
        <View style={{ flex: 1 }}>
          <Text variant="label" tone="muted">Today</Text>
          <Text variant="subheading" style={{ marginTop: 2 }}>{headline || 'Your board.'}</Text>
        </View>
      </View>
      <View style={{ gap: 12 }}>
        {rows.map((r, i) => {
          const rc = rankColors(i + 1, colors);
          const cleared = r.total > 0 && r.done >= r.total;
          const body = (
            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, marginHorizontal: -8, borderRadius: 16,
                backgroundColor: r.me ? colors.primarySoft : 'transparent',
              }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: rc.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Text variant="caption" style={{ color: rc.fg, fontFamily: 'Nunito_900Black' }}>{i + 1}</Text>
              </View>
              <Avatar name={r.name} photoURL={r.photoURL} size={36} />
              <View style={{ flex: 1, gap: 5 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>{r.me ? 'You' : first(r.name)}</Text>
                  {r.workouts > 0 ? <Text variant="caption" tone="accent">{`💪 ${r.workouts}`}</Text> : null}
                </View>
                <Bar done={r.done} total={r.total} cleared={cleared} />
              </View>
              <View style={{ minWidth: 44, alignItems: 'flex-end' }}>
                <Text variant="subheading" tone={cleared ? 'success' : 'default'} style={{ fontFamily: 'Nunito_900Black' }}>
                  {r.total === 0 ? '0' : `${r.done}/${r.total}`}
                </Text>
              </View>
            </View>
          );
          return r.me ? (
            <View key={r.id}>{body}</View>
          ) : (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={`${r.name}: ${r.done} of ${r.total} done`}
              onPress={() => {
                haptic.select();
                router.push(`/friend/${r.id}`);
              }}
            >
              {body}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
