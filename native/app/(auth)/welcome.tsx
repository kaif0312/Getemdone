import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Button, CoachSticker, Text, brand, useReduceMotion } from '@/ui';

/** Brand moment: always sunshine with ink text, in light and dark (same colour as the splash). */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  return (
    <View style={{ flex: 1, backgroundColor: brand.sun, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <Animated.View entering={reduce ? undefined : FadeInUp.springify().damping(14)}>
          <CoachSticker pose="blowing" size={252} animated />
        </Animated.View>
        <Animated.View entering={reduce ? undefined : FadeInDown.delay(120).springify()} style={{ alignItems: 'center', gap: 6 }}>
          <Text variant="display" style={{ color: brand.ink, fontSize: 46, lineHeight: 50 }} align="center">Get it done.</Text>
          <Text variant="subheading" style={{ color: brand.ink, opacity: 0.72 }} align="center">
            Your coach is watching.{'\n'}Your friends are too.
          </Text>
        </Animated.View>
      </View>
      <Animated.View entering={reduce ? undefined : FadeInDown.delay(260).springify()} style={{ gap: 14 }}>
        <Button label="Continue with WhatsApp" icon="message" size="lg" fullWidth onPress={() => router.push('/whatsapp')} />
        <Button label="Use email" variant="secondary" size="lg" fullWidth onPress={() => router.push('/email')} />
      </Animated.View>
    </View>
  );
}
