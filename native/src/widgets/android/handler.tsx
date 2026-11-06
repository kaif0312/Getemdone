/**
 * Android widget plumbing: draws each widget from the stored snapshot, handles the tick tap, and lets the app push a fresh
 * snapshot. Imported only on Android (index.js and useWidgetSync load it behind a Platform check).
 */
import React from 'react';
import { registerWidgetTaskHandler, requestWidgetUpdate, type WidgetInfo, type WidgetTaskHandlerProps } from 'react-native-android-widget';
import { tickFromWidget } from '@/features/widgets/completeFromWidget';
import { emptySnapshot, isStale, markDone, type WidgetSnapshot } from '@/features/widgets/snapshot';
import { loadSnapshot, saveSnapshot } from '@/features/widgets/storage';
import { localDate } from '@/lib/dates';
import { DARK, LIGHT, QuickAddWidget, StreakWidget, TodayWidget } from './widgets';

export const WIDGET_NAMES = ['NudgeToday', 'NudgeStreak', 'NudgeQuickAdd'] as const;

function today(s: WidgetSnapshot): string {
  try {
    return localDate(s.zone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return s.date;
  }
}

/** Both palettes, so the system dark mode switches the widget without waking the app. */
function draw(name: string, info: Pick<WidgetInfo, 'height'>, snap: WidgetSnapshot) {
  const stale = isStale(snap, today(snap));
  const make = (p: typeof LIGHT) => {
    if (name === 'NudgeToday') return <TodayWidget snap={snap} p={p} height={info.height} stale={stale} />;
    if (name === 'NudgeStreak') return <StreakWidget snap={stale ? { ...snap, atRisk: snap.streak > 0 } : snap} p={p} />;
    return <QuickAddWidget p={p} />;
  };
  return { light: make(LIGHT), dark: make(DARK) };
}

async function currentSnapshot(): Promise<WidgetSnapshot> {
  return (await loadSnapshot()) ?? emptySnapshot(null);
}

async function redrawAll(snap: WidgetSnapshot) {
  await Promise.all(WIDGET_NAMES.map((widgetName) => requestWidgetUpdate({ widgetName, renderWidget: (info) => draw(widgetName, info, snap) })));
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const name = props.widgetInfo.widgetName;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(draw(name, props.widgetInfo, await currentSnapshot()));
      break;
    case 'WIDGET_CLICK': {
      if (props.clickAction !== 'COMPLETE') break;
      const id = String(props.clickActionData?.id ?? '');
      const date = String(props.clickActionData?.date ?? '');
      if (!id || !date) break;
      // Redraw first so the row disappears at once, then write; the write is retried from the app if it fails.
      const next = markDone(await currentSnapshot(), id);
      await saveSnapshot(next);
      await redrawAll(next);
      await tickFromWidget({ id, date, at: Date.now() });
      break;
    }
    default:
      break;
  }
}

export function registerAndroidWidgets() {
  registerWidgetTaskHandler(widgetTaskHandler);
}

/** Called by the app when its task list changed: redraw every placed widget from the new snapshot. */
export async function pushAndroidSnapshot(snap: WidgetSnapshot) {
  await saveSnapshot(snap);
  await redrawAll(snap);
}
