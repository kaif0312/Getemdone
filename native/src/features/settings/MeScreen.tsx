import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationsInbox } from '@/hooks/useNotificationsInbox';
import { usePush } from '@/hooks/usePush';
import { useStreak } from '@/hooks/useStreak';
import { Avatar, Button, Card, haptic, Header, Icon, Screen, Skeleton, Text, useTheme, useToast } from '@/ui';
import { BIN_ROUTE, COACH_NUMBER_DISPLAY, openCoachChat } from './links';
import { Group, Row } from './ui';
import { useWhatsAppLink } from './useWhatsAppLink';

const REMINDER_LABEL = { auto: 'Auto', app: 'App only', whatsapp: 'WhatsApp', both: 'Both' } as const;

function ProfileCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { profile, user } = useAuth();
  const { current } = useStreak();
  if (!profile) return <Skeleton height={190} radius={22} />;
  const copyCode = async () => {
    await Clipboard.setStringAsync(profile.friendCode);
    haptic.success();
    toast.show('Friend code copied.', { kind: 'success' });
  };
  const sub = user?.email || (profile.email ?? '');
  return (
    <Card padding={18}>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Pressable onPress={() => router.push('/me/photo')} accessibilityRole="button" accessibilityLabel="Change photo" style={{ marginBottom: 6 }}>
          <Avatar name={profile.displayName || 'You'} photoURL={profile.photoURL} size={92} streak={current} />
          <View
            style={{
              position: 'absolute', left: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
              borderWidth: 3, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="camera" size={15} color={colors.onFill} />
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.push('/me/name')}
          accessibilityRole="button"
          accessibilityLabel={`Name: ${profile.displayName}. Tap to edit`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8 }}
        >
          <Text variant="title" numberOfLines={1} style={{ maxWidth: 250 }}>{profile.displayName}</Text>
          <Icon name="edit" size={16} color={colors.textFaint} />
        </Pressable>
        {sub ? <Text variant="caption" tone="muted" numberOfLines={1}>{sub}</Text> : null}
        <Pressable
          onPress={() => void copyCode()}
          accessibilityRole="button"
          accessibilityLabel={`Friend code ${profile.friendCode}. Tap to copy`}
          style={{
            marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 44, borderRadius: 22,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text variant="label" tone="muted">Friend code</Text>
          <Text variant="subheading" tone="primary" style={{ letterSpacing: 2 }}>{profile.friendCode}</Text>
          <Icon name="copy" size={15} color={colors.primary} />
        </Pressable>
      </View>
    </Card>
  );
}

function WhatsAppCard() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const wa = useWhatsAppLink();
  const prev = React.useRef(wa.linked);
  React.useEffect(() => {
    if (!prev.current && wa.linked) {
      haptic.success();
      toast.show('WhatsApp linked.', { kind: 'success' });
    }
    prev.current = wa.linked;
  }, [wa.linked, toast]);

  if (wa.linked) {
    return (
      <Card tone="success" padding={16}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="whatsapp" size={26} color={colors.onFill} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="subheading">WhatsApp is linked</Text>
            <Text variant="caption" tone="muted">{wa.masked}. Add tasks, log workouts, get nudged.</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
          <Button label="Open chat" icon="message" variant="success" size="sm" onPress={() => void openCoachChat()} />
          <Button label="Manage" variant="ghost" size="sm" onPress={() => router.push('/me/whatsapp')} />
        </View>
      </Card>
    );
  }
  return (
    <Card tone="accent" padding={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="whatsapp" size={26} color={colors.onFill} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="subheading">Link WhatsApp</Text>
          <Text variant="caption" tone="muted">The coach lives there. Link it to add tasks and log workouts by message.</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, alignItems: 'center' }}>
        <Button label="Link now" icon="link" variant="accent" size="sm" loading={wa.busy} onPress={() => void wa.startLink()} />
        <Button label="How it works" variant="ghost" size="sm" onPress={() => router.push('/me/whatsapp')} />
      </View>
      {wa.error ? <Text variant="caption" tone="danger" style={{ marginTop: 8 }}>{wa.error}</Text> : null}
      {wa.code ? (
        <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>
          Or send LINK {wa.code.code} to {COACH_NUMBER_DISPLAY}. Valid 10 minutes.
        </Text>
      ) : null}
    </Card>
  );
}

export function MeScreen() {
  const router = useRouter();
  const { unread } = useNotificationsInbox();
  const { profile } = useAuth();
  const { status } = usePush();
  const reminder = REMINDER_LABEL[profile?.reminderChannel ?? 'auto'];
  const pushValue = status === 'granted' ? 'On' : status === 'denied' ? 'Blocked' : status === 'unavailable' ? '' : 'Off';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen header={<Header title="Me" subtitle="Account and settings" unread={unread} onBellPress={() => router.push('/inbox')} />} gap={20}>
      <ProfileCard />
      <WhatsAppCard />
      <Group title="Settings">
        <Row icon="clock" tone="accent" title="Reminders" subtitle="Where reminders go, and how early" value={reminder} onPress={() => router.push('/me/reminders')} />
        <Row icon="calendar" tone="success" title="Calendar" subtitle="Tasks in Google, Apple or Outlook calendar" onPress={() => router.push('/me/calendar')} />
        <Row icon="bell" tone="primary" title="Notifications" value={pushValue} onPress={() => router.push('/me/notifications')} />
        <Row icon="face" tone="success" title="Privacy and security" subtitle="Face ID lock, visibility, your data" value={profile?.biometricEnabled ? 'Lock on' : ''} onPress={() => router.push('/me/privacy')} />
      </Group>
      <Group title="More">
        <Row icon="trash" tone="neutral" title="Recycle bin" subtitle="Deleted tasks wait here" onPress={() => router.push(BIN_ROUTE as never)} />
        <Row icon="help" tone="sun" title="Help" subtitle="WhatsApp commands and tips" onPress={() => router.push('/me/help')} />
        <Row icon="bug" tone="danger" title="Report a bug" subtitle="Or suggest something" onPress={() => router.push('/me/bug')} />
        <Row icon="info" tone="neutral" title="Version" value={version} noChevron />
      </Group>
      <Group>
        <Row icon="logout" destructive title="Sign out" onPress={() => router.push('/me/sign-out')} />
      </Group>
    </Screen>
  );
}
