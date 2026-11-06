/**
 * Keeps the home-screen widgets in step with the app: whenever the task list, the streak, the day or the signed-in user
 * changes, rebuild the snapshot (debounced) and hand it to the platform widgets. Mounted once in app/_layout.tsx, inside the
 * providers. On Android it also retries ticks made on a widget that could not be written yet. Never throws into the UI.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useStreak } from '@/hooks/useStreak';
import { useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import { flushPendingTicks } from './completeFromWidget';
import { iosStreakProps, iosTodayProps } from './iosProps';
import { buildSnapshot, type WidgetSnapshot } from './snapshot';

async function push(snap: WidgetSnapshot, today: string) {
  try {
    if (Platform.OS === 'android') {
      const { pushAndroidSnapshot } = await import('@/widgets/android/handler');
      await pushAndroidSnapshot(snap);
    } else if (Platform.OS === 'ios') {
      const { iosWidgets } = await import('@/widgets/ios');
      iosWidgets.Today.updateSnapshot(iosTodayProps(snap, today));
      iosWidgets.Streak.updateSnapshot(iosStreakProps(snap));
    }
  } catch {
    /* widgets are a nicety: a failed redraw must never break the app */
  }
}

export function useWidgetSync() {
  const { uid } = useAuth();
  const { tasks, loading } = useTasks();
  const { current, atRisk } = useStreak();
  const { today, zone } = useToday();
  const last = useRef('');

  useEffect(() => {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
    // Signed in but the list has not loaded yet: keep what the widget already shows.
    if (uid && loading) return;
    const timer = setTimeout(() => {
      const snap = buildSnapshot({ uid: uid ?? null, tasks, today, zone, streak: current, atRisk });
      const key = JSON.stringify({ ...snap, generatedAt: 0 });
      if (key === last.current) return;
      last.current = key;
      void push(snap, today);
    }, 1000);
    return () => clearTimeout(timer);
  }, [uid, loading, tasks, today, zone, current, atRisk]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !uid) return;
    void flushPendingTicks();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void flushPendingTicks());
    return () => sub.remove();
  }, [uid]);
}
