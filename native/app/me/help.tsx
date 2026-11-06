// Me > Help: how to use Nudge with WhatsApp. Slash commands from AGENTS.md "Slash commands" (lib/bot/fastpath.ts parseSlash).
import React from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button, Card, CoachSticker, haptic, Text, useTheme, useToast } from '@/ui';
import { openCoachChat } from '@/features/settings/links';
import { SettingsPage } from '@/features/settings/ui';

const SAY = [
  { say: 'call mum tomorrow 6pm', does: 'Adds a task with a date and time' },
  { say: 'ran 5k in 30 min', does: 'Logs a workout' },
  { say: 'weight 72', does: 'Logs a number: weight, steps, sleep, water' },
  { say: 'remind me 30 min before', does: 'Sets the reminder for the last task' },
];

const COMMANDS = [
  { cmd: '/today', does: 'Your list for today' },
  { cmd: '/task buy milk', does: 'Add a task. New lines or ; add several' },
  { cmd: '/done 2', does: 'Finish task number 2' },
  { cmd: '/undo', does: 'Undo the last thing' },
  { cmd: '/week', does: 'Your week so far' },
  { cmd: '/friends', does: 'What friends did today' },
  { cmd: '/files', does: 'The last 5 files you sent' },
  { cmd: '/stop  /start', does: 'Pause or resume messages' },
  { cmd: '/help', does: 'This list, in the chat' },
];

function Line({ code, does }: { code: string; does: string }) {
  const { colors } = useTheme();
  const toast = useToast();
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(code.split('  ')[0]);
        haptic.select();
        toast.show('Copied.', { kind: 'info', duration: 1200 });
      }}
      accessibilityRole="button"
      accessibilityLabel={`${code}. ${does}. Tap to copy`}
      style={{ paddingVertical: 10, gap: 4 }}
    >
      <View style={{ alignSelf: 'flex-start', backgroundColor: colors.primarySoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 }}>
        <Text variant="bodyStrong" tone="primary">{code}</Text>
      </View>
      <Text variant="caption" tone="muted">{does}</Text>
    </Pressable>
  );
}

export default function Help() {
  const { colors } = useTheme();
  return (
    <SettingsPage title="Help" subtitle="Talk to the coach">
      <Card tone="primary" padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <CoachSticker pose="clipboard" size={92} />
          <View style={{ flex: 1, gap: 6 }}>
            <Text variant="subheading">Capture in WhatsApp. Check in here.</Text>
            <Text variant="caption" tone="muted">No forms. Type it like you would tell a friend.</Text>
          </View>
        </View>
      </Card>
      <View style={{ gap: 4 }}>
        <Text variant="label" tone="muted" style={{ paddingHorizontal: 6 }}>Just say it</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 2, borderColor: colors.border, paddingHorizontal: 14 }}>
          {SAY.map((s, i) => (
            <View key={s.say} style={{ borderTopWidth: i ? 2 : 0, borderTopColor: colors.surfaceAlt }}>
              <Line code={s.say} does={s.does} />
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <Text variant="label" tone="muted" style={{ paddingHorizontal: 6 }}>Commands (instant, no AI)</Text>
        <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 2, borderColor: colors.border, paddingHorizontal: 14 }}>
          {COMMANDS.map((c, i) => (
            <View key={c.cmd} style={{ borderTopWidth: i ? 2 : 0, borderTopColor: colors.surfaceAlt }}>
              <Line code={c.cmd} does={c.does} />
            </View>
          ))}
        </View>
      </View>
      <Button label="Open WhatsApp" icon="message" variant="accent" fullWidth onPress={() => void openCoachChat('/help')} />
    </SettingsPage>
  );
}
