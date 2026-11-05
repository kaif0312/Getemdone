/**
 * State + actions for Me > Calendar (ICS link and Google Calendar). One screen-local hook: it reads the server status on
 * mount and whenever the app returns to the foreground (the Google consent runs in the browser and comes back through
 * the `nudge://me/calendar?connected=1` link, or by the person just switching back).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  CalendarApiError, calendarAction, getCalendarStatus, googleSubscribeUrl, startGoogleConnect,
  type CalendarAction, type CalendarStatus,
} from '@/lib/calendarApi';

const MESSAGES: Record<string, string> = {
  google_unavailable: 'Google Calendar is not switched on yet.',
  not_connected: 'Google Calendar is not connected.',
  unauthorized: 'Please sign in again.',
};

export function useCalendar() {
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const s = await getCalendarStatus();
      if (alive.current) { setStatus(s); setError(''); }
    } catch (e) {
      if (alive.current) setError(e instanceof CalendarApiError && MESSAGES[e.code] ? MESSAGES[e.code] : 'Could not load. Check your connection.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => { alive.current = false; sub.remove(); };
  }, [refresh]);

  /** Run a server action with a busy flag; returns the new status or null (error is set). */
  const run = useCallback(async <T,>(key: string, fn: () => Promise<T>): Promise<T | null> => {
    setBusy(key);
    setError('');
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof CalendarApiError && MESSAGES[e.code] ? MESSAGES[e.code] : 'That did not work. Try again.');
      return null;
    } finally {
      if (alive.current) setBusy(null);
    }
  }, []);

  const act = useCallback(async (key: CalendarAction): Promise<boolean> => {
    const s = await run(key, () => calendarAction(key));
    if (s && alive.current) setStatus(s);
    return !!s;
  }, [run]);

  const connectGoogle = useCallback(async (): Promise<boolean> => {
    const url = await run('google.start', startGoogleConnect);
    if (!url) return false;
    await Linking.openURL(url);
    return true;
  }, [run]);

  const copyLink = useCallback(async (): Promise<boolean> => {
    if (!status?.feed) return false;
    await Clipboard.setStringAsync(status.feed.url);
    return true;
  }, [status]);

  /** Apple Calendar (iOS only: webcal:// opens its subscribe sheet). */
  const openApple = useCallback(async () => {
    if (status?.feed && Platform.OS === 'ios') await Linking.openURL(status.feed.webcalUrl);
  }, [status]);

  const openGoogleSubscribe = useCallback(async () => {
    if (status?.feed) await Linking.openURL(googleSubscribeUrl(status.feed.webcalUrl));
  }, [status]);

  return { status, loading, busy, error, refresh, act, connectGoogle, copyLink, openApple, openGoogleSubscribe };
}
