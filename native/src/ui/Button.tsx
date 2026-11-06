import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic, springs, useReduceMotion } from './motion';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { HIT, radius, useTheme } from './theme';

export type ButtonVariant = 'primary' | 'accent' | 'success' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SIZES: Record<ButtonSize, { h: number; px: number; font: 'bodyStrong' | 'subheading'; icon: number }> = {
  sm: { h: HIT, px: 16, font: 'bodyStrong', icon: 18 },
  md: { h: 54, px: 22, font: 'subheading', icon: 20 },
  lg: { h: 62, px: 28, font: 'subheading', icon: 22 },
};
const EDGE = 5;

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon from the kit icon set. */
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Danger-coloured label on secondary/ghost (e.g. Cancel meeting). */
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * Tactile 3D button: a solid edge under the face; pressing sinks the face onto the edge (spring) with a light haptic.
 * Ghost has no edge (text only, fades on press).
 */
export function Button({
  label, onPress, variant = 'primary', size = 'md', icon, loading, disabled, fullWidth, destructive, style, testID, accessibilityLabel,
}: ButtonProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const pressed = useSharedValue(0);
  const dims = SIZES[size];
  const inactive = disabled || loading;

  const palette = (() => {
    switch (variant) {
      case 'accent': return { face: colors.accent, edge: colors.accentEdge, fg: colors.onFill, border: 'transparent' };
      case 'success': return { face: colors.success, edge: colors.successEdge, fg: colors.onFill, border: 'transparent' };
      case 'danger': return { face: colors.danger, edge: colors.dangerEdge, fg: colors.onFill, border: 'transparent' };
      case 'secondary': return { face: colors.surface, edge: colors.border, fg: destructive ? colors.danger : colors.primary, border: colors.border };
      case 'ghost': return { face: 'transparent', edge: 'transparent', fg: colors.primary, border: 'transparent' };
      default: return { face: colors.primary, edge: colors.primaryEdge, fg: colors.onFill, border: 'transparent' };
    }
  })();
  const flat = variant === 'ghost';

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: flat ? 0 : pressed.value * EDGE }],
    opacity: flat ? 1 - pressed.value * 0.5 : 1,
  }));

  const setPressed = (to: number) => {
    pressed.value = reduce ? withTiming(to, { duration: 60 }) : withSpring(to, springs.press);
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPressIn={() => {
        haptic.light();
        setPressed(1);
      }}
      onPressOut={() => setPressed(0)}
      onPress={onPress}
      style={[
        { height: flat ? dims.h : dims.h + EDGE, opacity: disabled ? 0.45 : 1, alignSelf: fullWidth ? 'stretch' : 'flex-start' },
        style,
      ]}
    >
      {!flat && (
        <View
          style={[
            styles.edge,
            { height: dims.h, backgroundColor: palette.edge, borderRadius: radius.lg, top: EDGE },
          ]}
        />
      )}
      <Animated.View
        style={[
          styles.face,
          {
            height: dims.h,
            paddingHorizontal: dims.px,
            backgroundColor: palette.face,
            borderRadius: radius.lg,
            borderWidth: variant === 'secondary' ? 2 : 0,
            borderColor: palette.border,
          },
          faceStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={palette.fg} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={dims.icon} color={palette.fg} /> : null}
            <Text variant={dims.font} style={{ color: palette.fg }} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, right: 0 },
  face: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
