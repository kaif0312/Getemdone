import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Epoch ms that re-renders every `everyMs` while the app is active (join windows, NOW/NEXT labels). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = setInterval(() => { if (AppState.currentState === 'active') tick(); }, everyMs);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tick(); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [everyMs]);
  return now;
}
