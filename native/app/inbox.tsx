// PLACEHOLDER: wave 2 (Progress + Me) replaces this file wholesale (notifications inbox sheet).
import React from 'react';
import { useNotificationsInbox } from '@/hooks/useNotificationsInbox';
import { EmptyState, SheetScaffold, SkeletonList, Text } from '@/ui';

export default function Inbox() {
  const { notifications, loading } = useNotificationsInbox();
  return (
    <SheetScaffold title="Notifications">
      {loading ? <SkeletonList count={3} /> : notifications.length === 0 ? <EmptyState pose="sleepy" title="Nothing yet." compact /> : <Text>{notifications.length} notifications</Text>}
    </SheetScaffold>
  );
}
