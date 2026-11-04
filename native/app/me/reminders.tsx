// Me > Reminders: which channel reminders use (users.reminderChannel, read by lib/server/reminders.ts) and how early deadlines fire.
import React from 'react';
import { View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { Chip, Text, useToast } from '@/ui';
import { Group, OptionRow, SettingsPage, SwitchRow } from '@/features/settings/ui';
import { useNotificationSettings } from '@/features/settings/useNotificationSettings';
import type { UserDoc } from '@/lib/types-extra';

type Channel = NonNullable<UserDoc['reminderChannel']>;

const CHANNELS: { id: Channel; title: string; sub: string }[] = [
  { id: 'auto', title: 'Auto', sub: 'Push to the app if you have it, otherwise WhatsApp.' },
  { id: 'app', title: 'App only', sub: 'Push notifications. Nothing on WhatsApp.' },
  { id: 'whatsapp', title: 'WhatsApp only', sub: 'Tap Done or Tomorrow right in the chat.' },
  { id: 'both', title: 'Both', sub: 'Push and WhatsApp. Hard to ignore.' },
];

const BEFORE = [
  { m: 15, label: '15 min' },
  { m: 30, label: '30 min' },
  { m: 60, label: '1 hour' },
  { m: 120, label: '2 hours' },
  { m: 1440, label: '1 day' },
];

export default function Reminders() {
  const { profile, updateProfile } = useAuth();
  const toast = useToast();
  const { settings, set } = useNotificationSettings();
  const current: Channel = profile?.reminderChannel ?? 'auto';

  return (
    <SettingsPage title="Reminders" subtitle="Deadlines and tasks with a time">
      <Group title="Send reminders to" footer="Quiet hours and focus sessions still hold them back.">
        {CHANNELS.map((c) => (
          <OptionRow
            key={c.id}
            title={c.title}
            subtitle={c.sub}
            selected={current === c.id}
            onPress={() => void updateProfile({ reminderChannel: c.id }).catch(() => toast.show('Could not save that.', { kind: 'error' }))}
          />
        ))}
      </Group>
      <Group title="Deadlines" footer="Tasks with a date and time get a reminder this long before.">
        <SwitchRow icon="clock" tone="accent" title="Deadline reminders" value={settings.deadlineReminders} onValueChange={(v) => void set({ deadlineReminders: v })} />
      </Group>
      <View style={{ gap: 10, opacity: settings.deadlineReminders ? 1 : 0.45 }} pointerEvents={settings.deadlineReminders ? 'auto' : 'none'}>
        <Text variant="label" tone="muted" style={{ paddingHorizontal: 6 }}>How early</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BEFORE.map((b) => (
            <Chip key={b.m} label={b.label} selected={settings.deadlineMinutesBefore === b.m} onPress={() => void set({ deadlineMinutesBefore: b.m })} />
          ))}
        </View>
      </View>
    </SettingsPage>
  );
}
