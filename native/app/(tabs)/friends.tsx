import React, { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNotificationsInbox } from '@/hooks/useNotificationsInbox';
import { ActivityCard, QuietRow } from '@/features/friends/ActivityCard';
import { FriendStrip } from '@/features/friends/FriendStrip';
import { first } from '@/features/friends/logic';
import { RequestsBanner } from '@/features/friends/RequestsBanner';
import { TodayBoard } from '@/features/friends/TodayBoard';
import { useBoard } from '@/features/friends/useBoard';
import type { UserDoc } from '@/lib/types-extra';
import { Card, EmptyState, haptic, Header, Icon, Screen, SkeletonList, Text, useToast, useTheme } from '@/ui';

function SectionLabel({ children, action }: { children: string; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
      <Text variant="label" tone="muted">{children}</Text>
      {action}
    </View>
  );
}

export default function Friends() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { unread } = useNotificationsInbox();
  const b = useBoard();

  const nudge = useCallback(
    async (f: UserDoc) => {
      const r = await b.nudges.nudge(f.id);
      if (r === 'sent') toast.show(`Nudged ${first(f.displayName)}.`, { kind: 'success' });
      else if (r === 'already') toast.show(`You already nudged ${first(f.displayName)} today.`, { kind: 'info' });
      else toast.show("Couldn't nudge. Try again.", { kind: 'error' });
    },
    [b.nudges, toast],
  );

  const addButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add a friend"
      onPress={() => {
        haptic.select();
        router.push('/friends/add');
      }}
      style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, borderBottomWidth: 4, borderBottomColor: colors.primaryEdge, alignItems: 'center', justifyContent: 'center' }}
    >
      <Icon name="userPlus" size={22} color={colors.onFill} />
    </Pressable>
  );

  const header = (
    <Header
      title="Friends"
      subtitle={b.friends.length ? `${b.friends.length} watching you` : undefined}
      unread={unread}
      onBellPress={() => router.push('/inbox')}
      right={addButton}
    />
  );

  if (b.loading) {
    return (
      <Screen header={header}>
        <SkeletonList count={4} />
      </Screen>
    );
  }

  if (b.friends.length === 0) {
    return (
      <Screen header={header}>
        <RequestsBanner invites={b.incomingInvites} />
        <EmptyState
          pose="blowing"
          title="Bring a friend."
          body="Accountability needs witnesses."
          action={{ label: 'Invite a friend', icon: 'userPlus', onPress: () => router.push('/friends/add') }}
        />
      </Screen>
    );
  }

  return (
    <Screen header={header} gap={14}>
      <RequestsBanner invites={b.incomingInvites} />
      <FriendStrip friends={b.friends} presence={b.presence} stats={b.stats} onAdd={() => router.push('/friends/add')} />
      <TodayBoard rows={b.ranked} headline={b.headline} />

      {b.feeds.active.length > 0 ? <SectionLabel>Wins</SectionLabel> : null}
      {b.feeds.active.map((feed) => (
        <ActivityCard
          key={feed.friend.id}
          feed={feed}
          presence={b.presence[feed.friend.id]}
          nudgeSent={!!b.nudges.sent[feed.friend.id]}
          nudgeBusy={!!b.nudges.busy[feed.friend.id]}
          onNudge={() => nudge(feed.friend)}
        />
      ))}

      {b.feeds.quiet.length > 0 ? (
        <>
          <SectionLabel>Quiet so far</SectionLabel>
          <Card padding={16}>
            <View style={{ gap: 14 }}>
              {b.feeds.quiet.map((feed) => {
                const st = b.stats[feed.friend.id];
                return (
                  <QuietRow
                    key={feed.friend.id}
                    feed={feed}
                    presence={b.presence[feed.friend.id]}
                    pending={st ? st.total - st.done : 0}
                    nudgeSent={!!b.nudges.sent[feed.friend.id]}
                    nudgeBusy={!!b.nudges.busy[feed.friend.id]}
                    onNudge={() => nudge(feed.friend)}
                  />
                );
              })}
            </View>
          </Card>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptic.select();
          router.push('/friends/groups');
        }}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 }}
      >
        <Icon name="users" size={18} color={colors.primary} />
        <Text variant="bodyStrong" tone="primary">Friend groups</Text>
      </Pressable>
    </Screen>
  );
}
