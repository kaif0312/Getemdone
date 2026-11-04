/** Evening recap: done vs not, streak, a coach line, roll the rest to tomorrow. Route: /today/recap. */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useStreak } from '@/hooks/useStreak';
import { useTasks } from '@/hooks/useTasks';
import { addDays } from '@/lib/dates';
import type { Task } from '@/lib/types';
import { Button, Card, CoachSticker, haptic, Icon, ProgressRing, radius, SheetScaffold, StreakBadge, Text, useTheme, useToast, type CoachPose } from '@/ui';
import { recapLine } from './copy';
import { useTodayTasks } from './useTodayTasks';

export default function RecapSheet() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { deferTask } = useTasks();
  const { current } = useStreak();
  const { openToday, done, today } = useTodayTasks();
  const [busy, setBusy] = useState(false);
  const total = openToday.length + done.length;
  const pose: CoachPose = total === 0 ? 'sleepy' : done.length === total ? 'cheer' : done.length === 0 ? 'disappointed' : done.length / total >= 0.6 ? 'proud' : 'clipboard';

  const roll = async (tasks: Task[]) => {
    setBusy(true);
    try {
      await Promise.all(tasks.map((t) => deferTask(t, addDays(today, 1))));
      haptic.success();
      toast.show(tasks.length === 1 ? 'Moved to tomorrow.' : `${tasks.length} moved to tomorrow.`, { kind: 'success' });
    } catch {
      toast.show('Could not move them.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScaffold
      title="Evening recap"
      footer={
        openToday.length > 0 ? (
          <View style={{ gap: 4 }}>
            <Button label={`Roll ${openToday.length} to tomorrow`} variant="accent" size="lg" fullWidth loading={busy} onPress={() => roll(openToday)} />
            <Button label="Leave them" variant="ghost" onPress={() => router.back()} style={{ alignSelf: 'center' }} />
          </View>
        ) : (
          <Button label="Good night" size="lg" fullWidth onPress={() => router.back()} />
        )
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <CoachSticker pose={pose} size={132} animated />
          <Text variant="subheading" align="center" style={{ maxWidth: 300 }}>{recapLine(done.length, total, current, today)}</Text>
        </View>
        <Card padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <ProgressRing progress={total ? done.length / total : 0} size={76} stroke={10}>
              <Text variant="subheading">{done.length}/{total}</Text>
            </ProgressRing>
            <View style={{ flex: 1 }}>
              <Text variant="heading">{done.length} done</Text>
              <Text tone="muted">{openToday.length} not done</Text>
            </View>
            <StreakBadge count={current} />
          </View>
        </Card>
        {openToday.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text variant="label" tone="muted">Not done</Text>
            {openToday.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}>
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>{t.text}</Text>
                <Button label="Tomorrow" size="sm" variant="secondary" onPress={() => roll([t])} disabled={busy} />
              </View>
            ))}
          </View>
        ) : null}
        {done.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text variant="label" tone="muted">Done</Text>
            {done.map((t) => (
              <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
                <Icon name="check" size={18} color={colors.success} strokeWidth={3.2} />
                <Text tone="muted" numberOfLines={1} style={{ flex: 1 }}>{t.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SheetScaffold>
  );
}
