// Delete account (Google Play: apps with account creation must offer deletion inside the app).
// No self-service delete backend exists yet (see ACCOUNT_DELETION_EMAIL in features/settings/links.ts), so this sends a
// deletion REQUEST, the same process as the public page /delete-account: e-mail with the account id, done within 30 days.
// Two steps: what gets deleted, then an explicit confirm. If no mail app opens, the address is shown with Copy.
import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/hooks/useAuth';
import { Button, Card, CoachSticker, haptic, SheetScaffold, Text, useToast } from '@/ui';
import { ACCOUNT_DELETION_EMAIL, DELETE_ACCOUNT_PAGE, deletionRequestMailto } from '@/features/settings/links';

type Step = 'explain' | 'confirm' | 'sent' | 'nomail';

export default function DeleteAccount() {
  const router = useRouter();
  const toast = useToast();
  const { uid, user, profile } = useAuth();
  const [step, setStep] = useState<Step>('explain');
  const [busy, setBusy] = useState(false);
  const waId = (profile as { whatsapp?: { waId?: string } } | null)?.whatsapp?.waId ?? null;

  const send = async () => {
    if (!uid || busy) return;
    setBusy(true);
    const url = deletionRequestMailto({ uid, email: user?.email ?? profile?.email ?? null, waId, name: profile?.displayName ?? null });
    try {
      await Linking.openURL(url);
      haptic.success();
      setStep('sent');
    } catch {
      setStep('nomail');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await Clipboard.setStringAsync(text);
      toast.show(`${what} copied.`, { kind: 'success' });
    } catch {
      toast.show('Could not copy.', { kind: 'error' });
    }
  };

  if (step === 'sent' || step === 'nomail') {
    return (
      <SheetScaffold title="Delete account" hideClose>
        <View style={{ alignItems: 'center', gap: 8, paddingBottom: 12 }}>
          <CoachSticker pose={step === 'sent' ? 'waiting' : 'clipboard'} size={110} />
          <Text variant="heading" align="center">{step === 'sent' ? 'Send the e-mail to finish.' : 'No mail app found.'}</Text>
          <Text tone="muted" align="center">
            {step === 'sent'
              ? 'Your request is ready in your mail app. Once it reaches us we delete the account and confirm by e-mail or WhatsApp within 30 days.'
              : `E-mail ${ACCOUNT_DELETION_EMAIL} with the subject "Delete my Nudge account" and your account id below. We delete it and confirm within 30 days.`}
          </Text>
          {step === 'nomail' ? (
            <Card padding={12} style={{ alignSelf: 'stretch', gap: 8 }}>
              <Text variant="caption" tone="muted">Account id</Text>
              <Text variant="bodyStrong" selectable>{uid}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Copy address" size="sm" variant="secondary" onPress={() => void copy(ACCOUNT_DELETION_EMAIL, 'Address')} />
                <Button label="Copy id" size="sm" variant="secondary" onPress={() => void copy(uid ?? '', 'Account id')} />
              </View>
            </Card>
          ) : null}
          <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}>
            {step === 'nomail' ? (
              <Button label="Open the web page" variant="secondary" fullWidth onPress={() => void Linking.openURL(DELETE_ACCOUNT_PAGE).catch(() => undefined)} />
            ) : null}
            <Button label="Done" variant="ghost" fullWidth onPress={() => router.back()} />
          </View>
        </View>
      </SheetScaffold>
    );
  }

  const confirming = step === 'confirm';
  return (
    <SheetScaffold title="Delete account" hideClose>
      <View style={{ alignItems: 'center', gap: 8, paddingBottom: 12 }}>
        <CoachSticker pose="disappointed" size={110} />
        <Text variant="heading" align="center">{confirming ? 'Delete your account for good?' : 'This deletes everything.'}</Text>
        <Text tone="muted" align="center">
          {confirming
            ? 'This cannot be undone. Your streaks and history are gone for good, and your friends lose you from their lists.'
            : 'Your account, name, photo, tasks, notes, reminders, workouts, attachments, friend connections and your WhatsApp chat history with the coach.'}
        </Text>
        {!confirming ? (
          <Text variant="caption" tone="muted" align="center">
            We send a deletion request from your mail app. We delete the account and confirm within 30 days.
          </Text>
        ) : null}
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}>
          {confirming ? (
            <Button label="Yes, request deletion" variant="danger" fullWidth loading={busy} disabled={!uid} onPress={() => void send()} />
          ) : (
            <Button label="Continue" variant="danger" fullWidth onPress={() => { haptic.warning(); setStep('confirm'); }} />
          )}
          <Button label="Keep my account" variant="ghost" fullWidth onPress={() => router.back()} />
        </View>
      </View>
    </SheetScaffold>
  );
}
