/** Events of one calendar day, as rows for the Calendar screen (month day card and week agenda). No checkbox: events pass. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { haptic, Icon, Text, useTheme } from '@/ui';
import { lengthText, rangeText, type EventOcc } from './view';

export function DayEvents({ occ, zone, past }: { occ: EventOcc[]; zone: string; past?: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <View>
      {occ.map((o) => (
        <Pressable
          key={`${o.event.id}-${o.startMs}`}
          accessibilityRole="button"
          accessibilityLabel={`${o.event.title}, ${rangeText(o.startMs, o.endMs, zone)}`}
          onPress={() => { haptic.select(); router.push({ pathname: '/events/[id]', params: { id: o.event.id } }); }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 }}
        >
          <View style={{ width: 26, alignItems: 'center' }}><Icon name="calendar" size={20} color={past ? colors.textFaint : colors.primary} /></View>
          <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: colors.primary, opacity: past ? 0.4 : 0.9 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong" numberOfLines={2} tone={past ? 'muted' : 'default'}>{o.event.title}</Text>
            <Text variant="caption" tone="muted">{`${rangeText(o.startMs, o.endMs, zone)} · ${lengthText(o)}`}</Text>
          </View>
          {o.event.repeat ? <Icon name="repeat" size={13} color={colors.textMuted} /> : null}
        </Pressable>
      ))}
    </View>
  );
}
