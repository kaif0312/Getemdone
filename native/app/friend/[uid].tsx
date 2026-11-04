// PLACEHOLDER: wave 2 (Friends) replaces this file wholesale (friend profile). Route: /friend/<uid>.
import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFriends } from '@/hooks/useFriends';
import { Avatar, EmptyState, Header, Screen, Text } from '@/ui';

export default function FriendProfile() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const router = useRouter();
  const { friends } = useFriends();
  const friend = friends.find((f) => f.id === uid);
  return (
    <Screen tabs={false} header={<Header title={friend?.displayName ?? 'Friend'} left={friend ? <Avatar name={friend.displayName} photoURL={friend.photoURL} /> : undefined} onBellPress={() => router.push('/inbox')} />}>
      {friend ? <Text tone="muted">Wave 2 builds this screen.</Text> : <EmptyState pose="sleepy" title="Friend not found." compact />}
    </Screen>
  );
}
