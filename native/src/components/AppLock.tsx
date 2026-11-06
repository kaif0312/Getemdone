/**
 * Face ID / fingerprint lock. The PWA stored a WebAuthn credential and a `biometricEnabled` flag on users/{uid}; native just
 * honours the flag (nothing biometric is ever stored). Wrap the signed-in app: <AppLock>{children}</AppLock>.
 * Locks on cold start and when the app was in the background for more than GRACE_MS.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useAuth } from '@/hooks/useAuth';
import { Button, CoachSticker, Text, useTheme } from '@/ui';

const GRACE_MS = 30 * 1000;

export function AppLock({ children }: { children: React.ReactNode }) {
  const { profile, signOut } = useAuth();
  const { colors } = useTheme();
  const enabled = !!profile?.biometricEnabled && Platform.OS !== 'web';
  // `unlocked` starts false, so the lock is up from the first frame the profile says Face ID is on (no flash of the list).
  const [unlocked, setUnlocked] = useState(false);
  const locked = enabled && !unlocked;
  const [failed, setFailed] = useState(false);
  const leftAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    setFailed(false);
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = has && (await LocalAuthentication.isEnrolledAsync());
      if (!enrolled) {
        setUnlocked(true); // no biometrics/passcode on this phone: do not trap the user
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Nudge', fallbackLabel: 'Use passcode' });
      if (res.success) setUnlocked(true);
      else setFailed(true);
    } finally {
      prompting.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setUnlocked(false); // next sign-in / re-enable starts locked
      return;
    }
    void unlock();
  }, [enabled, unlock]);

  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background' || s === 'inactive') {
        if (leftAt.current === null) leftAt.current = Date.now();
      } else if (s === 'active') {
        const away = leftAt.current ? Date.now() - leftAt.current : 0;
        leftAt.current = null;
        if (away > GRACE_MS) {
          setUnlocked(false);
          void unlock();
        }
      }
    });
    return () => sub.remove();
  }, [enabled, unlock]);

  if (!locked) return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <CoachSticker pose="waiting" size={180} animated />
      <Text variant="title" align="center">Locked.</Text>
      <Text tone="muted" align="center">{failed ? 'That did not work. Try again.' : 'Unlock to see your list.'}</Text>
      <View style={{ marginTop: 12, gap: 8, alignItems: 'center' }}>
        <Button label="Unlock" icon="lock" onPress={unlock} />
        <Button label="Sign out" variant="ghost" size="sm" onPress={() => void signOut()} />
      </View>
    </View>
  );
}
