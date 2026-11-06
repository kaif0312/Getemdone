import React from 'react';
import { Pressable, View } from 'react-native';
import { haptic, Icon, radius, Text, useTheme } from '@/ui';
import type { MeetingAttendee } from '@/lib/meetingsTypes';
import { attendeeInitials, attendeeLabel } from './view';

/** Pill with a 20px initials avatar. With `onRemove` it shows an x (new-meeting form). */
export function PersonPill({ a, onRemove }: { a: MeetingAttendee; onRemove?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ height: 30, maxWidth: 190, paddingLeft: 5, paddingRight: onRemove ? 6 : 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" tone="primary" style={{ fontSize: 9, lineHeight: 12 }}>{attendeeInitials(a)}</Text>
      </View>
      <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>{attendeeLabel(a)}</Text>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${attendeeLabel(a)}`} hitSlop={12} onPress={() => { haptic.select(); onRemove(); }}>
          <Icon name="x" size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Up to `max` people then "+N". */
export function AttendeeChips({ list, max = 3 }: { list: MeetingAttendee[]; max?: number }) {
  if (list.length === 0) return null;
  const rest = list.length - max;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {list.slice(0, max).map((a, i) => <PersonPill key={`${a.email ?? a.name ?? i}-${i}`} a={a} />)}
      {rest > 0 ? (
        <View style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'transparent', justifyContent: 'center' }}>
          <Text variant="caption" tone="faint">+{rest}</Text>
        </View>
      ) : null}
    </View>
  );
}
