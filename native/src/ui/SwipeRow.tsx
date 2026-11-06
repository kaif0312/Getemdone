import React, { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring, Extrapolation } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Icon, type IconName } from './Icon';
import { haptic, springs } from './motion';
import { Text } from './Text';
import { radius as radii, useTheme } from './theme';

export interface SwipeAction {
  key: string;
  label: string;
  icon?: IconName;
  tone?: 'primary' | 'accent' | 'danger' | 'sun';
  onPress: () => void;
}

export interface SwipeRowProps {
  children: React.ReactNode;
  /** Swipe right past the threshold: fires once and the row springs back (the data change moves it away). */
  onSwipeRight?: () => void;
  rightLabel?: string;
  /** Swipe left to reveal these (e.g. Tomorrow, Delete). */
  actions?: SwipeAction[];
  disabled?: boolean;
  radius?: number;
}

const ACTION_W = 84;
const COMMIT = 96;
const MAX_RIGHT = 150;

/**
 * Swipe row. Right = done (green, haptic when you cross the line). Left = action buttons.
 * Needs <GestureHandlerRootView> at the root (already in app/_layout.tsx). Vertical scrolling still works.
 */
export function SwipeRow({ children, onSwipeRight, rightLabel = 'Done', actions = [], disabled, radius = radii.lg }: SwipeRowProps) {
  const { colors } = useTheme();
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const crossed = useSharedValue(false);
  const openW = actions.length * ACTION_W;

  const fireRight = useCallback(() => {
    haptic.success();
    onSwipeRight?.();
  }, [onSwipeRight]);
  const tick = useCallback(() => haptic.medium(), []);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onStart(() => {
      start.value = x.value;
    })
    .onUpdate((e) => {
      const next = start.value + e.translationX;
      const lo = actions.length ? -openW - 24 : 0;
      const hi = onSwipeRight ? MAX_RIGHT : 0;
      x.value = Math.max(lo, Math.min(hi, next));
      const over = x.value >= COMMIT;
      if (over && !crossed.value) {
        crossed.value = true;
        scheduleOnRN(tick);
      } else if (!over && crossed.value) {
        crossed.value = false;
      }
    })
    .onEnd(() => {
      if (x.value >= COMMIT && onSwipeRight) {
        scheduleOnRN(fireRight);
        x.value = withSpring(0, springs.sheet);
      } else if (actions.length && x.value < -openW * 0.45) {
        x.value = withSpring(-openW, springs.sheet);
      } else {
        x.value = withSpring(0, springs.sheet);
      }
      crossed.value = false;
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const doneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, 24, COMMIT], [0, 0.85, 1], Extrapolation.CLAMP),
  }));
  const doneIcon = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(x.value, [0, COMMIT, MAX_RIGHT], [0.6, 1, 1.25], Extrapolation.CLAMP) }],
  }));

  const close = () => {
    x.value = withSpring(0, springs.sheet);
  };

  const toneColor = (t: SwipeAction['tone']) =>
    ({ primary: colors.primary, accent: colors.accent, danger: colors.danger, sun: colors.sunEdge })[t ?? 'primary'];

  return (
    <View style={{ borderRadius: radius, overflow: 'hidden' }}>
      {onSwipeRight ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.done, { backgroundColor: colors.success }, doneStyle]}>
          <Animated.View style={[styles.doneInner, doneIcon]}>
            <Icon name="check" size={26} color="#fff" strokeWidth={3.4} />
            <Text variant="bodyStrong" tone="onFill">{rightLabel}</Text>
          </Animated.View>
        </Animated.View>
      ) : null}
      {actions.length ? (
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: 'flex-end' }]}>
          {actions.map((a) => (
            <Pressable
              key={a.key}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                haptic.light();
                close();
                a.onPress();
              }}
              style={{ width: ACTION_W, backgroundColor: toneColor(a.tone), alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              {a.icon ? <Icon name={a.icon} size={22} color="#fff" /> : null}
              <Text variant="caption" tone="onFill">{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  done: { justifyContent: 'center', paddingLeft: 22 },
  doneInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
