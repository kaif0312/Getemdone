/** Meetings block on Today (spec 2.1): next 48 h, max 2 compact rows, or one slim "Nothing booked." row. Hidden while loading or on error. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, haptic, Icon, Text, useTheme } from '@/ui';
import { useMeetings } from '@/hooks/useMeetings';
import { useToday } from '@/hooks/useToday';
import { IconTile } from '@/features/settings/ui';
import { SectionHeader, openMeet } from './ui';
import { useNow } from './useNow';
import { clockIn, dayLabel, joinState, soon48h } from './view';

export function TodayMeetings() {
  const { colors } = useTheme();
  const router = useRouter();
  const { meetings, loading, error } = useMeetings();
  const { zone } = useToday();
  const now = useNow();
  if (loading || error) return null;
  const list = soon48h(meetings, now);
  const head = (
    <SectionHeader
      title="MEETINGS"
      count={list.length}
      extra={
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => router.push('/meetings')}>
          <Text variant="caption" tone="primary">All meetings</Text>
        </Pressable>
      }
    />
  );
  if (list.length === 0) {
    return (
      <View style={{ gap: 8 }}>
        {head}
        <Card raised={false} padding={12} onPress={() => router.push('/meetings')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconTile icon="calendar" tone="primary" />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Nothing booked.</Text>
              <Text variant="caption" tone="muted">Tap to book a meeting.</Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textFaint} />
          </View>
        </Card>
      </View>
    );
  }
  let nextShown = false;
  return (
    <View style={{ gap: 8 }}>
      {head}
      {list.slice(0, 2).map((m) => {
        const live = now >= Date.parse(m.startAt);
        const isNext = !live && !nextShown;
        if (isNext) nextShown = true;
        const join = joinState(m, now);
        return (
          <View
            key={m.id}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12, borderRadius: 20, borderWidth: 2,
              borderColor: live ? colors.accent : isNext ? colors.primary : colors.border,
              backgroundColor: live ? colors.accentSoft : isNext ? colors.primarySoft : colors.surface,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${m.title}, ${dayLabel(m.startAt, zone, now)} ${clockIn(m.startAt, zone)}`}
              onPress={() => { haptic.select(); router.push({ pathname: '/meetings/[id]', params: { id: m.id } }); }}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}
            >
              <View style={{ width: 64 }}>
                <Text variant="label" tone={live ? 'accent' : isNext ? 'primary' : 'muted'}>{live ? 'NOW' : isNext ? 'NEXT' : dayLabel(m.startAt, zone, now).toUpperCase()}</Text>
                <Text variant="bodyStrong" tone={live ? 'accent' : isNext ? 'primary' : 'default'}>{clockIn(m.startAt, zone)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={1}>{m.title}</Text>
                <Text variant="caption" tone="muted">{dayLabel(m.startAt, zone, now)}</Text>
              </View>
            </Pressable>
            {join === 'soon' || join === 'live' ? <Button label="Join Meet" size="sm" variant="accent" onPress={() => openMeet(m.meetUrl!)} /> : null}
          </View>
        );
      })}
    </View>
  );
}
