import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FriendInvite } from '@/hooks/useFriends';
import { Avatar, haptic, Icon, Text, useTheme } from '@/ui';
import { useInviters } from './hooks';

/** Sun-coloured banner when someone wants to be your friend. Tap opens the requests sheet. */
export function RequestsBanner({ invites }: { invites: FriendInvite[] }) {
  const { colors } = useTheme();
  const router = useRouter();
  const inviters = useInviters(invites);
  if (invites.length === 0) return null;
  const first = inviters[invites[0].fromUid];
  const label =
    invites.length === 1
      ? `${first?.displayName ?? 'Someone'} wants to be your friend`
      : `${invites.length} people want to be your friends`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.select();
        router.push('/friends/requests');
      }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.sunSoft, borderRadius: 20, padding: 12, paddingRight: 14,
        borderWidth: 2, borderColor: colors.sun, borderBottomWidth: 5,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        {invites.slice(0, 3).map((inv, i) => (
          <View key={inv.id} style={{ marginLeft: i ? -14 : 0, borderRadius: 24, borderWidth: 2, borderColor: colors.sunSoft }}>
            <Avatar name={inviters[inv.fromUid]?.displayName ?? '?'} photoURL={inviters[inv.fromUid]?.photoURL} size={38} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={2}>{label}</Text>
        <Text variant="caption" tone="muted">Accept or decline</Text>
      </View>
      <Icon name="chevronRight" size={20} color={colors.textMuted} />
    </Pressable>
  );
}
