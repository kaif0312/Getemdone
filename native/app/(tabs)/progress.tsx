// PLACEHOLDER: wave 2 replaces this file wholesale. Feature code goes in src/features/progress/.
import React from 'react';
import { useRouter } from 'expo-router';
import { useNotificationsInbox } from '@/hooks/useNotificationsInbox';
import { EmptyState, Header, Screen } from '@/ui';

export default function Progress() {
  const router = useRouter();
  const { unread } = useNotificationsInbox();
  return (
    <Screen header={<Header title="Progress" unread={unread} onBellPress={() => router.push('/inbox')} />}>
      <EmptyState pose="sleepy" title="Progress goes here." body="Wave 2 builds this screen." compact />
    </Screen>
  );
}
