import React, { useEffect, useId, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useReduceMotion } from './motion';
import { Text } from './Text';
import { brand, useTheme } from './theme';

const OUTER = 'M24 2C26 14 40 20 40 38C40 52 33 62 24 62C15 62 8 52 8 38C8 30 12 25 16 20C17 26 20 29 23 29C21 20 21 10 24 2Z';
const INNER = 'M24 62C18 62 14 57 14 50C14 44 19 41 22 36C23 40 25 42 27 44C30 47 34 49 34 53C34 58 30 62 24 62Z';

export interface StreakFlameProps {
  /** Flame height in points (width is 0.75x). */
  size?: number;
  /** Lit = streak alive today. Unlit = grey (streak at risk / zero). */
  lit?: boolean;
}

export function StreakFlame({ size = 40, lit = true }: StreakFlameProps) {
  const { colors } = useTheme();
  const gid = 'flame' + useId().replace(/[^A-Za-z0-9]/g, '');
  const reduce = useReduceMotion();
  const s = useSharedValue(1);
  const r = useSharedValue(0);
  useEffect(() => {
    if (!lit || reduce) {
      s.value = 1;
      r.value = 0;
      return;
    }
    s.value = withRepeat(
      withSequence(withTiming(1.07, { duration: 520, easing: Easing.inOut(Easing.quad) }), withTiming(0.97, { duration: 480, easing: Easing.inOut(Easing.quad) })),
      -1,
    );
    r.value = withRepeat(
      withSequence(withTiming(2.5, { duration: 700 }), withTiming(-2.5, { duration: 700 })),
      -1,
      true,
    );
  }, [lit, reduce, s, r]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scaleY: s.value }, { rotate: `${r.value}deg` }] }));
  const w = size * 0.75;
  return (
    <Animated.View style={[{ width: w, height: size }, anim]}>
      <Svg width={w} height={size} viewBox="0 0 48 64">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor={lit ? brand.orange : colors.textFaint} />
            <Stop offset="1" stopColor={lit ? '#FF9A3D' : colors.border} />
          </LinearGradient>
        </Defs>
        <Path d={OUTER} fill={`url(#${gid})`} />
        <Path d={INNER} fill={lit ? '#FFE08A' : colors.surfaceAlt} />
      </Svg>
    </Animated.View>
  );
}

/** Counts from the previous value to `target` (integers). Instant when Reduce Motion is on. */
export function useCountUp(target: number, duration = 700): number {
  const reduce = useReduceMotion();
  const [value, setValue] = useState(reduce ? target : 0);
  const from = useRef(reduce ? target : 0);
  useEffect(() => {
    if (reduce || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    const t0 = Date.now();
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(start + (target - start) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduce]);
  return value;
}

export interface StreakBadgeProps {
  count: number;
  /** Flame colour state. Defaults to lit when count > 0. */
  lit?: boolean;
  /** 'hero' = giant number beside a big flame, 'inline' = compact pill. */
  variant?: 'hero' | 'inline';
  /** Caption under the hero number, e.g. "day streak". */
  caption?: string;
}

/** Flame + count-up number. */
export function StreakBadge({ count, lit, variant = 'inline', caption = 'day streak' }: StreakBadgeProps) {
  const shown = useCountUp(count);
  const on = lit ?? count > 0;
  if (variant === 'hero') {
    return (
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: 10 }}>
        <StreakFlame size={72} lit={on} />
        <View>
          <Text variant="number" tone={on ? 'accent' : 'faint'}>{shown}</Text>
          <Text variant="label" tone="muted">{caption}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <StreakFlame size={20} lit={on} />
      <Text variant="bodyStrong" tone={on ? 'accent' : 'faint'}>{shown}</Text>
    </View>
  );
}
