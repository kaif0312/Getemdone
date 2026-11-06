import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFitness } from '@/hooks/useFitness';
import { useToday } from '@/hooks/useToday';
import { Button, Card, CoachSticker, ErrorState, Icon, ProgressRing, Text, useToast, useTheme } from '@/ui';
import { relativeDay, WEEK_LETTERS } from '@/features/progress/dates';
import { openCoachChat } from '@/features/settings/links';
import { Sparkline } from './charts';
import { describeWorkout, emojiForWorkout, formatMetric, labelForWorkout, METRICS, metricSeries, recentWorkouts, type MetricDef } from './workouts';

function WeekRingCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const { week, goals } = useFitness();
  const goal = week.goal;
  const progress = goal ? week.workouts / goal : week.workouts > 0 ? 1 : 0;
  const left = goal ? Math.max(0, goal - week.workouts) : 0;
  const workoutDates = new Set(week.days.filter((d) => d.workouts?.length).map((d) => d.date));
  const { today } = useToday();
  return (
    <Card padding={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ProgressRing progress={progress} size={112} stroke={14} color={progress >= 1 ? colors.success : colors.accent}>
          <Text variant="title" style={{ fontSize: 34, lineHeight: 38, fontVariant: ['tabular-nums'] }}>{week.workouts}</Text>
          <Text variant="caption" tone="faint" style={{ marginTop: -2 }}>{goal ? `of ${goal}` : 'this week'}</Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="label" tone="muted">Workouts this week</Text>
          <Text variant="subheading">
            {!goal
              ? week.workouts > 0 ? 'Good. Now set a target.' : 'No target. No excuse.'
              : left === 0 ? 'Goal hit. Keep it up.' : `${left} to go.`}
          </Text>
          <Text variant="caption" tone="muted">
            {week.minutes > 0 ? `${week.minutes} min` : '0 min'}{week.distanceKm > 0 ? ` · ${week.distanceKm} km` : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 5, marginTop: 4 }}>
            {week.dates.map((d, i) => {
              const did = workoutDates.has(d);
              const isToday = d === today;
              return (
                <View key={d} style={{ alignItems: 'center', gap: 3 }}>
                  <View
                    style={{
                      width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: did ? colors.success : colors.surfaceAlt, borderWidth: isToday ? 2 : 0, borderColor: colors.text,
                    }}
                  >
                    {did ? <Icon name="check" size={12} color={colors.onFill} strokeWidth={3.5} /> : null}
                  </View>
                  <Text variant="caption" tone={isToday ? 'default' : 'faint'} style={{ fontSize: 10, lineHeight: 12 }}>{WEEK_LETTERS[i]}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <Text variant="caption" tone="faint">
          {goals?.visibility === 'private' ? 'Friends cannot see this.' : 'Friends can see your workouts.'}
        </Text>
        <Button label={goal ? 'Goals' : 'Set goals'} variant="ghost" size="sm" icon="settings" onPress={() => router.push('/progress/goals')} />
      </View>
    </Card>
  );
}

function MetricCard({ def }: { def: MetricDef }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { dayMap, goals } = useFitness();
  const { today } = useToday();
  const series = useMemo(() => metricSeries(dayMap, def.key, today, 30), [dayMap, def.key, today]);
  const known = series.filter((v): v is number => v !== null);
  const latest = known.length ? known[known.length - 1] : null;
  const avg = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 0;
  const goal = def.key === 'steps' ? goals?.stepsPerDay : def.key === 'weightKg' ? goals?.targetWeightKg : undefined;
  const color = { weightKg: colors.primary, steps: colors.accent, sleepH: colors.sunEdge, waterL: colors.success }[def.key];
  const first = known.length > 1 ? known[0] : null;
  const change = def.key === 'weightKg' && first !== null && latest !== null ? Math.round((latest - first) * 10) / 10 : null;
  const sub = latest === null
    ? 'Not logged yet'
    : change !== null
      ? `${change > 0 ? '+' : ''}${change} kg in 30 days`
      : goal ? `Goal ${formatMetric(def, goal)}` : `Avg ${formatMetric(def, avg)}`;
  return (
    <View style={{ width: '50%', padding: 5 }}>
      <Card padding={12} onPress={() => router.push({ pathname: '/progress/log-metric', params: { metric: def.key } })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 16 }}>{def.emoji}</Text>
          <Text variant="label" tone="muted" style={{ flex: 1 }}>{def.label}</Text>
          <Icon name="plus" size={16} color={colors.textFaint} />
        </View>
        <Text variant="title" style={{ fontSize: 24, lineHeight: 30, marginTop: 4, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
          {latest === null ? '--' : formatMetric(def, latest)}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>{sub}</Text>
        <View style={{ marginTop: 6 }}>
          {known.length ? (
            <Sparkline values={series} kind={def.kind} color={color} goal={goal} height={46} />
          ) : (
            <View style={{ height: 46, borderRadius: 10, backgroundColor: colors.surfaceAlt, opacity: 0.6 }} />
          )}
        </View>
      </Card>
    </View>
  );
}

function RecentWorkouts() {
  const { colors } = useTheme();
  const { days, undoLastWorkout } = useFitness();
  const { today } = useToday();
  const toast = useToast();
  const rows = useMemo(() => recentWorkouts(days, 6), [days]);
  if (!rows.length) return null;
  const hasToday = rows.some((r) => r.date === today);
  return (
    <Card padding={4}>
      {rows.map((r, i) => (
        <View
          key={`${r.date}-${r.workout.at}-${i}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderTopWidth: i ? 2 : 0, borderTopColor: colors.surfaceAlt }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>{emojiForWorkout(r.workout.type)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" numberOfLines={1}>{labelForWorkout(r.workout.type)}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>{describeWorkout(r.workout) || 'Logged'}</Text>
          </View>
          <Text variant="caption" tone={r.date === today ? 'accent' : 'faint'}>{relativeDay(r.date, today)}</Text>
        </View>
      ))}
      {hasToday ? (
        <View style={{ paddingHorizontal: 8, paddingBottom: 4 }}>
          <Button
            label="Undo last of today"
            variant="ghost"
            size="sm"
            onPress={() => {
              void undoLastWorkout().then(() => toast.show('Removed.', { kind: 'info' })).catch(() => toast.show('Could not undo.', { kind: 'error' }));
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function CoachNudge({ title, body, prompt }: { title: string; body: string; prompt: string }) {
  return (
    <Card tone="primary" padding={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <CoachSticker pose="blowing" size={84} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text variant="subheading">{title}</Text>
          <Text variant="caption" tone="muted">{body}</Text>
          <Button label="Tell the coach" icon="message" size="sm" variant="accent" onPress={() => void openCoachChat(prompt)} />
        </View>
      </View>
    </Card>
  );
}

/** Fitness block of the Progress tab: week ring, recent workouts, 4 metric cards, WhatsApp nudge. */
export function FitnessSection() {
  const router = useRouter();
  const { days, workoutDates, loading, error, retry } = useFitness();
  const anything = days.some((d) => d.workouts?.length || d.steps || d.weightKg || d.sleepH || d.waterL);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="heading">Fitness</Text>
        <Button label="Log workout" icon="plus" size="sm" variant="accent" onPress={() => router.push('/progress/log-workout')} />
      </View>
      {error ? (
        <Card padding={8}>
          <ErrorState compact title="Fitness did not load." onRetry={retry} />
        </Card>
      ) : !loading && !anything ? (
        <Card padding={8}>
          <View style={{ alignItems: 'center', paddingVertical: 8, gap: 6 }}>
            <CoachSticker pose="flex" size={128} animated />
            <Text variant="heading" align="center">No workouts yet.</Text>
            <Text tone="muted" align="center" style={{ maxWidth: 280 }}>
              Tell the coach on WhatsApp, or log one here. A run, a lift, a walk. It all counts.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <Button label="Say 'ran 5k'" icon="message" size="sm" onPress={() => void openCoachChat('ran 5k')} />
              <Button label="Log here" size="sm" variant="secondary" onPress={() => router.push('/progress/log-workout')} />
            </View>
          </View>
        </Card>
      ) : (
        <>
          <WeekRingCard />
          <RecentWorkouts />
        </>
      )}
      <Text variant="subheading" style={{ marginTop: 6 }}>Last 30 days</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -5 }}>
        {METRICS.map((m) => <MetricCard key={m.key} def={m} />)}
      </View>
      {workoutDates.length > 0 ? (
        <CoachNudge title="Skip the typing." body="Send the coach a message and it logs for you. Try 'weight 72' or 'gym 45 min'." prompt="weight 72" />
      ) : null}
    </View>
  );
}
