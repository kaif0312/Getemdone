// PLACEHOLDER: wave 2 (Today) replaces this file wholesale. Feature code goes in src/features/tasks/.
import React from 'react';
import { useRouter } from 'expo-router';
import { useNotificationsInbox } from '@/hooks/useNotificationsInbox';
import { useStreak } from '@/hooks/useStreak';
import { useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import { shouldShowInTodayView } from '@/lib/taskFilter';
import { EmptyState, Header, Screen, SkeletonList, StreakBadge } from '@/ui';

export default function Today() {
  const router = useRouter();
  const { unread } = useNotificationsInbox();
  const { tasks, loading } = useTasks();
  const { current } = useStreak();
  const { today } = useToday();
  const open = tasks.filter((t) => !t.completed && shouldShowInTodayView(t, today));
  return (
    <Screen header={<Header title="Today" subtitle={`${open.length} left`} unread={unread} onBellPress={() => router.push('/inbox')} />}>
      <StreakBadge count={current} />
      {loading ? <SkeletonList count={3} /> : <EmptyState pose="clipboard" title="Today goes here." body="Wave 2 builds this screen." compact />}
    </Screen>
  );
}
