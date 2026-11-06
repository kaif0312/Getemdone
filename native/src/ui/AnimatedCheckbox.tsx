import React, { useEffect, useRef } from 'react';
import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useAnimatedProps, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptic, springs, useReduceMotion } from './motion';
import { Text, type TextProps } from './Text';
import { useTheme } from './theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const CHECK_LEN = 24;

export interface AnimatedCheckboxProps {
  checked: boolean;
  onToggle?: (next: boolean) => void;
  size?: number;
  /** Fill colour when checked. Defaults to success green. */
  color?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * Round checkbox. On check: fill, the tick draws itself, a bounce, a success haptic. On uncheck: a light tap.
 * Controlled: animates whenever `checked` changes (also from outside, e.g. a swipe-to-done).
 */
export function AnimatedCheckbox({ checked, onToggle, size = 30, color, disabled, accessibilityLabel, testID }: AnimatedCheckboxProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const fillColor = color ?? colors.success;
  const progress = useSharedValue(checked ? 1 : 0);
  const scale = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) {
      progress.value = withTiming(checked ? 1 : 0, { duration: 80 });
      return;
    }
    progress.value = withTiming(checked ? 1 : 0, { duration: checked ? 260 : 140 });
    if (checked) scale.value = withSequence(withSpring(0.78, springs.press), withSpring(1.14, springs.bounce), withSpring(1, springs.press));
  }, [checked, reduce, progress, scale]);

  const box = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: progress.value > 0.02 ? fillColor : 'transparent',
    borderColor: progress.value > 0.02 ? fillColor : colors.border,
    opacity: 1,
  }));
  const tick = useAnimatedProps(() => ({ strokeDashoffset: CHECK_LEN * (1 - progress.value) }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={Math.max(0, (44 - size) / 2)}
      onPress={() => {
        const next = !checked;
        if (next) haptic.success();
        else haptic.light();
        onToggle?.(next);
      }}
    >
      <Animated.View
        style={[
          { width: size, height: size, borderRadius: size / 2, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
          box,
        ]}
      >
        <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
          <AnimatedPath
            d="M5 13l4 4L19 7"
            stroke="#FFFFFF"
            strokeWidth={3.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={`${CHECK_LEN} ${CHECK_LEN}`}
            animatedProps={tick}
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}

/** Task title that dims and strikes through when done. */
export function StrikeText({ struck, style, ...rest }: TextProps & { struck: boolean }) {
  return (
    <Text
      {...rest}
      tone={struck ? 'faint' : (rest.tone ?? 'default')}
      style={[struck ? { textDecorationLine: 'line-through' } : null, style]}
    />
  );
}
