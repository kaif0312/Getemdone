// Delete account (Google Play: apps with account creation must offer deletion inside the app).
// Two confirms, then POST /api/app/account/delete (src/lib/accountApi.ts) deletes the account and its data at once and the app
// signs out. The server wants a sign-in from the last 5 minutes: if it answers `reauth_required`, the person re-authenticates
// (password for e-mail accounts, a fresh WhatsApp LOGIN code otherwise) and the delete runs again. Only when the call fails
// does the screen offer the old fallback: a deletion REQUEST e-mail (uid, e-mail, WhatsApp number), done within 30 days.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { markAccountDeleting, useAuth } from '@/hooks/useAuth';
import { customTokenUid, deleteMyAccount, reauthMethod, reauthWithPassword } from '@/lib/accountApi';
import { pollWhatsAppLogin, startWhatsAppLogin, type LoginStart } from '@/lib/loginApi';
import { Button, Card, CoachSticker, haptic, SheetScaffold, Text, TextField, useToast } from '@/ui';
import { ACCOUNT_DELETION_EMAIL, DELETE_ACCOUNT_PAGE, deletionRequestMailto } from '@/features/settings/links';

type Step = 'explain' | 'confirm' | 'reauth' | 'failed' | 'sent' | 'nomail';

const POLL_MS = 2000;

