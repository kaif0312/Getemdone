// Sign-out confirm sheet.
import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Button, CoachSticker, SheetScaffold, Text } from '@/ui';

export default function SignOut() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  return (
    <SheetScaffold fit title="Sign out" hideClose>
      <View style={{ alignItems: 'center', gap: 8, paddingBottom: 12 }}>
        <CoachSticker pose="disappointed" size={120} />
        <Text variant="heading" align="center">Leaving already?</Text>
        <Text tone="muted" align="center">Your tasks and streak stay safe. You will need to sign in again to see them.</Text>
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}>
          <Button
            label="Sign out"
            variant="danger"
            fullWidth
            loading={busy}
            onPress={() => {
              setBusy(true);
              void signOut().finally(() => setBusy(false));
            }}
          />
          <Button label="Stay" variant="ghost" fullWidth onPress={() => router.back()} />
        </View>
      </View>
    </SheetScaffold>
  );
}
