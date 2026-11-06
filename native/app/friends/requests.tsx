import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFriends, type FriendInvite } from '@/hooks/useFriends';
import { answerInviteApi, inviteErrorText } from '@/features/friends/api';
import { useInviters } from '@/features/friends/hooks';
import { timeAgo } from '@/features/friends/logic';
import { Avatar, Button, Card, EmptyState, haptic, SheetScaffold, StreakBadge, Text, useToast } from '@/ui';

export default function Requests() {
  const router = useRouter();
  const toast = useToast();
  const { incomingInvites } = useFriends();
  const inviters = useInviters(incomingInvites);
  // Optimistic: an answered card leaves at once; it comes back only if the server says no.
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const answer = async (inv: FriendInvite, accept: boolean) => {
    const who = inviters[inv.fromUid]?.displayName ?? 'them';
    setGone((g) => ({ ...g, [inv.id]: true }));
    setBusy((b) => ({ ...b, [inv.id]: true }));
    if (accept) haptic.success();
    else haptic.light();
    const r = await answerInviteApi(inv.id, accept);
    setBusy((b) => ({ ...b, [inv.id]: false }));
    if (r.ok) {
      toast.show(accept ? `You and ${who} are friends.` : 'Declined.', { kind: accept ? 'success' : 'info' });
    } else if (r.error === 'invite_already_answered' || r.error === 'invite_not_found') {
      // gone for real
    } else {
      setGone((g) => ({ ...g, [inv.id]: false }));
      toast.show(inviteErrorText(r.error), { kind: 'error' });
    }
  };

  const list = incomingInvites.filter((i) => !gone[i.id]);

  // Everything answered: close the sheet after the last card has left.
  const empty = list.length === 0;

  return (
    <SheetScaffold title="Friend requests">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
        {empty ? (
          <EmptyState
            pose="proud"
            title="All clear."
            body="No one is waiting on you."
            action={{ label: 'Done', variant: 'secondary', onPress: () => router.back() }}
            compact
          />
        ) : (
          list.map((inv) => {
            const p = inviters[inv.fromUid];
            return (
              <Card key={inv.id} padding={16}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <Avatar name={p?.displayName ?? '?'} photoURL={p?.photoURL} size={56} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="subheading" numberOfLines={1}>{p?.displayName ?? 'Someone'}</Text>
                    <Text variant="caption" tone="muted">Asked {timeAgo(inv.createdAt)} ago</Text>
                    <StreakBadge count={p?.streakData?.currentStreak ?? 0} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <View style={{ flex: 1 }}><Button label="Accept" icon="check" variant="success" loading={busy[inv.id]} fullWidth onPress={() => answer(inv, true)} /></View>
                  <View style={{ flex: 1 }}><Button label="Decline" variant="secondary" disabled={busy[inv.id]} fullWidth onPress={() => answer(inv, false)} /></View>
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>
    </SheetScaffold>
  );
}
