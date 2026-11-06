import React from 'react';
import { View } from 'react-native';
import { Card, CoachSticker, Icon, StreakFlame, Text, useCountUp, useTheme, type CoachPose } from '@/ui';

export interface StreakHeroProps {
  current: number;
  longest: number;
  focusCurrent: number;
  focusLongest: number;
  fitnessStreak: number;
  doneToday: boolean;
  atRisk: boolean;
}

type HeroState = 'done' | 'risk' | 'broken' | 'none';

function heroCopy(state: HeroState, current: number, longest: number): { pose: CoachPose; line: string; sub: string } {
  switch (state) {
    case 'done':
      return current >= longest && current > 2
        ? { pose: 'flex', line: 'Personal best.', sub: `${current} days and counting. Do not stop.` }
        : { pose: 'proud', line: 'Done today.', sub: current > 1 ? `${current} in a row. Come back tomorrow.` : 'Day one is in. Come back tomorrow.' };
    case 'risk':
      return { pose: 'sleepy', line: 'Nothing today.', sub: `${current} ${current === 1 ? 'day' : 'days'} on the line. One task saves it.` };
    case 'broken':
      return { pose: 'disappointed', line: 'Streak broken.', sub: longest > 1 ? `You had ${longest} days. Now zero. Start again today.` : 'Start again today.' };
    default:
      return { pose: 'sleepy', line: 'No streak yet.', sub: 'Finish one task today. That is day one.' };
  }
}

function Stat({ label, value, sub, tint }: { label: string; value: number; sub?: string; tint: 'primary' | 'accent' | 'success' }) {
  const { colors } = useTheme();
  const shown = useCountUp(value, 600);
  const fg = { primary: colors.primary, accent: colors.accent, success: colors.success }[tint];
  return (
    <View style={{ flex: 1 }}>
      <Card padding={12} style={{ minHeight: 84 }}>
        <Text variant="label" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
          <Text variant="title" style={{ color: value > 0 ? fg : colors.textFaint, fontVariant: ['tabular-nums'] }}>{shown}</Text>
          <Text variant="caption" tone="faint">{value === 1 ? 'day' : 'days'}</Text>
        </View>
        {sub ? <Text variant="caption" tone="faint" numberOfLines={1}>{sub}</Text> : null}
      </Card>
    </View>
  );
}

/** Big streak number + coach pose by state + three smaller streaks. */
export function StreakHero({ current, longest, focusCurrent, focusLongest, fitnessStreak, doneToday, atRisk }: StreakHeroProps) {
  const { colors } = useTheme();
  const state: HeroState = current > 0 ? (atRisk && !doneToday ? 'risk' : 'done') : longest > 0 ? 'broken' : 'none';
  const { pose, line, sub } = heroCopy(state, current, longest);
  const shown = useCountUp(current, 900);
  const tone = ({ done: 'sun', risk: 'accent', broken: 'danger', none: 'primary' } as const)[state];
  const numColor = state === 'broken' || state === 'none' ? colors.textFaint : colors.accent;
  return (
    <View style={{ gap: 12 }}>
      <Card tone={tone} padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="label" tone="muted">Day streak</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <StreakFlame size={64} lit={current > 0 && doneToday} />
              <Text variant="number" style={{ color: numColor, fontSize: 76, lineHeight: 82 }} accessibilityLabel={`${current} day streak`}>
                {shown}
              </Text>
            </View>
            <Text variant="subheading" style={{ marginTop: 2 }}>{line}</Text>
            <Text variant="caption" tone="muted">{sub}</Text>
          </View>
          <CoachSticker pose={pose} size={118} animated />
        </View>
      </Card>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Focus" value={focusCurrent} sub={focusLongest > 0 ? `Best ${focusLongest}` : 'Pick 3 daily'} tint="primary" />
        <Stat label="Best ever" value={longest} sub={current >= longest && current > 0 ? 'On it' : `${Math.max(0, longest - current)} to beat`} tint="accent" />
        <Stat label="Workouts" value={fitnessStreak} sub={fitnessStreak > 0 ? 'in a row' : 'Log one'} tint="success" />
      </View>
      {state === 'broken' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
          <Icon name="bolt" size={14} color={colors.danger} />
          <Text variant="caption" tone="danger">Streaks rebuild one day at a time. Today counts.</Text>
        </View>
      ) : null}
    </View>
  );
}
