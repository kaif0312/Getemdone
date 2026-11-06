import React from 'react';
import { View } from 'react-native';
import { addDays, dayOfWeek, weekStart } from '@/lib/dates';
import type { StreakData } from '@/lib/types';
import { Card, Text, useTheme } from '@/ui';
import { GroupedBars } from '@/features/fitness/charts';
import { WEEK_LETTERS } from './dates';

function Delta({ now, before, unit }: { now: number; before: number; unit: string }) {
  const diff = now - before;
  const tone = diff > 0 ? 'success' : diff < 0 ? 'danger' : 'faint';
  const text = diff === 0 ? 'Same as last week' : `${diff > 0 ? '+' : ''}${diff}${unit ? ' ' + unit : ''} vs last week`;
  return <Text variant="caption" tone={tone}>{text}</Text>;
}

/** This week vs last week: tasks done per day (bars) and the totals, with focus days. */
export function WeekCompare({ streakData, today }: { streakData: StreakData; today: string }) {
  const { colors } = useTheme();
  const mon = weekStart(today);
  const thisDates = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const lastDates = thisDates.map((d) => addDays(d, -7));
  const hist = streakData.completionHistory || {};
  const focusH = streakData.focusCompletionHistory || {};
  const count = (dates: string[]) => dates.map((d) => (d > today ? 0 : hist[d] ?? 0));
  const a = count(thisDates);
  const b = count(lastDates);
  const sum = (xs: number[]) => xs.reduce((t, n) => t + n, 0);
  const focusDays = (dates: string[]) => dates.filter((d) => d <= today && focusH[d] && focusH[d] !== 'none').length;
  const tasksNow = sum(a);
  const tasksBefore = sum(b);
  const fNow = focusDays(thisDates);
  const fBefore = focusDays(lastDates);
  const activeNow = a.filter((n) => n > 0).length;

  return (
    <Card padding={16}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text variant="label" tone="muted">Tasks this week</Text>
          <Text variant="title" style={{ fontVariant: ['tabular-nums'] }}>{tasksNow}</Text>
          <Delta now={tasksNow} before={tasksBefore} unit="" />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" tone="muted">Focus days</Text>
          <Text variant="title" style={{ fontVariant: ['tabular-nums'] }}>
            {fNow}
            <Text variant="caption" tone="faint"> / {dayOfWeek(today) === 0 ? 7 : dayOfWeek(today)}</Text>
          </Text>
          <Delta now={fNow} before={fBefore} unit="" />
        </View>
      </View>
      <View style={{ marginTop: 14 }}>
        <GroupedBars a={a} b={b} labels={WEEK_LETTERS} todayIndex={(dayOfWeek(today) + 6) % 7} colorA={colors.primary} colorB={colors.border} height={132} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.primary }} />
          <Text variant="caption" tone="muted">This week</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.border }} />
          <Text variant="caption" tone="muted">Last week</Text>
        </View>
        <Text variant="caption" tone="faint" style={{ marginLeft: 'auto' }}>{activeNow} active {activeNow === 1 ? 'day' : 'days'}</Text>
      </View>
    </Card>
  );
}
