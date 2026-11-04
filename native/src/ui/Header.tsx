import React, { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { haptic, useReduceMotion } from './motion';
import { Text } from './Text';
import { radius, useTheme } from './theme';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Unread notifications. Shows a badge on the bell and shakes it when the count goes up. */
  unread?: number;
  /** Omit to hide the bell. */
  onBellPress?: () => void;
  /** Anything on the left of the title (e.g. an Avatar). */
  left?: React.ReactNode;
  /** Extra actions to the left of the bell. */
  right?: React.ReactNode;
  /** Skip the top safe-area padding (when the screen is inside a sheet). */
  noInset?: boolean;
}

/** Big tab header: title, optional subtitle, bell with badge. Use at the top of every tab screen. */
export function Header({ title, subtitle, unread = 0, onBellPress, left, right, noInset }: HeaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const rot = useSharedValue(0);
  const prev = useRef(unread);
  useEffect(() => {
    if (unread > prev.current && !reduce) {
      rot.value = withSequence(
        withTiming(-16, { duration: 70 }), withTiming(14, { duration: 90 }), withTiming(-9, { duration: 90 }),
        withTiming(6, { duration: 80 }), withTiming(0, { duration: 80 }),
      );
    }
    prev.current = unread;
  }, [unread, reduce, rot]);
  const bell = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value}deg` }] }));

  return (
    <View style={{ paddingTop: noInset ? 12 : insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {left}
      <View style={{ flex: 1 }}>
        <Text variant="title" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="caption" tone="muted" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
      {onBellPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          onPress={() => {
            haptic.select();
            onBellPress();
          }}
          style={{
            width: 46, height: 46, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Animated.View style={bell}>
            <Icon name="bell" size={22} color={colors.text} />
          </Animated.View>
          {unread > 0 ? (
            <View
              style={{
                position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10,
                backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text variant="caption" tone="onFill" style={{ fontSize: 11, lineHeight: 14, fontFamily: 'Nunito_900Black' }}>
                {unread > 9 ? '9+' : unread}
              </Text>
            </View>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}
