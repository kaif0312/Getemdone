import React, { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from './motion';
import { radius as radii, useTheme } from './theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Pulsing placeholder block. Static (no loop) under Reduce Motion. */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const o = useSharedValue(0.55);
  useEffect(() => {
    if (reduce) {
      o.value = 0.7;
      return;
    }
    o.value = withRepeat(
      withSequence(withTiming(1, { duration: 750, easing: Easing.inOut(Easing.quad) }), withTiming(0.55, { duration: 750, easing: Easing.inOut(Easing.quad) })),
      -1,
    );
  }, [reduce, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: colors.surfaceAlt }, anim, style]} />;
}

export function SkeletonCircle({ size = 44 }: { size?: number }) {
  return <Skeleton width={size} height={size} radius={size} />;
}

/** One list row: circle + two lines. */
export function SkeletonRow() {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: colors.surface,
        borderRadius: radii.lg, borderWidth: 2, borderColor: colors.border,
      }}
    >
      <SkeletonCircle size={30} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="72%" height={16} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
