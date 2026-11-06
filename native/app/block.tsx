// Block a person (App Store guideline 1.2). Params: uid, name. POST /api/app/block (useBlocks): the friendship ends both ways,
// friend requests between you stop, and their comments, reactions and notifications disappear from your app. They are not
// told. Undo in Me > Privacy and security > Blocked people.
import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBlocks } from '@/hooks/useBlocks';
import { useFriends } from '@/hooks/useFriends';
import { safetyErrorText } from '@/lib/safetyApi';
import { first } from '@/features/friends/logic';
import { Avatar, Button, CoachSticker, haptic, SheetScaffold, Text, useToast } from '@/ui';

export default function Block() {
  const { uid, name: nameParam } = useLocalSearchParams<{ uid: string; name?: string }>();
  const router = useRouter();
  const toast = useToast();
  const { friends } = useFriends();
  const { block } = useBlocks();
  const friend = friends.find((f) => f.id === uid);
  const name = friend?.displayName ?? nameParam ?? 'this person';
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!uid || busy) return;
    setBusy(true);
    haptic.warning();
    const r = await block(uid);
    if (r.ok) {
      toast.show(`Blocked ${first(name)}.`, { kind: 'info' });
      // close this sheet and whatever opened it (profile, comments)
      router.dismissAll();
    } else {
      setBusy(false);
      toast.show(safetyErrorText(r.error), { kind: 'error' });
    }
  };

  return (
    <SheetScaffold title={`Block ${first(name)}?`} hideClose>
      <View style={{ alignItems: 'center', gap: 10, paddingTop: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CoachSticker pose="disappointed" size={84} animated={false} />
          {friend ? <Avatar name={friend.displayName} photoURL={friend.photoURL} size={56} /> : null}
        </View>
        <Text variant="body" align="center" tone="muted" style={{ maxWidth: 320 }}>
          {`You stop being friends, ${first(name)} can't send you requests, and you won't see their comments or reactions. They aren't told. Undo it in Privacy and security.`}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignSelf: 'stretch' }}>
          <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" fullWidth onPress={() => router.back()} /></View>
          <View style={{ flex: 1 }}><Button label="Block" variant="danger" fullWidth loading={busy} onPress={() => void confirm()} /></View>
        </View>
      </View>
    </SheetScaffold>
  );
}
