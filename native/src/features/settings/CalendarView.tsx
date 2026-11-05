// Presentational half of Me > Calendar (state in, callbacks out) so every state can be previewed. Container: app/me/calendar.tsx.
import React from 'react';
import { Platform, View } from 'react-native';
import { Text } from '@/ui';
import { Group, Row, SettingsPage } from './ui';
import type { CalendarStatus } from '@/lib/calendarApi';

function ago(ms?: number): string {
  if (!ms) return 'not yet';
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export interface CalendarViewProps {
  status: CalendarStatus;
  busy: string | null;
  error: string;
  onConnectGoogle(): void;
  onSync(): void;
  onDisconnect(): void;
  onCreateFeed(): void;
  onRotateFeed(): void;
  onRemoveFeed(): void;
  onCopy(): void;
  onApple(): void;
  onGoogleSubscribe(): void;
  onWhatsApp(): void;
}

export function CalendarView(p: CalendarViewProps) {
  const { status, busy, error } = p;
  const g = status.google;
  const feed = status.feed;
  return (
    <SettingsPage title="Calendar" subtitle="Tasks with a time, in your calendar">
      {error ? <Text variant="caption" tone="danger" style={{ paddingHorizontal: 6 }}>{error}</Text> : null}
      <Group
        title="Google Calendar"
        footer="Nudge makes its own calendar called “Nudge”. It can't see or change your other events. New tasks show up within about 15 minutes, or tap Sync now."
      >
        {!g.connected ? (
          <Row
            icon="calendar"
            tone="primary"
            title={g.needsReconnect ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
            subtitle={g.needsReconnect ? 'Google says access was removed.' : status.googleAvailable ? 'Opens Google to sign in' : 'Not switched on yet'}
            onPress={status.googleAvailable ? p.onConnectGoogle : undefined}
            disabled={!status.googleAvailable || busy === 'google.start'}
          />
        ) : (
          <>
            <Row icon="check" tone="success" title="Connected" subtitle={g.email ? `${g.email} · synced ${ago(g.lastSyncAt)}` : `Synced ${ago(g.lastSyncAt)}`} noChevron />
            {g.error ? <Row icon="info" tone="accent" title="Heads up" subtitle={g.error} noChevron /> : null}
            <Row icon="refresh" tone="primary" title="Sync now" onPress={p.onSync} disabled={busy === 'google.sync'} />
            <Row icon="trash" destructive title="Disconnect" subtitle="Removes the Nudge calendar from Google" onPress={p.onDisconnect} disabled={busy === 'google.disconnect'} />
          </>
        )}
      </Group>

      <Group
        title="Calendar link"
        footer={
          feed
            ? 'Anyone with this link can see your task titles, so keep it private. Calendar apps refresh it on their own: Apple within hours, Google can take most of a day.'
            : 'A private link for Apple Calendar, Outlook or any calendar app. Read-only.'
        }
      >
        {!feed ? (
          <Row icon="link" tone="accent" title="Create my calendar link" onPress={p.onCreateFeed} disabled={busy === 'feed.create'} />
        ) : (
          <>
            {Platform.OS === 'ios' ? <Row icon="calendar" tone="primary" title="Add to Apple Calendar" onPress={p.onApple} /> : null}
            <Row icon="calendar" tone="success" title="Add to Google Calendar" subtitle="Opens Google in your browser" onPress={p.onGoogleSubscribe} />
            <Row
              icon="copy"
              tone="neutral"
              title="Copy link"
              onPress={p.onCopy}
              noChevron
            />
            <Row icon="refresh" tone="neutral" title="Make a new link" subtitle="The old one stops working" onPress={p.onRotateFeed} disabled={busy === 'feed.rotate'} />
            <Row icon="trash" destructive title="Turn off the link" onPress={p.onRemoveFeed} disabled={busy === 'feed.remove'} />
          </>
        )}
      </Group>

      <View style={{ gap: 6, paddingHorizontal: 6 }}>
        <Text variant="label" tone="muted">What shows up</Text>
        <Text variant="caption" tone="muted">
          Tasks with a time (like “gym 6pm”) and deadlines. Done and deleted tasks disappear. Change a task in Nudge, not in the calendar.
        </Text>
      </View>

      <Group>
        <Row icon="whatsapp" tone="success" title="Set it up on WhatsApp" subtitle="Send /sync to the coach" onPress={p.onWhatsApp} />
      </Group>
    </SettingsPage>
  );
}
