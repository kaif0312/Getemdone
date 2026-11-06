import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFriends } from '@/hooks/useFriends';
import { useTaskSocial } from '@/hooks/useTaskSocial';
import { ENCOURAGEMENTS, first } from '@/features/friends/logic';
import { Button, haptic, SheetScaffold, Text, TextField, useToast, useTheme } from '@/ui';

/** Pick one of the PWA's encouragement messages (or write your own). Sends the same notification as the PWA. */
export default function Encourage() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { friends } = useFriends();
  const social = useTaskSocial();
  const friend = friends.find((f) => f.id === uid);
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState<string | null>(null);
  const name = friend ? first(friend.displayName) : 'them';

  const send = async (message: string) => {
    if (!uid || sending) return;
    setSending(message);
    haptic.light();
    try {
      await social.sendEncouragement(uid, message);
      haptic.success();
      toast.show(`Sent to ${name}.`, { kind: 'success' });
      router.back();
    } catch {
      setSending(null);
      toast.show("Couldn't send. Try again.", { kind: 'error' });
    }
  };

  return (
    <SheetScaffold title={`Encourage ${name}`}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 28 }}>
          {ENCOURAGEMENTS.map((m) => (
            <Pressable
              key={m.text}
              accessibilityRole="button"
              disabled={!!sending}
              onPress={() => send(m.text)}
              style={{
                minHeight: 56, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: sending === m.text ? colors.primarySoft : colors.surface, borderWidth: 2, borderColor: colors.border, borderBottomWidth: 4,
                opacity: sending && sending !== m.text ? 0.5 : 1,
              }}
            >
              <Text style={{ fontSize: 26 }}>{m.emoji}</Text>
              <Text variant="bodyStrong" style={{ flex: 1 }}>{m.text.replace(/ ?[^\w\s'!.,]+$/u, '')}</Text>
            </Pressable>
          ))}
          <View style={{ gap: 10, marginTop: 8 }}>
            <TextField label="Or say it yourself" value={custom} onChangeText={setCustom} placeholder="Your message" maxLength={150} returnKeyType="send" onSubmitEditing={() => custom.trim() && send(custom.trim())} />
            <Button label="Send" icon="send" fullWidth disabled={!custom.trim() || !!sending} loading={!!sending && sending === custom.trim()} onPress={() => send(custom.trim())} />
          </View>
        </ScrollView>
    </SheetScaffold>
  );
}
