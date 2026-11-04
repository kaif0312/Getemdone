/** Settings-style row that expands into an inline editor (one open at a time in the task detail). */
import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { haptic, Icon, radius, Text, useReduceMotion, useTheme, type IconName } from '@/ui';
import { XIcon, type XIconName } from './XIcon';

export function FieldRow({ icon, x, label, value, valueTone, open, onToggle, children, last }: {
  icon: IconName | XIconName;
  x?: boolean;
  label: string;
  value: string;
  valueTone?: 'muted' | 'primary' | 'danger';
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  return (
    <Animated.View layout={reduce ? undefined : LinearTransition.duration(180)} style={{ borderBottomWidth: last ? 0 : 2, borderBottomColor: colors.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${value}`}
        onPress={() => {
          haptic.select();
          onToggle();
        }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14 }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
          {x ? <XIcon name={icon as XIconName} size={17} color={colors.textMuted} /> : <Icon name={icon as IconName} size={17} color={colors.textMuted} />}
        </View>
        <Text variant="bodyStrong" style={{ flex: 1 }}>{label}</Text>
        <Text variant="body" tone={valueTone ?? 'muted'} numberOfLines={1} style={{ maxWidth: '55%', textAlign: 'right' }}>{value}</Text>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevronRight" size={16} color={colors.textFaint} />
        </View>
      </Pressable>
      {open ? (
        <Animated.View entering={reduce ? undefined : FadeIn.duration(160)} style={{ paddingHorizontal: 14, paddingBottom: 16, paddingTop: 2 }}>
          {children}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** Rounded surface that holds a stack of FieldRows. */
export function FieldGroup({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' }}>{children}</View>;
}
