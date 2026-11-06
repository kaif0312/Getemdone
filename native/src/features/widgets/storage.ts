/**
 * Where the widget snapshot lives (AsyncStorage, readable from the Android widget task, which runs headless without any
 * screen), plus the queue of ticks made on a widget that have not reached Firestore yet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SNAPSHOT_VERSION, type WidgetSnapshot } from './snapshot';

const SNAPSHOT_KEY = 'nudge.widget.snapshot';
const PENDING_KEY = 'nudge.widget.pending';

export interface PendingTick {
  id: string;
  /** The day the tick was made for ('YYYY-MM-DD'), so a recurring task completes the right day. */
  date: string;
  at: number;
}

export async function loadSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as WidgetSnapshot;
    return s && s.v === SNAPSHOT_VERSION ? s : null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(s: WidgetSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
  } catch {
    /* a widget that cannot be refreshed is not worth crashing the app for */
  }
}

export async function loadPending(): Promise<PendingTick[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingTick[]) : [];
  } catch {
    return [];
  }
}

async function savePending(list: PendingTick[]): Promise<void> {
  try {
    if (list.length === 0) await AsyncStorage.removeItem(PENDING_KEY);
    else await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export async function addPending(tick: PendingTick): Promise<void> {
  const list = await loadPending();
  if (list.some((p) => p.id === tick.id && p.date === tick.date)) return;
  await savePending([...list, tick]);
}

export async function removePending(tick: PendingTick): Promise<void> {
  const list = await loadPending();
  await savePending(list.filter((p) => !(p.id === tick.id && p.date === tick.date)));
}
