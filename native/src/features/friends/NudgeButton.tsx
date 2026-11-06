import React from 'react';
import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptic, Icon, springs, Text, useReduceMotion, useTheme } from '@/ui';
import { untilMidnight } from './logic';

export interface NudgeButtonProps {
  /** Already nudged today: disabled, shows when it unlocks. */
  sent: boolean;
  busy?: boolean;
  onPress: () => void;
  /** 'pill' for cards, 'block' (taller) for the profile. */
  variant?: 'pill' | 'block';
}

/** Nudge: one per friend per day. Accent when available, quiet with "back in 5 h" once used. */
export function NudgeButton({ sent, busy, onPress, variant = 'pill' }: NudgeButtonProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const block = variant === 'block';
  const label = sent ? (block ? `Nudged. Back in ${untilMidnight()}` : untilMidnight()) : 'Nudge';
  const fg = sent ? colors.textFaint : colors.onFill;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sent ? `Already nudged today, available in ${untilMidnight()}` : 'Nudge'}
      accessibilityState={{ disabled: sent || !!busy }}
      disabled={sent || busy}
      hitSlop={6}
      onPressIn={() => {
        s.value = withSpring(0.92, springs.press);
      }}
      onPressOut={() => {
        s.value = reduce ? 1 : withSequence(withSpring(1.1, springs.bounce), withTiming(1, { duration: 120 }));
      }}
      onPress={() => {
        haptic.medium();
        onPress();
      }}
    >
      <Animated.View
        style={[
          {
            height: block ? 54 : 36, minWidth: 44, paddingHorizontal: block ? 22 : 12, borderRadius: block ? 20 : 18,
            backgroundColor: sent ? colors.surfaceAlt : colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            borderBottomWidth: sent ? 0 : 3, borderBottomColor: colors.accentEdge,
          },
          anim,
        ]}
      >
        <Icon name={sent && !block ? 'clock' : 'bolt'} size={block ? 20 : 15} color={fg} filled={!sent} strokeWidth={2} />
        <Text variant={block ? 'subheading' : 'caption'} style={{ color: fg, fontFamily: 'Nunito_800ExtraBold' }} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
