/**
 * WhatsApp sign-in state machine for app/(auth)/whatsapp.tsx.
 *   start -> show code + open WhatsApp -> poll every 2 s while the screen is focused and the app is foregrounded
 *   -> done: signInWithCustomToken. expired: offer a new code. Polling stops in the background and resumes on foreground.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { pollWhatsAppLogin, startWhatsAppLogin, type LoginStart } from '@/lib/loginApi';
import { useAuth } from './useAuth';

export type WhatsAppLoginPhase = 'starting' | 'waiting' | 'signingIn' | 'expired' | 'error';

const POLL_MS = 2000;

export function useWhatsAppLogin() {
  const { signInWithToken } = useAuth();
  const [phase, setPhase] = useState<WhatsAppLoginPhase>('starting');
  const [session, setSession] = useState<LoginStart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(true);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const busy = useRef(false);

  const start = useCallback(async () => {
    setPhase('starting');
    setError(null);
    try {
      const s = await startWhatsAppLogin();
      setSession(s);
      setPhase('waiting');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach Nudge');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (phase !== 'waiting' || !session || !focused || !active) return;
    let stopped = false;
    const tick = async () => {
      if (busy.current || stopped) return;
      busy.current = true;
      try {
        if (Date.now() > session.expiresAt) {
          setPhase('expired');
          return;
        }
        const res = await pollWhatsAppLogin(session.pollToken);
        if (stopped) return;
        if (res.status === 'done') {
          setPhase('signingIn');
          try {
            await signInWithToken(res.customToken);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Sign-in failed');
            setPhase('error');
          }
        } else if (res.status === 'expired') {
          setPhase('expired');
        }
      } catch {
        // transient network error: keep polling
      } finally {
        busy.current = false;
      }
    };
    void tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [phase, session, focused, active, signInWithToken]);

  return { phase, session, error, restart: start };
}
