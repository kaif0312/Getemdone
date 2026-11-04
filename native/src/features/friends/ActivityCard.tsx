import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FocusPresenceData } from '@/lib/types';
import { Avatar, Button, Card, haptic, Icon, Text, useTheme } from '@/ui';
import { first, timeAgo, type FeedItem, type FriendFeed } from './logic';
import { NudgeButton } from './NudgeButton';
import { TaskReactions } from './Reactions';

const SHOWN = 4;

export interface ActivityCardProps {
  feed: FriendFeed;
  presence: FocusPresenceData | null | undefined;
  nudgeSent: boolean;
  nudgeBusy: boolean;
  onNudge: () => void;
}

function ItemRow({ item }: { item: FeedItem }) {
  const { colors } = useTheme();
  const isWorkout = item.kind === 'workout';
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View
          style={{
            width: 24, height: 24, borderRadius: 12, marginTop: 1, alignItems: 'center', justifyContent: 'center',
            backgroundColor: isWorkout ? colors.accentSoft : colors.successSoft,
          }}
        >
          {isWorkout ? <Text style={{ fontSize: 13 }}>💪</Text> : <Icon name="check" size={14} color={colors.success} strokeWidth={3.4} />}
        </View>
        <Text variant="body" style={{ flex: 1 }}>{item.text}</Text>
        <Text variant="caption" tone="faint" style={{ marginTop: 2 }}>{timeAgo(item.at)}</Text>
      </View>
      {item.task ? (
        <View style={{ paddingLeft: 34 }}>
          <TaskReactions task={item.task} />
        </View>
      ) : null}
    </View>
  );
}

/** One friend's recent wins: header with ring/streak and the Nudge button, then their completions and workouts, newest first. */
export function ActivityCard({ feed, presence, nudgeSent, nudgeBusy, onNudge }: ActivityCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const [all, setAll] = useState(false);
  const { friend, items } = feed;
  const shown = all ? items : items.slice(0, SHOWN);
  const parts = [
    feed.doneCount ? `${feed.doneCount} done` : '',
    feed.workoutCount ? `${feed.workoutCount} workout${feed.workoutCount > 1 ? 's' : ''}` : '',
  ].filter(Boolean);

  return (
    <Card padding={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${friend.displayName}`}
          onPress={() => {
            haptic.select();
            router.push(`/friend/${friend.id}`);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
        >
          <Avatar name={friend.displayName} photoURL={friend.photoURL} size={44} ring={presence ? 'focus' : 'none'} streak={friend.streakData?.currentStreak} />
          <View style={{ flex: 1 }}>
            <Text variant="subheading" numberOfLines={1}>{friend.displayName}</Text>
            <Text variant="caption" tone={presence ? 'accent' : 'muted'} numberOfLines={1}>
              {presence ? 'Focusing right now' : parts.join(' · ')}
            </Text>
          </View>
        </Pressable>
        <NudgeButton sent={nudgeSent} busy={nudgeBusy} onPress={onNudge} />
      </View>
      <View style={{ gap: 14 }}>
        {shown.map((it, i) => (
          <View key={it.key}>
            {i > 0 ? <View style={{ height: 2, backgroundColor: colors.surfaceAlt, marginBottom: 14, borderRadius: 1 }} /> : null}
            <ItemRow item={it} />
          </View>
        ))}
        {items.length > SHOWN && !all ? (
          <Button label={`Show ${items.length - SHOWN} more`} variant="ghost" size="sm" onPress={() => setAll(true)} />
        ) : null}
      </View>
    </Card>
  );
}

export interface QuietRowProps {
  feed: FriendFeed;
  presence: FocusPresenceData | null | undefined;
  nudgeSent: boolean;
  nudgeBusy: boolean;
  pending: number;
  onNudge: () => void;
}

/** A friend with nothing to show yet today: the slot where accountability happens. */
export function QuietRow({ feed, presence, nudgeSent, nudgeBusy, pending, onNudge }: QuietRowProps) {
  const router = useRouter();
  const { friend } = feed;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(`/friend/${friend.id}`)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
      >
        <Avatar name={friend.displayName} photoURL={friend.photoURL} size={40} ring={presence ? 'focus' : 'none'} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{first(friend.displayName)}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {presence ? 'Focusing. Quiet so far.' : pending > 0 ? `Nothing done yet. ${pending} on the list.` : 'Nothing yet today.'}
          </Text>
        </View>
      </Pressable>
      <NudgeButton sent={nudgeSent} busy={nudgeBusy} onPress={onNudge} />
    </View>
  );
}
