// Delete-my-data request. The in-bot "delete my data" command lives on the unmerged `privacy` branch, so on main this sends the
// request to the coach on WhatsApp for a human to action. Swap the message for the real command once that branch ships.
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, CoachSticker, SheetScaffold, Text } from '@/ui';
import { openCoachChat } from '@/features/settings/links';

export default function DeleteData() {
  const router = useRouter();
  return (
    <SheetScaffold title="Delete my data" hideClose>
      <View style={{ alignItems: 'center', gap: 8, paddingBottom: 12 }}>
        <CoachSticker pose="disappointed" size={120} />
        <Text variant="heading" align="center">This erases your account data.</Text>
        <Text tone="muted" align="center">
          Tasks, workouts, streaks and your WhatsApp link. It cannot be undone. Send the request to the coach on WhatsApp and we will confirm when it is done.
        </Text>
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}>
          <Button
            label="Send delete request"
            variant="danger"
            fullWidth
            onPress={() => {
              void openCoachChat('Delete my data');
              router.back();
            }}
          />
          <Button label="Keep my data" variant="ghost" fullWidth onPress={() => router.back()} />
        </View>
      </View>
    </SheetScaffold>
  );
}
