import React, { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWhatsAppLogin } from '@/hooks/useWhatsAppLogin';
import { Button, CoachSticker, Icon, Skeleton, Text, haptic, radius, useReduceMotion, useTheme, useToast } from '@/ui';

function Dot({ i }: { i: number }) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const o = useSharedValue(0.3);
  useEffect(() => {
    if (reduce) return;
    o.value = withDelay(i * 180, withRepeat(withSequence(withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }), withTiming(0.3, { duration: 400 })), -1));
  }, [i, reduce, o]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary }, s]} />;
}

export default function WhatsAppLogin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { phase, session, error, restart } = useWhatsAppLogin();
  const [opened, setOpened] = useState(false);

  const openWhatsApp = async () => {
    if (!session) return;
    setOpened(true);
    try {
      await Linking.openURL(session.waLink);
    } catch {
      toast.show('Could not open WhatsApp. Send the code to the Nudge number.', { kind: 'error' });
    }
  };
  const copy = async () => {
    if (!session) return;
    await Clipboard.setStringAsync(`LOGIN ${session.code}`);
    haptic.success();
    toast.show('Copied. Paste it in WhatsApp.', { kind: 'success' });
  };

  const pose = phase === 'expired' || phase === 'error' ? 'disappointed' : phase === 'signingIn' ? 'cheer' : 'waiting';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }}>
      <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, justifyContent: 'center' }}>
        <Icon name="chevronLeft" size={28} color={colors.text} />
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <CoachSticker pose={pose} size={170} animated={phase === 'waiting'} />

        {phase === 'starting' ? (
          <View style={{ alignItems: 'center', gap: 12 }}>
            <Text variant="title">Getting your code…</Text>
            <Skeleton width={220} height={64} radius={radius.lg} />
          </View>
        ) : null}

        {phase === 'waiting' && session ? (
          <>
            <Text variant="title" align="center">Send this to the coach.</Text>
            <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel={`Login code ${session.code}. Tap to copy`}>
              <View
                style={{
                  backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 6,
                  borderRadius: radius.xl, paddingVertical: 14, paddingHorizontal: 26,
                }}
              >
                <Text variant="display" style={{ letterSpacing: 8, fontSize: 40 }} tone="primary">{session.code}</Text>
              </View>
            </Pressable>
            <Text tone="muted" align="center" style={{ maxWidth: 300 }}>
              WhatsApp opens with the message ready. Just hit send.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text variant="caption" tone="muted">{opened ? 'Waiting for your message' : 'Waiting'}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Dot i={0} /><Dot i={1} /><Dot i={2} />
              </View>
            </View>
          </>
        ) : null}

        {phase === 'signingIn' ? <Text variant="title">Got it. Signing you in…</Text> : null}

        {phase === 'expired' ? (
          <>
            <Text variant="title" align="center">Code expired.</Text>
            <Text tone="muted" align="center">They only last a few minutes.</Text>
          </>
        ) : null}

        {phase === 'error' ? (
          <>
            <Text variant="title" align="center">That did not work.</Text>
            <Text tone="muted" align="center">{error ?? 'Check your connection and try again.'}</Text>
          </>
        ) : null}
      </View>

      <View style={{ gap: 12 }}>
        {phase === 'waiting' ? (
          <>
            <Button label="Open WhatsApp" icon="message" size="lg" fullWidth onPress={openWhatsApp} />
            <Button label="Copy message" variant="ghost" onPress={copy} />
          </>
        ) : null}
        {phase === 'expired' || phase === 'error' ? <Button label="Get a new code" icon="repeat" size="lg" fullWidth onPress={restart} /> : null}
      </View>
    </View>
  );
}
