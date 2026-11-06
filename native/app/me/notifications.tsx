// Me > Notifications: push permission state + the notificationSettings toggles (same fields as the PWA).
import React from 'react';
import { Linking, View } from 'react-native';
import { usePush } from '@/hooks/usePush';
import { Button, Card, Text, useTheme, useToast } from '@/ui';
import { Group, SettingsPage, SwitchRow } from '@/features/settings/ui';
import { useNotificationSettings } from '@/features/settings/useNotificationSettings';

function PushCard() {
  const { colors } = useTheme();
  const toast = useToast();
  const push = usePush();
  const { status } = push;
  if (status === 'unavailable') {
    return (
      <Card padding={14}>
        <Text variant="subheading">Push is not available here</Text>
        <Text variant="caption" tone="muted">Install the app build on your phone to get push. WhatsApp reminders still work.</Text>
      </Card>
    );
  }
  const on = status === 'granted';
  return (
    <Card tone={on ? 'success' : status === 'denied' ? 'danger' : 'primary'} padding={14}>
      <View style={{ gap: 4 }}>
        <Text variant="subheading">{on ? 'Push is on' : status === 'denied' ? 'Push is blocked' : 'Push is off'}</Text>
        <Text variant="caption" tone="muted">
          {on ? 'Reminders and friend pings land on this phone.' : status === 'denied' ? 'Turn it on in your phone settings.' : 'Without it you will miss the nudge.'}
        </Text>
      </View>
      {!on ? (
        <View style={{ marginTop: 12 }}>
          {status === 'denied' ? (
            <Button label="Open settings" size="sm" variant="danger" onPress={() => void Linking.openSettings()} />
          ) : (
            <Button
              label="Turn on push"
              size="sm"
              variant="accent"
              onPress={() => void push.enable().then((s) => toast.show(s === 'granted' ? 'Push is on.' : 'Push stays off.', { kind: s === 'granted' ? 'success' : 'info' }))}
            />
          )}
        </View>
      ) : (
        <View style={{ marginTop: 8, height: 4, borderRadius: 2, backgroundColor: colors.success, opacity: 0.4 }} />
      )}
    </Card>
  );
}

export default function Notifications() {
  const { settings, set } = useNotificationSettings();
  const off = !settings.enabled;
  return (
    <SettingsPage title="Notifications" subtitle="What is allowed to ping you">
      <PushCard />
      <Group>
        <SwitchRow icon="bell" tone="primary" title="Notifications" subtitle="Master switch" value={settings.enabled} onValueChange={(v) => void set({ enabled: v })} />
      </Group>
      <View style={{ gap: 20, opacity: off ? 0.45 : 1 }} pointerEvents={off ? 'none' : 'auto'}>
        <Group title="For you">
          <SwitchRow icon="clock" tone="accent" title="Deadlines" subtitle="Before a task is due" value={settings.deadlineReminders} onValueChange={(v) => void set({ deadlineReminders: v })} />
          <SwitchRow icon="today" tone="success" title="Noon check-in" subtitle="If nothing is done by midday" value={settings.noonCheckIn} onValueChange={(v) => void set({ noonCheckIn: v })} />
          <SwitchRow icon="lock" tone="danger" title="Commitments" subtitle="Committed tasks still open" value={settings.commitmentReminders} onValueChange={(v) => void set({ commitmentReminders: v })} />
        </Group>
        <Group title="From friends">
          <SwitchRow icon="check" tone="success" title="Completions" subtitle="When a friend finishes something" value={settings.friendCompletions} onValueChange={(v) => void set({ friendCompletions: v })} />
          <SwitchRow icon="message" tone="primary" title="Comments" subtitle="On your tasks" value={settings.friendComments} onValueChange={(v) => void set({ friendComments: v })} />
          <SwitchRow icon="bolt" tone="accent" title="Nudges and cheers" value={settings.friendEncouragement} onValueChange={(v) => void set({ friendEncouragement: v })} />
        </Group>
        <Group title="Feel">
          <SwitchRow icon="bell" tone="neutral" title="Sound" value={settings.sound} onValueChange={(v) => void set({ sound: v })} />
          <SwitchRow icon="phone" tone="neutral" title="Vibrate" value={settings.vibrate} onValueChange={(v) => void set({ vibrate: v })} />
        </Group>
      </View>
    </SettingsPage>
  );
}
