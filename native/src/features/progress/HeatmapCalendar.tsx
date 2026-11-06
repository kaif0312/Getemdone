import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import Animated, { FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import type { StreakData } from '@/lib/types';
import type { FitnessDay } from '@/lib/types-extra';
import { Card, haptic, Icon, Text, useReduceMotion, useTheme } from '@/ui';
import { describeWorkout, emojiForWorkout, labelForWorkout } from '@/features/fitness/workouts';
import { dayLabel, monthGrid, monthLabel, shiftMonth, WEEK_LETTERS, ymOf, type YearMonth } from './dates';

export interface HeatmapCalendarProps {
  streakData: StreakData;
  today: string;
  /** date -> texts of tasks completed that day (own tasks). */
  doneByDate: Record<string, string[]>;
  dayMap: Record<string, FitnessDay>;
}

/** Opacity of the accent fill by tasks done that day. */
function level(n: number): number {
  if (n <= 0) return 0;
  if (n === 1) return 0.38;
  if (n <= 3) return 0.62;
  if (n <= 5) return 0.84;
  return 1;
}

function Cell({
  date, today, count, focus, missed, selected, onPress,
}: { date: string; today: string; count: number; focus?: 'full' | 'partial' | 'none'; missed: boolean; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const future = date > today;
  const isToday = date === today;
  const lv = level(count);
  const solid = lv >= 0.62;
  return (
    <Pressable
      onPress={onPress}
      disabled={future}
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel(date)}, ${count} done`}
      accessibilityState={{ selected }}
      style={{ flex: 1, aspectRatio: 1, padding: 2.5 }}
    >
      <View
        style={{
          flex: 1, borderRadius: 12, backgroundColor: colors.surfaceAlt, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
          borderWidth: 2.5, borderColor: selected ? colors.primary : isToday ? colors.text : 'transparent',
          opacity: future ? 0.4 : 1,
        }}
      >
        {lv > 0 ? <View style={{ position: 'absolute', inset: 0, backgroundColor: colors.accent, opacity: lv }} /> : null}
        <Text variant="caption" style={{ fontFamily: 'Nunito_800ExtraBold', color: solid ? colors.onFill : isToday ? colors.text : colors.textMuted, fontSize: 14 }}>
          {Number(date.slice(8, 10))}
        </Text>
        {focus && focus !== 'none' ? (
          <View
            style={{
              position: 'absolute', bottom: 3, width: 6, height: 6, borderRadius: 3,
              backgroundColor: focus === 'full' ? colors.primary : 'transparent', borderWidth: 1.5, borderColor: colors.primary,
            }}
          />
        ) : null}
        {missed ? <View style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger }} /> : null}
      </View>
    </Pressable>
  );
}

function Legend() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', rowGap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text variant="caption" tone="faint" style={{ fontSize: 12 }}>Less</Text>
        {[0, 0.38, 0.62, 0.84, 1].map((o) => (
          <View key={o} style={{ width: 14, height: 14, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
            {o > 0 ? <View style={{ flex: 1, backgroundColor: colors.accent, opacity: o }} /> : null}
          </View>
        ))}
        <Text variant="caption" tone="faint" style={{ fontSize: 12 }}>More</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
          <Text variant="caption" tone="faint" style={{ fontSize: 12 }}>Focus</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.danger }} />
          <Text variant="caption" tone="faint" style={{ fontSize: 12 }}>Missed commitment</Text>
        </View>
      </View>
    </View>
  );
}

function DayDetail({ today, date, count, tasks, focus, missed, day }: { today: string; date: string; count: number; tasks: string[]; focus?: 'full' | 'partial' | 'none'; missed: number; day?: FitnessDay }) {
  const { colors } = useTheme();
  const workouts = day?.workouts ?? [];
  const empty = count === 0 && tasks.length === 0 && workouts.length === 0;
  return (
    <Animated.View entering={FadeIn.duration(180)} key={date}>
      <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 2, borderTopColor: colors.border, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="subheading">{dayLabel(date)}</Text>
          <Text variant="caption" tone={count > 0 ? 'accent' : 'faint'}>{count > 0 ? `${count} done` : 'Nothing done'}</Text>
        </View>
        {tasks.slice(0, 6).map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={16} color={colors.success} />
            <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>{t}</Text>
          </View>
        ))}
        {tasks.length > 6 ? <Text variant="caption" tone="faint">+{tasks.length - 6} more</Text> : null}
        {tasks.length === 0 && count > 0 ? <Text variant="caption" tone="muted">{count} recurring or older tasks.</Text> : null}
        {workouts.map((w, i) => (
          <View key={'w' + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 16 }}>{emojiForWorkout(w.type)}</Text>
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
              {labelForWorkout(w.type)} <Text variant="caption" tone="muted">{describeWorkout(w)}</Text>
            </Text>
          </View>
        ))}
        {focus && focus !== 'none' ? (
          <Text variant="caption" tone="primary">{focus === 'full' ? 'Focus day: all picks done.' : 'Focus day: some picks done.'}</Text>
        ) : null}
        {missed > 0 ? <Text variant="caption" tone="danger">Missed {missed} {missed === 1 ? 'commitment' : 'commitments'}.</Text> : null}
        {empty ? <Text variant="caption" tone="muted">{date === today ? 'Nothing yet today. Go do one.' : 'A blank day. That is how streaks end.'}</Text> : null}
      </View>
    </Animated.View>
  );
}

/** Month heatmap: swipe or tap the arrows for months; tap a day for what got done. */
export function HeatmapCalendar({ streakData, today, doneByDate, dayMap }: HeatmapCalendarProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const thisMonth = ymOf(today);
  const [ym, setYm] = useState<YearMonth>(thisMonth);
  const [dir, setDir] = useState<1 | -1>(1);
  const [selected, setSelected] = useState<string>(today);

  const earliest = useMemo(() => {
    const keys = Object.keys(streakData.completionHistory || {}).sort();
    return keys.length ? ymOf(keys[0]) : thisMonth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streakData.completionHistory]);

  const canPrev = ym.y * 12 + ym.m > Math.min(earliest.y * 12 + earliest.m, thisMonth.y * 12 + thisMonth.m - 11);
  const canNext = ym.y * 12 + ym.m < thisMonth.y * 12 + thisMonth.m;

  const go = (by: 1 | -1) => {
    if ((by < 0 && !canPrev) || (by > 0 && !canNext)) return;
    haptic.select();
    setDir(by);
    setYm((cur) => shiftMonth(cur, by));
  };
  const goRef = useRef(go);
  goRef.current = go;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -40) goRef.current(1);
          else if (g.dx > 40) goRef.current(-1);
        },
      }),
    [],
  );

  const rows = useMemo(() => monthGrid(ym), [ym]);
  const hist = streakData.completionHistory || {};
  const focusH = streakData.focusCompletionHistory || {};
  const missedH = streakData.missedCommitments || {};
  const entering = reduce ? undefined : dir > 0 ? SlideInRight.duration(220) : SlideInLeft.duration(220);

  const arrow = (to: 'chevronLeft' | 'chevronRight', enabled: boolean, by: 1 | -1, label: string) => (
    <Pressable
      onPress={() => go(by)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.35 }}
    >
      <Icon name={to} size={18} color={colors.text} />
    </Pressable>
  );

  return (
    <Card padding={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        {arrow('chevronLeft', canPrev, -1, 'Previous month')}
        <Text variant="subheading">{monthLabel(ym)}</Text>
        {arrow('chevronRight', canNext, 1, 'Next month')}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {WEEK_LETTERS.map((l, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', paddingBottom: 4 }}>
            <Text variant="label" tone="faint" style={{ fontSize: 11 }}>{l}</Text>
          </View>
        ))}
      </View>
      <View {...pan.panHandlers} style={{ overflow: 'hidden' }}>
        <Animated.View key={`${ym.y}-${ym.m}`} entering={entering}>
          {rows.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row' }}>
              {row.map((date, ci) =>
                date ? (
                  <Cell
                    key={date}
                    date={date}
                    today={today}
                    count={hist[date] ?? 0}
                    focus={focusH[date]}
                    missed={(missedH[date] ?? 0) > 0}
                    selected={selected === date}
                    onPress={() => {
                      haptic.select();
                      setSelected(date);
                    }}
                  />
                ) : (
                  <View key={'p' + ci} style={{ flex: 1, aspectRatio: 1 }} />
                ),
              )}
            </View>
          ))}
        </Animated.View>
      </View>
      <Legend />
      <DayDetail
        today={today}
        date={selected}
        count={hist[selected] ?? 0}
        tasks={doneByDate[selected] ?? []}
        focus={focusH[selected]}
        missed={missedH[selected] ?? 0}
        day={dayMap[selected]}
      />
    </Card>
  );
}
