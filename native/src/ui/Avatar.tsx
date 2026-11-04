import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { StreakFlame } from './StreakFlame';
import { useReduceMotion } from './motion';
import { Text } from './Text';
import { brand, useTheme } from './theme';

const PALETTE = [
  { bg: '#EEE7FB', fg: '#5B34B0', dbg: '#3A2A68', dfg: '#CDB9FF' },
  { bg: '#FFE8DA', fg: '#C2410C', dbg: '#4A2A1A', dfg: '#FFB88A' },
  { bg: '#DDF5E8', fg: '#1E8F58', dbg: '#173B2C', dfg: '#8FE3B8' },
  { bg: '#FFF0C9', fg: '#9A6A00', dbg: '#46381A', dfg: '#F7D27A' },
  { bg: '#FFE0EC', fg: '#B0245C', dbg: '#4A1D33', dfg: '#FFA6C8' },
  { bg: '#DCEBFF', fg: '#1F5FBF', dbg: '#1B3052', dfg: '#9CC4FF' },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface AvatarProps {
  name: string;
  photoURL?: string | null;
  size?: number;
  /** 'focus' pulses an orange ring (friend is in a focus session); 'done' shows a green ring (cleared today). */
  ring?: 'none' | 'focus' | 'done';
  /** Shows a small flame badge with the number when > 0. */
  streak?: number;
}

export function Avatar({ name, photoURL, size = 48, ring = 'none', streak }: AvatarProps) {
  const { colors, isDark } = useTheme();
  const reduce = useReduceMotion();
  const p = PALETTE[hash(name || '?') % PALETTE.length];
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (ring !== 'focus' || reduce) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [ring, reduce, pulse]);
  const pad = ring === 'none' ? 0 : 4;
  const ringColor = ring === 'focus' ? colors.accent : colors.success;
  const total = size + pad * 2 + (ring === 'none' ? 0 : 4);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 0.35 }],
  }));

  return (
    <View style={{ width: total, height: total, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={name}>
      {ring === 'focus' ? (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', width: total, height: total, borderRadius: total, backgroundColor: ringColor }, pulseStyle]}
        />
      ) : null}
      {ring !== 'none' ? (
        <View
          style={{
            position: 'absolute', width: total, height: total, borderRadius: total, borderWidth: 3, borderColor: ringColor,
          }}
        />
      ) : null}
      <View
        style={{
          width: size, height: size, borderRadius: size, overflow: 'hidden',
          backgroundColor: isDark ? p.dbg : p.bg, alignItems: 'center', justifyContent: 'center',
        }}
      >
        {photoURL ? (
          <Image source={{ uri: photoURL }} style={{ width: size, height: size }} contentFit="cover" transition={150} />
        ) : (
          <Text variant="heading" style={{ color: isDark ? p.dfg : p.fg, fontSize: size * 0.4, lineHeight: size * 0.5 }}>
            {initialsOf(name)}
          </Text>
        )}
      </View>
      {streak && streak > 0 ? (
        <View
          style={{
            position: 'absolute', right: -6, bottom: -4, flexDirection: 'row', alignItems: 'center', gap: 1,
            backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 5, height: 22,
            borderWidth: 2, borderColor: colors.bg,
          }}
        >
          <StreakFlame size={13} />
          <Text variant="caption" style={{ color: brand.orange, fontFamily: 'Nunito_900Black', fontSize: 12 }}>{streak}</Text>
        </View>
      ) : null}
    </View>
  );
}
