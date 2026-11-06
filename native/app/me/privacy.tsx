// Me > Privacy and security: Face ID lock (users.biometricEnabled, verified before enabling), default task visibility,
// who sees fitness, blocked people (report + block, App Store 1.2), what Nudge keeps, erase the WhatsApp chat memory, delete account.
import React, { useState } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '@/hooks/useAuth';
import { useBlocks } from '@/hooks/useBlocks';
import { useFitness } from '@/hooks/useFitness';
import { auth } from '@/lib/firebase';
import { SAFETY_LINE } from '@/lib/safetyApi';
import { Card, haptic, Text, useToast } from '@/ui';
import { Group, OptionRow, Row, SettingsPage, SwitchRow } from '@/features/settings/ui';

export default function Privacy() {
  const router = useRouter();
  const toast = useToast();
  const { profile, updateProfile, user } = useAuth();
  const { goals } = useFitness();
  const { blocked } = useBlocks();
  const [busy, setBusy] = useState(false);
  const lockOn = !!profile?.biometricEnabled;
  const vis = profile?.defaultVisibility ?? 'everyone';

  const toggleLock = async (next: boolean) => {
    if (busy) return;
    if (Platform.OS === 'web') {
      toast.show('The lock works in the phone app.', { kind: 'info' });
      return;
    }
    setBusy(true);
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = has && (await LocalAuthentication.isEnrolledAsync());
      if (!enrolled) {
        toast.show('Set up Face ID, fingerprint or a passcode on your phone first.', { kind: 'error' });
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: next ? 'Confirm to turn on the lock' : 'Confirm to turn off the lock', fallbackLabel: 'Use passcode' });
      if (!res.success) return;
      await updateProfile({ biometricEnabled: next });
      haptic.success();
      toast.show(next ? 'Lock is on.' : 'Lock is off.', { kind: 'success' });
    } catch {
      toast.show('Could not change the lock.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const setVis = (v: 'everyone' | 'private') =>
    void updateProfile({ defaultVisibility: v }).catch(() => toast.show('Could not save that.', { kind: 'error' }));

  const resetPassword = async () => {
    const email = user?.email;
    if (!email) {
      toast.show('This account signs in with WhatsApp. No password to reset.', { kind: 'info' });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast.show('Reset email sent. Check your inbox.', { kind: 'success' });
    } catch {
      toast.show('Could not send the email.', { kind: 'error' });
    }
  };

  return (
    <SettingsPage title="Privacy and security">
      <Group title="Lock" footer="Asks for Face ID or your passcode when you open Nudge. Nothing biometric is stored.">
        <SwitchRow icon="face" tone="success" title="Face ID lock" value={lockOn} disabled={busy} onValueChange={(v) => void toggleLock(v)} />
      </Group>
      <Group title="New tasks are visible to" footer={vis === 'only' || vis === 'except' ? 'You use a custom friend list. Pick an option here to replace it. You can still set visibility per task.' : 'You can change this on any task.'}>
        <OptionRow icon="users" tone="primary" title="Friends" subtitle="Every friend sees them" selected={vis === 'everyone'} onPress={() => setVis('everyone')} />
        <OptionRow icon="lock" tone="neutral" title="Only me" subtitle="Private unless you share a task" selected={vis === 'private'} onPress={() => setVis('private')} />
      </Group>
      <Group title="Fitness">
        <Row icon="eye" tone="accent" title="Who sees my fitness" value={goals?.visibility === 'private' ? 'Only me' : 'Friends'} onPress={() => router.push('/progress/goals')} />
      </Group>
      <Group title="Safety" footer={`${SAFETY_LINE} Report or block from a person's profile, or hold one of their comments.`}>
        <Row icon="shield" tone="danger" title="Blocked people" value={blocked.length ? String(blocked.length) : 'None'} onPress={() => router.push('/me/blocked')} />
      </Group>
      <Card padding={16}>
        <Text variant="subheading">What Nudge keeps</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 6 }}>
          Your tasks, streaks, workouts and profile live in your Nudge account. Friends only see what a task's visibility allows. Private tasks are never shown.
          The coach reads the messages you send it on WhatsApp so it can add tasks and log workouts.
        </Text>
      </Card>
      <Group title="Account">
        <Row icon="mail" tone="primary" title="Reset password" subtitle="We email you a link" onPress={() => void resetPassword()} />
        <Row icon="trash" destructive title="Erase WhatsApp chat" subtitle="The coach forgets your chats. Tasks stay." onPress={() => router.push('/me/delete-data')} />
        <Row icon="trash" destructive title="Delete account" subtitle="Your account and all its data" onPress={() => router.push('/me/delete-account')} />
      </Group>
    </SettingsPage>
  );
}
