/** Is Google Calendar connected? Drives the banner on the Meetings list. Never blocks the list: a failure means "no banner". */
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getCalendarStatus } from '@/lib/calendarApi';

export type BannerKind = 'none' | 'connect' | 'reconnect';

export function useMeetingsCalendar(): { banner: BannerKind; connected: boolean | null; refresh: () => Promise<void> } {
  const [banner, setBanner] = useState<BannerKind>('none');
  const [connected, setConnected] = useState<boolean | null>(null);
  const refresh = useCallback(async () => {
    try {
      const s = await getCalendarStatus();
      setConnected(s.google.connected && !s.google.needsReconnect);
      setBanner(s.google.needsReconnect ? 'reconnect' : s.googleAvailable && !s.google.connected ? 'connect' : 'none');
    } catch {
      setBanner('none');
    }
  }, []);
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
    return () => sub.remove();
  }, [refresh]);
  return { banner, connected, refresh };
}
