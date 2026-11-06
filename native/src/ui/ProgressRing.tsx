import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { springs, useReduceMotion } from './motion';
import { useTheme } from './theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0..1 */
  progress: number;
  size?: number;
  /** Thick on purpose (chunky look). */
  stroke?: number;
  /** Defaults to primary; becomes success at 100%. */
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}

export function ProgressRing({ progress, size = 96, stroke = 12, color, trackColor, children }: ProgressRingProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = useSharedValue(0);
  const clamped = Math.max(0, Math.min(1, progress || 0));
  useEffect(() => {
    p.value = reduce ? withTiming(clamped, { duration: 120 }) : withSpring(clamped, springs.gentle);
  }, [clamped, reduce, p]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - p.value) }));
  const fill = color ?? (clamped >= 1 ? colors.success : colors.primary);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={fill}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          animatedProps={props}
        />
      </Svg>
      {children}
    </View>
  );
}
