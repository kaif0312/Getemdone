import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFriendFitness } from '@/hooks/useFitness';
import { useFriends } from '@/hooks/useFriends';
import { formatElapsed, presenceElapsedSeconds, usePresence } from '@/hooks/usePresence';
import { useToday } from '@/hooks/useToday';
import { addDays, dayOfWeek, localDate, weekStart } from '@/lib/dates';
import { BackButton } from '@/features/friends/BackButton';
import { useNudges } from '@/features/friends/hooks';
import { describeWorkout, first, isForToday } from '@/features/friends/logic';
import { NudgeButton } from '@/features/friends/NudgeButton';
import { TaskReactions } from '@/features/friends/Reactions';
import {
  Avatar, Button, Card, EmptyState, haptic, Header, Icon, Screen, SkeletonList, StreakBadge, Text, useTheme, useToast,
} from '@/ui';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekHeatmap({ history, today }: { history: Record<string, number>; today: string }) {
  const { colors } = useTheme();
  const monday = weekStart(today);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const total = dates.reduce((n, d) => n + (history[d] ?? 0), 0);
  return (
    <Card padding={16}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <Text variant="label" tone="muted">This week</Text>
        <Text variant="caption" tone="muted">{total} done</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {dates.map((d, i) => {
          const n = history[d] ?? 0;
          const future = d > today;
          const isToday = d === today;
          const level = n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3;
          const bg = level === 0 ? colors.surfaceAlt : colors.success;
          const opacity = level === 0 ? 1 : [0, 0.4, 0.7, 1][level];
          return (
            <View key={d} style={{ alignItems: 'center', gap: 6 }}>
              <View
                style={{
                  width: 40, height: 40, borderRadius: 13, backgroundColor: bg, opacity: future ? 0.4 : opacity, alignItems: 'center', justifyContent: 'center',
                  borderWidth: isToday ? 3 : 0, borderColor: colors.primary,
                }}
              >
                {n > 0 ? <Text variant="caption" style={{ color: level >= 2 ? colors.onFill : colors.text, fontFamily: 'Nunito_900Black' }}>{n}</Text> : null}
              </View>
              <Text variant="caption" tone={isToday ? 'primary' : 'faint'} style={{ fontFamily: 'Nunito_800ExtraBold' }}>{DAY_LABELS[i]}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function fmtDay(date: string): string {
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek(date)];
  return dow;
}

export default function FriendProfile() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { friends, loading, friendTasks } = useFriends();
  const { today, zone } = useToday();
  const friend = friends.find((f) => f.id === uid);
  const presence = usePresence(uid ? [uid] : []);
  const p = uid ? presence[uid] : null;
  const fit = useFriendFitness(uid);
  const nudges = useNudges(uid ? [uid] : []);

  const mine = useMemo(() => friendTasks.filter((t) => t.userId === uid), [friendTasks, uid]);
  const visible = mine.filter((t) => !t.hidden);
  const doneToday = (t: (typeof mine)[number]) =>
    (t.completed && t.completedAt != null && localDate(zone, t.completedAt) === today) || !!t.raw.recurrence?.completedDates?.includes(today);
  const todayList = visible
    .filter((t) => doneToday(t) || (!t.completed && isForToday(t.raw, today)))
    .sort((a, b) => Number(doneToday(a)) - Number(doneToday(b)) || b.createdAt - a.createdAt);
  const privateToday = mine.filter((t) => t.hidden && !t.completed && isForToday(t.raw, today)).length;
  const upcoming = visible
    .filter((t) => !t.completed && !t.raw.recurrence && !todayList.includes(t) && ((t.deferredTo && t.deferredTo > today) || (t.raw.dueDate && localDate(zone, t.raw.dueDate) > today)))
    .slice(0, 5);

  const fitnessHidden = fit.goals?.visibility === 'private';
  const workouts = fitnessHidden ? [] : fit.days.flatMap((d) => (d.workouts ?? []).map((w) => ({ ...w, date: d.date }))).sort((a, b) => b.at - a.at);
  const weekWorkouts = workouts.filter((w) => w.date >= weekStart(today));

  const nudge = async () => {
    if (!friend) return;
    const r = await nudges.nudge(friend.id);
    if (r === 'sent') toast.show(`Nudged ${first(friend.displayName)}.`, { kind: 'success' });
    else if (r === 'already') toast.show('Already nudged today.', { kind: 'info' });
    else toast.show("Couldn't nudge. Try again.", { kind: 'error' });
  };

  const header = (
    <Header title={friend?.displayName ?? 'Friend'} subtitle={friend ? 'Friend' : undefined} left={<BackButton />} />
  );

  if (loading) return <Screen tabs={false} header={header}><SkeletonList count={3} /></Screen>;
  if (!friend) {
    return (
      <Screen tabs={false} header={header}>
        <EmptyState pose="sleepy" title="Not your friend." body="They're not on your list anymore." action={{ label: 'Back', variant: 'secondary', onPress: () => router.back() }} />
      </Screen>
    );
  }

  const streak = friend.streakData?.currentStreak ?? 0;
  const best = friend.streakData?.longestStreak ?? 0;

  return (
    <Screen tabs={false} header={header} gap={14}>
      <Card padding={18}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Avatar name={friend.displayName} photoURL={friend.photoURL} size={80} ring={p ? 'focus' : 'none'} />
          <View style={{ flex: 1, gap: 4 }}>
            <StreakBadge count={streak} />
            <Text variant="caption" tone="muted">{best > 0 ? `Best: ${best} days` : 'No streak yet'}</Text>
            <Text variant="bodyStrong" tone={p ? 'accent' : 'muted'}>
              {p ? `Focusing ${formatElapsed(presenceElapsedSeconds(p))}${p.focusTaskCount ? ` · ${p.focusTaskCount} task${p.focusTaskCount > 1 ? 's' : ''}` : ''}` : 'Not focusing'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <View style={{ flex: 1 }}>
            <NudgeButton variant="block" sent={!!nudges.sent[friend.id]} busy={!!nudges.busy[friend.id]} onPress={nudge} />
          </View>
          <Button
            label="Encourage"
            icon="star"
            variant="secondary"
            onPress={() => router.push({ pathname: '/friends/encourage', params: { uid: friend.id } })}
          />
        </View>
      </Card>

      <WeekHeatmap history={friend.streakData?.completionHistory ?? {}} today={today} />

      <Text variant="label" tone="muted" style={{ marginTop: 4 }}>Today</Text>
      {todayList.length === 0 ? (
        <Card padding={16}>
          <Text tone="muted">{privateToday > 0 ? `Nothing shared. ${privateToday} private.` : 'Nothing on their list yet.'}</Text>
        </Card>
      ) : (
        <Card padding={16}>
          <View style={{ gap: 14 }}>
            {todayList.map((t, i) => {
              const done = doneToday(t);
              return (
                <View key={t.id} style={{ gap: 8 }}>
                  {i > 0 ? <View style={{ height: 2, backgroundColor: colors.surfaceAlt, borderRadius: 1, marginBottom: 6 }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View
                      style={{
                        width: 24, height: 24, borderRadius: 12, marginTop: 1, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: done ? colors.success : 'transparent', borderWidth: done ? 0 : 2.5, borderColor: colors.border,
                      }}
                    >
                      {done ? <Icon name="check" size={14} color={colors.onFill} strokeWidth={3.6} /> : null}
                    </View>
                    <Text style={{ flex: 1, textDecorationLine: done ? 'line-through' : 'none', color: done ? colors.textMuted : colors.text }}>{t.text}</Text>
                  </View>
                  <View style={{ paddingLeft: 34 }}>
                    <TaskReactions task={t} />
                  </View>
                </View>
              );
            })}
            {privateToday > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="lock" size={14} color={colors.textFaint} />
                <Text variant="caption" tone="faint">{privateToday} private</Text>
              </View>
            ) : null}
          </View>
        </Card>
      )}

      {upcoming.length > 0 ? (
        <>
          <Text variant="label" tone="muted" style={{ marginTop: 4 }}>Coming up</Text>
          <Card padding={16}>
            <View style={{ gap: 12 }}>
              {upcoming.map((t) => {
                const when = t.deferredTo && t.deferredTo > today ? t.deferredTo : t.raw.dueDate ? localDate(zone, t.raw.dueDate) : '';
                return (
                  <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Icon name="calendar" size={16} color={colors.textFaint} />
                    <Text style={{ flex: 1 }} numberOfLines={1}>{t.text}</Text>
                    <Text variant="caption" tone="muted">{when ? `${fmtDay(when)} ${when.slice(8)}/${when.slice(5, 7)}` : ''}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
        <Text variant="label" tone="muted">Workouts this week</Text>
        {!fitnessHidden && fit.goals?.workoutsPerWeek ? (
          <Text variant="caption" tone="muted">{weekWorkouts.length} of {fit.goals.workoutsPerWeek}</Text>
        ) : null}
      </View>
      <Card padding={16}>
        {fitnessHidden ? (
          <Text tone="muted">They keep fitness private.</Text>
        ) : weekWorkouts.length === 0 ? (
          <Text tone="muted">No workouts yet this week.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {weekWorkouts.map((w) => (
              <View key={`${w.date}_${w.at}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 18 }}>💪</Text>
                <Text style={{ flex: 1 }} numberOfLines={1}>{describeWorkout(w)}</Text>
                <Text variant="caption" tone="muted">{fmtDay(w.date)}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <Button
        label="Remove friend"
        variant="ghost"
        onPress={() => {
          haptic.select();
          router.push({ pathname: '/friends/remove', params: { uid: friend.id } });
        }}
        style={{ alignSelf: 'center', marginTop: 8 }}
      />
    </Screen>
  );
}
