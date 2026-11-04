// Me > WhatsApp: status, link (LINK <code> flow, code made by POST /api/wa/link-code like the PWA), open chat, disconnect.
import React from 'react';
import { View } from 'react-native';
import { useToast, Button, Card, CoachSticker, Text, useTheme } from '@/ui';
import { COACH_NUMBER_DISPLAY, openCoachChat } from '@/features/settings/links';
import { Group, Row, SettingsPage } from '@/features/settings/ui';
import { useWhatsAppLink } from '@/features/settings/useWhatsAppLink';

const STEPS = ['Tap Link now. WhatsApp opens with a message ready.', 'Send it as is. It says LINK and a six-letter code.', 'Come back. This page turns green.'];

export default function WhatsAppPage() {
  const { colors } = useTheme();
  const toast = useToast();
  const wa = useWhatsAppLink();

  if (wa.linked) {
    return (
      <SettingsPage title="WhatsApp" subtitle="Linked">
        <Card tone="success" padding={16}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <CoachSticker pose="proud" size={120} animated />
            <Text variant="heading">Connected</Text>
            <Text tone="muted">{wa.masked}</Text>
          </View>
          <View style={{ marginTop: 12, alignItems: 'center' }}>
            <Button label="Open chat" icon="message" variant="success" onPress={() => void openCoachChat()} />
          </View>
        </Card>
        <Group title="What you can send" footer="Send help in the chat for the full list. Commands are in Me, Help.">
          <Row icon="today" tone="success" title="Add tasks" subtitle="'call mum 6pm' or /task buy milk" noChevron />
          <Row icon="bolt" tone="accent" title="Log workouts" subtitle="'ran 5k' or 'weight 72'" noChevron />
          <Row icon="check" tone="primary" title="Finish things" subtitle="/done 2 or tap Done on a reminder" noChevron />
        </Group>
        <Group footer="Disconnecting stops WhatsApp reminders. Your tasks stay.">
          <Row
            icon="link"
            destructive
            title="Disconnect WhatsApp"
            onPress={() => void wa.disconnect().then((ok) => ok && toast.show('Disconnected.', { kind: 'info' }))}
          />
        </Group>
        {wa.error ? <Text variant="caption" tone="danger">{wa.error}</Text> : null}
      </SettingsPage>
    );
  }

  return (
    <SettingsPage title="WhatsApp" subtitle="Not linked yet">
      <Card padding={16}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <CoachSticker pose="blowing" size={130} animated />
          <Text variant="heading" align="center">Most of Nudge happens in WhatsApp.</Text>
          <Text tone="muted" align="center">Add tasks, log workouts and get nudged without opening the app. This app is for looking and connecting.</Text>
        </View>
      </Card>
      <View style={{ gap: 10 }}>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
              <Text variant="bodyStrong" tone="onFill">{i + 1}</Text>
            </View>
            <Text style={{ flex: 1 }}>{s}</Text>
          </View>
        ))}
      </View>
      <Button label="Link now" icon="link" variant="accent" size="lg" fullWidth loading={wa.busy} onPress={() => void wa.startLink()} />
      {wa.error ? (
        <Text variant="caption" tone="danger">
          {wa.error} You can also open the chat and send LINK with a code from the Nudge web app.
        </Text>
      ) : null}
      {wa.code ? (
        <Card tone="sun" padding={14}>
          <Text variant="label" tone="muted">Your code (10 minutes)</Text>
          <Text variant="title" style={{ letterSpacing: 4 }}>{wa.code.code}</Text>
          <Text variant="caption" tone="muted">If WhatsApp did not open, send LINK {wa.code.code} to {COACH_NUMBER_DISPLAY}.</Text>
          <View style={{ marginTop: 8 }}>
            <Button label="Open WhatsApp" size="sm" variant="secondary" onPress={() => void openCoachChat(`LINK ${wa.code?.code}`)} />
          </View>
        </Card>
      ) : null}
    </SettingsPage>
  );
}
