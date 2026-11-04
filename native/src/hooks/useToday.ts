/**
 * "Today" as a date string in the user's zone (profile.timezone, else the device zone), re-evaluated at midnight and when the
 * app returns to the foreground. Use this instead of calling getTodayString() in screens so the day rolls over live.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { localDate, userZone } from '@/lib/dates';
import { useAuth } from './useAuth';

export function useToday(): { today: string; zone: string } {
  const { profile } = useAuth();
  const zone = userZone(profile?.timezone);
  const [today, setToday] = useState(() => localDate(zone));

  useEffect(() => {
    const refresh = () => setToday(localDate(zone));
    refresh();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    const timer = setInterval(refresh, 60 * 1000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [zone]);

  return { today, zone };
}
