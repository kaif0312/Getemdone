// Me > Calendar: put tasks with a time into the calendar you already use. Same as `/sync` on WhatsApp.
//   Google Calendar: Nudge makes its own calendar called "Nudge" (the server keeps it in step, ~15 min).
//   Calendar link:   a private ICS URL for Apple, Outlook or any app (read-only, refreshed by the calendar app).
// Server contract + design: web repo docs/CALENDAR.md. The layout is CalendarView (src/features/settings/CalendarView.tsx).
import React, { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ErrorState, SkeletonList, useToast } from '@/ui';
import { SettingsPage } from '@/features/settings/ui';
import { openCoachChat } from '@/features/settings/links';
import { CalendarView } from '@/features/settings/CalendarView';
import { useCalendar } from '@/features/settings/useCalendar';

export default function CalendarSettings() {
  const toast = useToast();
  const router = useRouter();
  const params = useLocalSearchParams<{ connected?: string; error?: string }>();
  const { status, loading, busy, error, refresh, act, connectGoogle, copyLink, openApple, openGoogleSubscribe } = useCalendar();

  // Back from the Google consent screen (nudge://me/calendar?connected=1 or ?error=...).
  useEffect(() => {
    if (params.connected) {
      toast.show('Google Calendar connected.', { kind: 'success' });
      void refresh();
      router.setParams({ connected: undefined });
    } else if (params.error) {
      toast.show(params.error === 'access_denied' ? 'Nothing was connected.' : 'Could not connect Google. Try again.', { kind: 'error' });
      router.setParams({ error: undefined });
    }
  }, [params.connected, params.error, refresh, router, toast]);

  if (loading) {
    return (
      <SettingsPage title="Calendar" subtitle="Tasks with a time, in your calendar">
        <SkeletonList count={4} />
      </SettingsPage>
    );
  }
  if (!status) {
    return (
      <SettingsPage title="Calendar" subtitle="Tasks with a time, in your calendar">
        <ErrorState body={error || undefined} onRetry={() => void refresh()} />
      </SettingsPage>
    );
  }

  return (
    <CalendarView
      status={status}
      busy={busy}
      error={error}
      onConnectGoogle={() => void connectGoogle()}
      onSync={() => void act('google.sync').then((ok) => ok && toast.show('Calendar updated.', { kind: 'success' }))}
      onDisconnect={() => void act('google.disconnect')}
      onCreateFeed={() => void act('feed.create')}
      onRotateFeed={() => void act('feed.rotate').then((ok) => ok && toast.show('New link made.', { kind: 'success' }))}
      onRemoveFeed={() => void act('feed.remove')}
      onCopy={() => void copyLink().then((ok) => ok && toast.show('Link copied.', { kind: 'success' }))}
      onApple={() => void openApple()}
      onGoogleSubscribe={() => void openGoogleSubscribe()}
      onWhatsApp={() => void openCoachChat('/sync')}
    />
  );
}
