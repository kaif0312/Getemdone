import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { haptic, Icon, useTheme } from '@/ui';

/** Round back button for the header `left` slot of stack (non-tab) screens. */
export function BackButton() {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => {
        haptic.select();
        router.back();
      }}
      style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name="chevronLeft" size={22} color={colors.text} />
    </Pressable>
  );
}
