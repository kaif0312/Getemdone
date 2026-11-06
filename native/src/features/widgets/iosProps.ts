/** The ready-made strings the iOS widget layouts draw (their runtime cannot import app code). Pure. */
import { isStale, progressLine, rowLabel, type WidgetSnapshot } from './snapshot';

export interface IosTodayProps {
  subtitle: string;
  rows: { id: string; label: string }[];
  more: number;
  empty: string;
}
export interface IosStreakProps {
  streak: string;
  unit: string;
  note: string;
  atRisk: boolean;
}

export function iosTodayProps(s: WidgetSnapshot, today: string): IosTodayProps {
  if (!s.uid) return { subtitle: 'Sign in to Nudge', rows: [], more: 0, empty: 'Open Nudge' };
  if (isStale(s, today)) return { subtitle: 'Open Nudge to refresh', rows: [], more: 0, empty: 'New day. Open Nudge.' };
  const rows = s.open.map((t) => ({ id: t.id, label: rowLabel(t) }));
  return {
    subtitle: progressLine(s),
    rows,
    more: Math.max(0, s.openCount - rows.length),
    empty: s.doneCount > 0 ? 'All clear.' : 'Nothing planned. Add one.',
  };
}

export function iosStreakProps(s: WidgetSnapshot): IosStreakProps {
  if (!s.uid) return { streak: '-', unit: 'days', note: 'Sign in', atRisk: false };
  return { streak: String(s.streak), unit: s.streak === 1 ? 'day' : 'days', note: s.atRisk ? 'Keep it alive. Do one.' : 'streak', atRisk: s.atRisk };
}
