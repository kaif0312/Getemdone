/** "Google Calendar is not connected" banner (spec 2.5). Connect opens the existing Me > Calendar screen (OAuth round trip). */
import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Text } from '@/ui';
import { IconTile } from '@/features/settings/ui';
import type { BannerKind } from './useMeetingsCalendar';

export function CalendarBanner({ kind }: { kind: BannerKind }) {
  const router = useRouter();
  if (kind === 'none') return null;
  return (
    <Card tone="sun" padding={12} raised={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconTile icon="calendar" tone="accent" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading">Google Calendar is not connected.</Text>
          <Text variant="caption" tone="muted">
            {kind === 'reconnect' ? 'Google Calendar needs you to sign in again.' : 'Meetings stay in Nudge: no Meet link, no invites.'}
          </Text>
        </View>
        <Button label="Connect" size="sm" variant="accent" onPress={() => router.push('/me/calendar')} />
      </View>
    </Card>
  );
}
