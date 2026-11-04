import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { haptic, springs } from './motion';
import { radius, useTheme } from './theme';

export interface CardProps {
  children?: React.ReactNode;
  /** Makes the whole card tappable (compresses slightly). */
  onPress?: () => void;
  /** Chunky solid bottom edge, like the buttons. Default true. */
  raised?: boolean;
  /** Fill tint. */
  tone?: 'surface' | 'primary' | 'accent' | 'sun' | 'success' | 'danger';
  padding?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({ children, onPress, raised = true, tone = 'surface', padding = 16, style, testID }: CardProps) {
  const { colors } = useTheme();
  const s = useSharedValue(0);
  const fill = {
    surface: colors.surface, primary: colors.primarySoft, accent: colors.accentSoft,
    sun: colors.sunSoft, success: colors.successSoft, danger: colors.dangerSoft,
  }[tone];
  const edge = tone === 'surface' ? colors.border : {
    primary: colors.primary, accent: colors.accent, sun: colors.sun, success: colors.success, danger: colors.danger,
  }[tone];
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: s.value * 3 }] }));
  const EDGE = raised ? 4 : 0;

  const body = (
    <View style={{ paddingBottom: EDGE }}>
      {raised ? <View style={[styles.edge, { backgroundColor: edge, borderRadius: radius.lg }]} /> : null}
      <Animated.View
        style={[
          { backgroundColor: fill, borderRadius: radius.lg, borderWidth: 2, borderColor: edge, padding },
          onPress ? anim : null,
          style,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );

  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPressIn={() => {
        haptic.select();
        s.value = withSpring(1, springs.press);
      }}
      onPressOut={() => (s.value = withSpring(0, springs.press))}
      onPress={onPress}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  edge: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 4 },
});
