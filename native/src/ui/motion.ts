/**
 * Motion + haptics helpers. Every animation in the kit goes through these so Reduce Motion and web are handled once.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useReducedMotion } from 'react-native-reanimated';

/** Spring presets (Reanimated). Chunky, quick, a little bouncy. */
export const springs = {
  press: { damping: 18, stiffness: 420, mass: 0.6 },
  bounce: { damping: 9, stiffness: 320, mass: 0.7 },
  sheet: { damping: 22, stiffness: 260, mass: 0.9 },
  gentle: { damping: 20, stiffness: 180, mass: 1 },
} as const;

/** True when the OS asks for reduced motion. Use to skip loops, bounces and confetti. */
export function useReduceMotion(): boolean {
  return useReducedMotion();
}

const native = Platform.OS === 'ios' || Platform.OS === 'android';

/** Fire-and-forget haptics; never throws, no-op on web. */
export const haptic = {
  light: () => {
    if (native) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  medium: () => {
    if (native) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  heavy: () => {
    if (native) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  },
  select: () => {
    if (native) void Haptics.selectionAsync().catch(() => {});
  },
  success: () => {
    if (native) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning: () => {
    if (native) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error: () => {
    if (native) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
