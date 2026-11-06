/** Meetings list (spec 2.2). Route: app/meetings/index.tsx (card page, opened from Today's Meetings block and the More sheet). */
import React, { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BackButton } from '@/features/friends/BackButton';
import { openCoachWhatsApp } from '@/features/tasks/copy';
import { useMeetings } from '@/hooks/useMeetings';
import { useToday } from '@/hooks/useToday';
import { EmptyState, ErrorState, haptic, Header, Icon, Screen, SkeletonList, Text, useTheme } from '@/ui';
import { CalendarBanner } from './CalendarBanner';
import { MeetingCard } from './MeetingCard';
import { SectionHeader } from './ui';
import { useMeetingsCalendar } from './useMeetingsCalendar';
import { useNow } from './useNow';
import { groupMeetings, zoneCity } from './view';

export default function MeetingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { meetings, loading, error, retry, refresh } = useMeetings();
  const { zone } = useToday();
  const now = useNow();
  const cal = useMeetingsCalendar();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), cal.refresh()]);
    setRefreshing(false);
  }, [refresh, cal]);

  const header = (
    <Header
      title="Meetings"
      subtitle={`Upcoming, in your time (${zoneCity(zone)})`}
      left={<BackButton />}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New meeting"
          onPress={() => { haptic.select(); router.push('/meetings/new'); }}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="plus" size={20} color={colors.text} />
        </Pressable>
      }
    />
  );

  if (loading) return <Screen tabs={false} header={header}><SkeletonList count={3} /></Screen>;
  if (error) return <Screen tabs={false} header={header}><ErrorState title="Could not load your meetings." onRetry={retry} /></Screen>;

  const groups = groupMeetings(meetings, zone, now);
  let firstUpcomingDone = false;
  return (
    <Screen tabs={false} header={header} gap={14} refreshing={refreshing} onRefresh={onRefresh}>
      <CalendarBanner kind={cal.banner} />
      {groups.length === 0 ? (
        <EmptyState
          pose="sleepy"
          title="No meetings booked."
          body="Book one here, or tell the coach on WhatsApp."
          action={{ label: 'New meeting', icon: 'plus', variant: 'accent', onPress: () => router.push('/meetings/new') }}
        />
      ) : (
        groups.map((g) => (
          <View key={g.key} style={{ gap: 10 }}>
            <SectionHeader title={g.title.toUpperCase()} count={g.items.length} />
            {g.items.map((m) => {
              const live = now >= Date.parse(m.startAt);
              const tone = live ? 'accent' : !firstUpcomingDone ? 'primary' : 'surface';
              if (!live) firstUpcomingDone = true;
              return (
                <MeetingCard
                  key={m.id}
                  m={m}
                  viewerTz={zone}
                  now={now}
                  tone={tone}
                  showDay={g.key === 'later'}
                  onPress={() => router.push({ pathname: '/meetings/[id]', params: { id: m.id } })}
                />
              );
            })}
          </View>
        ))
      )}
      <Pressable accessibilityRole="button" onPress={openCoachWhatsApp} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
        <Text variant="caption" tone="faint">Faster on WhatsApp. Tell the coach.</Text>
      </Pressable>
    </Screen>
  );
}
