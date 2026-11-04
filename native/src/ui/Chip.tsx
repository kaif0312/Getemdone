import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Icon, type IconName } from './Icon';
import { haptic, springs } from './motion';
import { Text } from './Text';
import { HIT, radius, useTheme } from './theme';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Leading emoji (tags are emoji in Nudge). */
  emoji?: string;
  icon?: IconName;
  tone?: 'primary' | 'accent' | 'success' | 'neutral';
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Pill for filters, tags, quick options (Today / Tomorrow / time / visibility). Pass `onPress` to make it selectable. */
export function Chip({ label, selected, onPress, emoji, icon, tone = 'primary', size = 'md', style, testID }: ChipProps) {
  const { colors } = useTheme();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const on = { primary: colors.primary, accent: colors.accent, success: colors.success, neutral: colors.text }[tone];
  const soft = { primary: colors.primarySoft, accent: colors.accentSoft, success: colors.successSoft, neutral: colors.surfaceAlt }[tone];
  const bg = selected ? on : soft;
  const fg = selected ? colors.onFill : tone === 'neutral' ? colors.textMuted : on;
  const h = size === 'sm' ? 30 : 38;

  const content = (
    <Animated.View
      style={[
        {
          height: h, paddingHorizontal: size === 'sm' ? 12 : 16, borderRadius: radius.pill, backgroundColor: bg,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        },
        anim,
        style,
      ]}
    >
      {emoji ? <Text style={{ fontSize: size === 'sm' ? 13 : 16 }}>{emoji}</Text> : null}
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} color={fg} /> : null}
      <Text variant={size === 'sm' ? 'caption' : 'bodyStrong'} style={{ color: fg, fontSize: size === 'sm' ? 13 : 15 }}>
        {label}
      </Text>
    </Animated.View>
  );

  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      hitSlop={Math.max(0, (HIT - h) / 2)}
      onPressIn={() => (s.value = withSpring(0.94, springs.press))}
      onPressOut={() => (s.value = withSpring(1, springs.press))}
      onPress={() => {
        haptic.select();
        onPress();
      }}
    >
      {content}
    </Pressable>
  );
}
