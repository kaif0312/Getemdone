import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatElapsed, presenceElapsedSeconds } from '@/hooks/usePresence';
import type { FocusPresenceData } from '@/lib/types';
import type { UserDoc } from '@/lib/types-extra';
import { Avatar, haptic, Icon, Text, useTheme } from '@/ui';
import { first, type DayStats } from './logic';

export interface FriendStripProps {
  friends: UserDoc[];
  presence: Record<string, FocusPresenceData | null>;
  stats: Record<string, DayStats>;
  onAdd: () => void;
}

/** Top row: add tile, then everyone. Orange pulsing ring = focusing right now, green ring = cleared today, flame = streak. */
export function FriendStrip({ friends, presence, stats, onAdd }: FriendStripProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const sorted = [...friends].sort((a, b) => {
    const fa = presence[a.id] ? 1 : 0;
    const fb = presence[b.id] ? 1 : 0;
    return fb - fa || (b.streakData?.currentStreak ?? 0) - (a.streakData?.currentStreak ?? 0) || a.displayName.localeCompare(b.displayName);
  });
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 8, gap: 14 }}
      style={{ marginHorizontal: -20, flexGrow: 0 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a friend"
        onPress={() => {
          haptic.select();
          onAdd();
        }}
        style={{ width: 68, alignItems: 'center', gap: 6 }}
      >
        <View
          style={{
            width: 60, height: 60, borderRadius: 30, borderWidth: 2.5, borderStyle: 'dashed', borderColor: colors.primary,
            backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginTop: 4,
          }}
        >
          <Icon name="plus" size={26} color={colors.primary} strokeWidth={3} />
        </View>
        <Text variant="caption" tone="primary" style={{ fontFamily: 'Nunito_800ExtraBold' }}>Invite</Text>
      </Pressable>
      {sorted.map((f) => {
        const p = presence[f.id];
        const st = stats[f.id];
        const cleared = !!st && st.total > 0 && st.done >= st.total;
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            accessibilityLabel={`${f.displayName}${p ? ', focusing now' : ''}${cleared ? ', cleared today' : ''}`}
            onPress={() => {
              haptic.select();
              router.push(`/friend/${f.id}`);
            }}
            style={{ width: 68, alignItems: 'center', gap: 6 }}
          >
            <View style={{ marginTop: 0 }}>
              <Avatar
                name={f.displayName}
                photoURL={f.photoURL}
                size={56}
                ring={p ? 'focus' : cleared ? 'done' : 'none'}
                streak={f.streakData?.currentStreak}
              />
            </View>
            <Text variant="caption" numberOfLines={1} style={{ fontFamily: 'Nunito_800ExtraBold', maxWidth: 68 }}>{first(f.displayName)}</Text>
            {p ? (
              <Text variant="caption" tone="accent" numberOfLines={1} style={{ marginTop: -6, fontSize: 11, lineHeight: 14 }}>
                {formatElapsed(presenceElapsedSeconds(p))}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
