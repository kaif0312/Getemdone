import React, { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFitness } from '@/hooks/useFitness';
import { useNotificationsInbox } from '@/hooks/useNotificationsInbox';
import { useStreak } from '@/hooks/useStreak';
import { useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import { localDate } from '@/lib/dates';
import { Header, Screen, Skeleton, Text } from '@/ui';
import { FitnessSection } from '@/features/fitness/FitnessSection';
import { HeatmapCalendar } from './HeatmapCalendar';
import { StreakHero } from './StreakHero';
import { WeekCompare } from './WeekCompare';

function Loading() {
  return (
    <View style={{ gap: 14 }}>
      <Skeleton height={190} radius={22} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Skeleton width="auto" height={84} radius={20} style={{ flex: 1 }} />
        <Skeleton width="auto" height={84} radius={20} style={{ flex: 1 }} />
        <Skeleton width="auto" height={84} radius={20} style={{ flex: 1 }} />
      </View>
      <Skeleton height={340} radius={22} />
    </View>
  );
}

export function ProgressScreen() {
  const router = useRouter();
  const { unread } = useNotificationsInbox();
  const streak = useStreak();
  const { tasks } = useTasks();
  const { dayMap } = useFitness();
  const { today, zone } = useToday();

  // date -> texts of own tasks completed that day (one-off by completedAt, recurring by completedDates)
  const doneByDate = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const t of tasks) {
      if (t.completed && t.completedAt) (out[localDate(zone, t.completedAt)] ??= []).push(t.text);
      for (const d of t.recurrence?.completedDates ?? []) (out[d] ??= []).push(t.text);
    }
    return out;
  }, [tasks, zone]);

  return (
    <Screen header={<Header title="Progress" unread={unread} onBellPress={() => router.push('/inbox')} />} gap={18}>
      {streak.loading ? (
        <Loading />
      ) : (
        <>
          <StreakHero
            current={streak.current}
            longest={streak.longest}
            focusCurrent={streak.focusCurrent}
            focusLongest={streak.focusLongest}
            fitnessStreak={streak.fitnessStreak}
            doneToday={streak.doneToday}
            atRisk={streak.atRisk}
          />
          <View style={{ gap: 12 }}>
            <Text variant="heading">Calendar</Text>
            <HeatmapCalendar streakData={streak.streakData} today={today} doneByDate={doneByDate} dayMap={dayMap} />
          </View>
          <View style={{ gap: 12 }}>
            <Text variant="heading">This week</Text>
            <WeekCompare streakData={streak.streakData} today={today} />
          </View>
          <FitnessSection />
        </>
      )}
    </Screen>
  );
}