export default function DeleteAccount() {
  const router = useRouter();
  const toast = useToast();
  const { uid, user, profile, signOut, signInWithToken } = useAuth();
  const [step, setStep] = useState<Step>('explain');
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [wa, setWa] = useState<LoginStart | null>(null);
  const waId = (profile as { whatsapp?: { waId?: string } } | null)?.whatsapp?.waId ?? null;
  const method = reauthMethod(user);
  // uid at the moment the person confirmed: a re-auth must come back as this same account.
  const confirmedUid = useRef<string | null>(null);

  const runDelete = useCallback(async () => {
    setBusy(true);
    markAccountDeleting(true);
    const r = await deleteMyAccount();
    if (r.ok) {
      haptic.success();
      toast.show('Your account is deleted.', { kind: 'success' });
      try {
        await signOut();
      } finally {
        markAccountDeleting(false);
        router.replace('/welcome');
      }
      return;
    }
    markAccountDeleting(false);
    setBusy(false);
    if (r.error === 'reauth_required') {
      setReauthError(null);
      setStep('reauth');
    } else {
      setStep('failed');
    }
  }, [router, signOut, toast]);

  const confirmDelete = () => {
    if (!uid || busy) return;
    confirmedUid.current = uid;
    void runDelete();
  };

  // ---- re-auth: password ----
  const submitPassword = async () => {
    if (!password || busy) return;
    setBusy(true);
    setReauthError(null);
    try {
      await reauthWithPassword(password);
      setPassword('');
      await runDelete();
    } catch (e) {
      const code = (e as { code?: string })?.code ?? '';
      setReauthError(code === 'auth/invalid-credential' || code === 'auth/wrong-password' ? 'Wrong password.' : 'Could not check your password. Try again.');
      setBusy(false);
    }
  };

  // ---- re-auth: WhatsApp LOGIN code (same flow as the sign-in screen) ----
  const startWa = useCallback(async () => {
    setReauthError(null);
    setWa(null);
    try {
      setWa(await startWhatsAppLogin());
    } catch {
      setReauthError('Could not reach Nudge. Check your connection.');
    }
  }, []);

  useEffect(() => {
    if (step === 'reauth' && method === 'whatsapp' && !wa) void startWa();
  }, [step, method, wa, startWa]);

  useEffect(() => {
    if (step !== 'reauth' || method !== 'whatsapp' || !wa) return;
    let stopped = false;
    let inFlight = false;
    const tick = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      try {
        if (Date.now() > wa.expiresAt) {
          stopped = true;
          setReauthError('The code expired. Get a new one.');
          return;
        }
        const res = await pollWhatsAppLogin(wa.pollToken);
        if (stopped) return;
        if (res.status === 'expired') {
          stopped = true;
          setReauthError('The code expired. Get a new one.');
        } else if (res.status === 'done') {
          stopped = true;
          // Never switch the session to another account: the number must belong to the account being deleted.
          if (!confirmedUid.current || customTokenUid(res.customToken) !== confirmedUid.current) {
            setReauthError('That WhatsApp number belongs to a different Nudge account, so nothing was deleted. Send the code from the number linked to this account.');
            return;
          }
          setBusy(true);
          try {
            await signInWithToken(res.customToken);
          } catch {
            setBusy(false);
            setReauthError('Could not confirm it was you. Try again.');
            return;
          }
          await runDelete();
        }
      } catch {
        // transient network error: keep polling
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [step, method, wa, runDelete, signInWithToken]);

  // ---- fallback: deletion request by e-mail ----
  const sendRequest = async () => {
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

  if (step === 'reauth') {
    return (
      <SheetScaffold title="Delete account" hideClose>
        <View style={{ alignItems: 'center', gap: 8, paddingBottom: 12 }}>
          <CoachSticker pose="clipboard" size={110} />
          <Text variant="heading" align="center">First, confirm it is you.</Text>
          {method === 'password' ? (
            <>
              <Text tone="muted" align="center">Enter the password for {user?.email}. Then your account is deleted.</Text>
              <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 8 }}>
                <TextField
                  label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"
                  autoComplete="current-password" onSubmitEditing={() => void submitPassword()} returnKeyType="go" error={reauthError}
                />
                <Button label="Confirm and delete" variant="danger" fullWidth loading={busy} disabled={!password} onPress={() => void submitPassword()} />
              </View>
            </>
          ) : (
            <>
              <Text tone="muted" align="center">
                Send this code to Nudge on WhatsApp from the number linked to this account. Then your account is deleted.
              </Text>
              {wa ? (
                <Card padding={12} style={{ alignSelf: 'stretch', alignItems: 'center', gap: 4 }}>
                  <Text variant="caption" tone="muted">Your code</Text>
                  <Text variant="title" selectable>{`LOGIN ${wa.code}`}</Text>
                </Card>
              ) : null}
              {reauthError ? <Text variant="bodyStrong" tone="danger" align="center">{reauthError}</Text> : null}
              <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 8 }}>
                {wa && !reauthError ? (
                  <Button label="Open WhatsApp" variant="danger" fullWidth loading={busy} onPress={() => void Linking.openURL(wa.waLink).catch(() => toast.show('Could not open WhatsApp. Send the code to the Nudge number.', { kind: 'error' }))} />
                ) : (
                  <Button label="Get a new code" variant="secondary" fullWidth disabled={busy} onPress={() => void startWa()} />
                )}
              </View>
            </>
          )}
          <View style={{ alignSelf: 'stretch', gap: 8 }}>
            <Button label="Keep my account" variant="ghost" fullWidth disabled={busy} onPress={() => router.back()} />
          </View>
        </View>
      </SheetScaffold>
    );
  }

  if (step === 'failed') {
    return (
      <SheetScaffold title="Delete account" hideClose>
        <View style={{ alignItems: 'center', gap: 8, paddingBottom: 12 }}>
          <CoachSticker pose="disappointed" size={110} />
          <Text variant="heading" align="center">Could not delete it right now.</Text>
          <Text tone="muted" align="center">
            Nothing is lost by trying again: it picks up where it stopped. Or send us a deletion request by e-mail and we
            delete the account within 30 days.
          </Text>
          <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}>
            <Button label="Try again" variant="danger" fullWidth loading={busy} onPress={() => void runDelete()} />
            <Button label="Request deletion by e-mail" variant="secondary" fullWidth disabled={busy} onPress={() => void sendRequest()} />
            <Button label="Keep my account" variant="ghost" fullWidth disabled={busy} onPress={() => router.back()} />
          </View>
        </View>
      </SheetScaffold>
    );
  }

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
            It is deleted at once and you are signed out. Files you sent to the vault on WhatsApp stay in the owner&apos;s Drive
            until you ask us to remove them.
          </Text>
        ) : null}
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: 12 }}>
          {confirming ? (
            <Button label="Yes, delete my account" variant="danger" fullWidth loading={busy} disabled={!uid} onPress={confirmDelete} />
          ) : (
            <Button label="Continue" variant="danger" fullWidth onPress={() => { haptic.warning(); setStep('confirm'); }} />
          )}
          <Button label="Keep my account" variant="ghost" fullWidth disabled={busy} onPress={() => router.back()} />
        </View>
      </View>
    </SheetScaffold>
  );
}
