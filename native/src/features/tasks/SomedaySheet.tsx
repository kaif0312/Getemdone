/**
 * Someday: tasks you parked on purpose. They are out of Today, never nagged about, and hidden from friends. Pick one up when
 * you feel like it; "Surprise me" suggests three small ones (the same rule as the WhatsApp coach: shortest first, rotated by
 * day). Route: /today/someday.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import type { Task } from '@/lib/types';
import { Button, EmptyState, haptic, radius, SheetScaffold, SkeletonList, Text, useTheme, useToast } from '@/ui';
import { fmtAgo, listParked, pickSomeday } from './helpers';

function Row({ task, onPick, onOpen, suggested }: { task: Task; onPick: (t: Task) => void; onOpen: (t: Task) => void; suggested?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        padding: 12,
        gap: 8,
        borderRadius: radius.lg,
        backgroundColor: suggested ? colors.primarySoft : colors.surface,
        borderWidth: 2,
        borderColor: suggested ? colors.primary : colors.border,
      }}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={`${task.text}. Open details`} onPress={() => onOpen(task)} style={{ gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2}>{task.text}</Text>
        <Text variant="caption" tone="faint">Parked {task.parkedAt ? `${fmtAgo(task.parkedAt)} ago` : ''}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Do it today" size="sm" icon="arrowRight" onPress={() => onPick(task)} />
      </View>
    </View>
  );
}

export default function SomedaySheet() {
  const router = useRouter();
  const toast = useToast();
  const { tasks, loading, unparkTask } = useTasks();
  const { today } = useToday();
  const [surprise, setSurprise] = useState(false);

  const parked = useMemo(() => listParked(tasks), [tasks]);
  const picks = useMemo(() => (surprise ? pickSomeday(parked, today) : []), [surprise, parked, today]);
  const rest = useMemo(() => parked.filter((t) => !picks.some((p) => p.id === t.id)), [parked, picks]);

  const pickUp = (t: Task) => {
    haptic.success();
    void unparkTask(t)
      .then(() => toast.show('On today\'s list.', { kind: 'success' }))
      .catch(() => toast.show('Could not pick it up.', { kind: 'error' }));
  };
  const open = (t: Task) => router.replace({ pathname: '/task/[id]', params: { id: t.id } });

  return (
    <SheetScaffold
      title="Someday"
      footer={parked.length > 1 && !surprise ? <Button label="Surprise me" variant="secondary" icon="sparkle" fullWidth onPress={() => { haptic.select(); setSurprise(true); }} /> : null}
    >
      {loading ? (
        <SkeletonList count={3} />
      ) : parked.length === 0 ? (
        <EmptyState
          pose="sleepy"
          title="Nothing parked."
          body='Ideas you want to keep, without doing them soon, live here. Swipe a task and tap Someday, or tell the coach "someday learn guitar".'
          compact
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
          <Text tone="muted">{parked.length} parked. No reminders, no nagging. I will ask once a year if you still want each one.</Text>
          {picks.length ? <Text variant="label" tone="muted">Try one of these</Text> : null}
          {picks.map((t) => <Row key={t.id} task={t} suggested onPick={pickUp} onOpen={open} />)}
          {picks.length && rest.length ? <Text variant="label" tone="muted">The rest</Text> : null}
          {rest.map((t) => <Row key={t.id} task={t} onPick={pickUp} onOpen={open} />)}
        </ScrollView>
      )}
    </SheetScaffold>
  );
}
