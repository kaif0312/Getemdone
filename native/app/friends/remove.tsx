import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFriends } from '@/hooks/useFriends';
import { Avatar, Button, CoachSticker, haptic, SheetScaffold, Text, useToast } from '@/ui';

/** Confirm sheet for removing a friend (both sides lose each other, like the PWA). */
export default function RemoveFriend() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();
  const toast = useToast();
  const { friends, removeFriend } = useFriends();
  const friend = friends.find((f) => f.id === uid);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!uid || busy) return;
    setBusy(true);
    haptic.warning();
    try {
      await removeFriend(uid);
      toast.show('Removed.', { kind: 'info' });
      // close this sheet and the profile behind it
      router.dismissAll();
    } catch {
      setBusy(false);
      toast.show("Couldn't remove. Try again.", { kind: 'error' });
    }
  };

  return (
    <SheetScaffold title="Remove friend?" hideClose>
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CoachSticker pose="disappointed" size={84} animated={false} />
          {friend ? <Avatar name={friend.displayName} photoURL={friend.photoURL} size={56} /> : null}
        </View>
        <Text variant="body" align="center" tone="muted" style={{ maxWidth: 300 }}>
          {friend ? `${friend.displayName} and you stop seeing each other's tasks. You can add each other again later.` : 'You stop seeing each other.'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Button label="Keep" variant="secondary" style={{ flex: 1 }} fullWidth onPress={() => router.back()} />
          <Button label="Remove" variant="danger" style={{ flex: 1 }} fullWidth loading={busy} onPress={confirm} />
        </View>
      </View>
    </SheetScaffold>
  );
}
