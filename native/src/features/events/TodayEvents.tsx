/** Events block on Today: what is on now and in the next 48 h (max 3 rows). Hidden when there are none, while loading, or on error.
 *  Events are not tasks: no checkbox, they pass. Tap = detail. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SectionHeader } from '@/features/meetings/ui';
import { useNow } from '@/features/meetings/useNow';
import { dayLabel } from '@/features/meetings/view';
import { useMeetings } from '@/hooks/useMeetings';
import { useToday } from '@/hooks/useToday';
import { haptic, Icon, Text, useTheme } from '@/ui';
import { lengthText, rangeText, soonEvents } from './view';

export function TodayEvents() {
  const { colors } = useTheme();
  const router = useRouter();
  const { events, loading, error } = useMeetings();
  const { zone } = useToday();
  const now = useNow();
  if (loading || error) return null;
  const list = soonEvents(events, now);
  if (list.length === 0) return null;
  let nextShown = false;
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title="EVENTS" count={list.length} />
      {list.slice(0, 3).map((o) => {
        const live = now >= o.startMs;
        const isNext = !live && !nextShown;
        if (isNext) nextShown = true;
        const day = dayLabel(new Date(o.startMs).toISOString(), zone, now);
        return (
          <Pressable
            key={`${o.event.id}-${o.startMs}`}
            accessibilityRole="button"
            accessibilityLabel={`${o.event.title}, ${day} ${rangeText(o.startMs, o.endMs, zone)}`}
            onPress={() => { haptic.select(); router.push({ pathname: '/events/[id]', params: { id: o.event.id } }); }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 12, borderRadius: 20, borderWidth: 2,
              borderColor: live ? colors.accent : isNext ? colors.primary : colors.border,
              backgroundColor: live ? colors.accentSoft : isNext ? colors.primarySoft : colors.surface,
            }}
          >
            <View style={{ width: 64 }}>
              <Text variant="label" tone={live ? 'accent' : isNext ? 'primary' : 'muted'}>{live ? 'NOW' : isNext ? 'NEXT' : day.toUpperCase()}</Text>
              <Text variant="bodyStrong" tone={live ? 'accent' : isNext ? 'primary' : 'default'}>{rangeText(o.startMs, o.startMs, zone).split(' – ')[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong" numberOfLines={1}>{o.event.title}</Text>
              <Text variant="caption" tone="muted">{`${rangeText(o.startMs, o.endMs, zone)} · ${lengthText(o)}`}</Text>
            </View>
            {o.event.repeat ? <Icon name="repeat" size={16} color={colors.textMuted} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
