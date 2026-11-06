// Erase the coach's WhatsApp chat memory. This opens the coach chat with "delete my data", the bot's own command on main
// (`forgetMe`, lib/wa/privacy.ts in the web repo): it asks Delete / Keep, then deletes the chat session and unlinks the
// number. Tasks, workouts and the account stay. Deleting the whole account is /me/delete-account.
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, CoachSticker, SheetScaffold, Text, useToast } from '@/ui';
import { openCoachChat } from '@/features/settings/links';

export default function DeleteData() {
  const router = useRouter();
  const toast = useToast();
  return (
    <SheetScaffold fit title="Erase WhatsApp chat" hideClose>
      <View style={{ alignItems: 'center', gap: 8, paddingBottom: 12 }}>
        <CoachSticker pose="disappointed" size={120} />
        <Text variant="heading" align="center">Erase what the coach remembers.</Text>
        <Text tone="muted" align="center">
          Deletes your WhatsApp chat history with the coach and disconnects your number from Nudge. Your account, tasks and workouts stay.
        </Text>
        <Text variant="caption" tone="muted" align="center">
          Opens WhatsApp with "delete my data". Confirm there. To delete everything, use Delete account.
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}>
          <Button
            label="Open WhatsApp"
            variant="danger"
            fullWidth
            onPress={() => {
              void openCoachChat('delete my data').then((ok) => {
                if (!ok) toast.show('Could not open WhatsApp. Send "delete my data" to the coach.', { kind: 'error' });
              });
              router.back();
            }}
          />
          <Button
            label="Delete my whole account"
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/me/delete-account')}
          />
          <Button label="Keep it" variant="ghost" fullWidth onPress={() => router.back()} />
        </View>
      </View>
    </SheetScaffold>
  );
}
