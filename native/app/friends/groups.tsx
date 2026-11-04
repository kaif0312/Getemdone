import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useFriends } from '@/hooks/useFriends';
import { BackButton } from '@/features/friends/BackButton';
import { Avatar, Card, EmptyState, haptic, Header, Icon, Screen, Text, useTheme } from '@/ui';

export default function Groups() {
  const router = useRouter();
  const { profile } = useAuth();
  const { friends } = useFriends();
  const { colors } = useTheme();
  const groups = profile?.friendGroups ?? [];
  const byId = Object.fromEntries(friends.map((f) => [f.id, f]));

  return (
    <Screen
      tabs={false}
      header={
        <Header
          title="Groups"
          subtitle="Pick who sees a task"
          left={<BackButton />}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New group"
              onPress={() => {
                haptic.select();
                router.push({ pathname: '/friends/group', params: { id: 'new' } });
              }}
              style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, borderBottomWidth: 4, borderBottomColor: colors.primaryEdge, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="plus" size={24} color={colors.onFill} strokeWidth={3} />
            </Pressable>
          }
        />
      }
    >
      {groups.length === 0 ? (
        <EmptyState
          pose="clipboard"
          title="No groups yet."
          body="Make one, then share a task with just that group."
          action={{ label: 'New group', icon: 'plus', onPress: () => router.push({ pathname: '/friends/group', params: { id: 'new' } }) }}
        />
      ) : (
        groups.map((g) => {
          const members = g.memberIds.map((id) => byId[id]).filter(Boolean);
          return (
            <Card key={g.id} onPress={() => router.push({ pathname: '/friends/group', params: { id: g.id } })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text variant="subheading" numberOfLines={1}>{g.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {members.slice(0, 5).map((m, i) => (
                      <View key={m.id} style={{ marginLeft: i ? -10 : 0, borderRadius: 20, borderWidth: 2, borderColor: colors.surface }}>
                        <Avatar name={m.displayName} photoURL={m.photoURL} size={30} />
                      </View>
                    ))}
                    <Text variant="caption" tone="muted" style={{ marginLeft: 10 }}>
                      {g.memberIds.length} {g.memberIds.length === 1 ? 'friend' : 'friends'}
                    </Text>
                  </View>
                </View>
                <Icon name="chevronRight" size={20} color={colors.textFaint} />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
