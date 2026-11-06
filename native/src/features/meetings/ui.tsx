import React from 'react';
import { Linking, View } from 'react-native';
import { Icon, Text, useTheme } from '@/ui';

/** Section header like Today's: muted label + count bubble + optional right slot. */
export function SectionHeader({ title, count, extra }: { title: string; count: number; extra?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
      <Text variant="label" tone="muted">{title}</Text>
      <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" tone="muted" style={{ fontSize: 12, lineHeight: 16 }}>{count}</Text>
      </View>
      <View style={{ flex: 1 }} />
      {extra}
    </View>
  );
}

export function openMeet(url: string) {
  void Linking.openURL(url).catch(() => {});
}

export function IconLine({ icon, children }: { icon: 'clock' | 'globe'; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name={icon} size={14} color={colors.textMuted} />
      {children}
    </View>
  );
}
