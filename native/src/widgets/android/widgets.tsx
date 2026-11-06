'use no memo';
/**
 * The three Android home-screen widgets, as react-native-android-widget primitives (no hooks, no RN views: the library draws
 * them natively). Pure functions of a WidgetSnapshot + a palette, so a click only has to re-render with a new snapshot.
 * Taps: the tick circle completes the task (handler `COMPLETE`), a row opens it, the header opens Today, + opens Add.
 * Deep links are the app's own routes (scheme `nudge`): task/<id>, add, today, progress.
 */
import React from 'react';
import { FlexWidget, ImageWidget, TextWidget, type HexColor } from 'react-native-android-widget';
import { progressLine, rowLabel, type WidgetPose, type WidgetSnapshot } from '@/features/widgets/snapshot';
import { darkColors, lightColors, type Colors } from '@/ui/theme';

export interface Palette {
  bg: HexColor;
  surface: HexColor;
  text: HexColor;
  muted: HexColor;
  primary: HexColor;
  accent: HexColor;
  success: HexColor;
  border: HexColor;
  onFill: HexColor;
}

function palette(c: Colors): Palette {
  return {
    bg: c.bg as HexColor, surface: c.surface as HexColor, text: c.text as HexColor, muted: c.textMuted as HexColor,
    primary: c.primary as HexColor, accent: c.accent as HexColor, success: c.success as HexColor,
    border: c.border as HexColor, onFill: c.onFill as HexColor,
  };
}
export const LIGHT = palette(lightColors);
export const DARK = palette(darkColors);

/** Static requires: the bundler needs literal paths. */
const COACH: Record<WidgetPose, number> = {
  cheer: require('../../../assets/stickers/cheer.webp'),
  flex: require('../../../assets/stickers/flex.webp'),
  proud: require('../../../assets/stickers/proud.webp'),
  sleepy: require('../../../assets/stickers/sleepy.webp'),
  waiting: require('../../../assets/stickers/waiting.webp'),
  disappointed: require('../../../assets/stickers/disappointed.webp'),
};

function Coach({ pose, size }: { pose: WidgetPose; size: number }) {
  return <ImageWidget image={COACH[pose] as never} imageWidth={size} imageHeight={size} />;
}

const DP_HEADER = 52;
const DP_ROW = 40;

/** How many task rows fit: widget height minus the header and padding, one row each. */
export function rowsThatFit(height: number): number {
  return Math.max(1, Math.min(8, Math.floor((height - DP_HEADER - 12) / DP_ROW)));
}

function Row({ p, id, label, date }: { p: Palette; id: string; label: string; date: string }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', height: DP_ROW }}>
      <FlexWidget
        clickAction="COMPLETE"
        clickActionData={{ id, date }}
        accessibilityLabel={`Complete ${label}`}
        style={{ width: 40, height: DP_ROW, alignItems: 'center', justifyContent: 'center' }}
      >
        <FlexWidget style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: p.accent }} />
      </FlexWidget>
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: `nudge://task/${id}` }}
        style={{ flex: 1, height: DP_ROW, justifyContent: 'center' }}
      >
        <TextWidget text={label} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: '600', color: p.text }} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** 4x2 and up: today's open tasks with a tick each. */
export function TodayWidget({ snap, p, height, stale }: { snap: WidgetSnapshot; p: Palette; height: number; stale: boolean }) {
  const signedOut = !snap.uid;
  const fit = rowsThatFit(height);
  const list = stale || signedOut ? [] : snap.open;
  const shown = list.slice(0, fit);
  const more = Math.max(0, snap.openCount - shown.length);
  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', height: 'match_parent', backgroundColor: p.bg, borderRadius: 24, padding: 12 }}>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', height: DP_HEADER - 12 }}>
        <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'nudge://today' }} style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text="Today" style={{ fontSize: 18, fontWeight: '900', color: p.primary }} />
          <TextWidget
            text={signedOut ? 'Sign in to Nudge' : stale ? 'Open Nudge to refresh' : progressLine(snap)}
            style={{ fontSize: 12, fontWeight: '600', color: p.muted }}
          />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'nudge://add' }}
          accessibilityLabel="Add a task"
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <TextWidget text="+" style={{ fontSize: 22, fontWeight: '900', color: p.onFill }} />
        </FlexWidget>
      </FlexWidget>
      {shown.length > 0 ? (
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', flex: 1 }}>
          {shown.map((t) => (
            <Row key={t.id} p={p} id={t.id} label={rowLabel(t)} date={snap.date} />
          ))}
          {more > 0 ? <TextWidget text={`+${more} more`} style={{ fontSize: 12, fontWeight: '700', color: p.muted, marginLeft: 40 }} /> : null}
        </FlexWidget>
      ) : (
        <FlexWidget
          clickAction="OPEN_APP"
          style={{ flex: 1, width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
        >
          <Coach pose={signedOut || stale ? 'waiting' : snap.pose} size={Math.max(48, Math.min(96, height - DP_HEADER - 16))} />
          <TextWidget
            text={signedOut ? 'Open Nudge' : stale ? 'New day. Open Nudge.' : snap.doneCount > 0 ? 'All clear.' : 'Nothing planned. Add one.'}
            style={{ fontSize: 15, fontWeight: '800', color: p.text, marginLeft: 8 }}
          />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}

/** 2x2: the streak number and the coach. */
export function StreakWidget({ snap, p }: { snap: WidgetSnapshot; p: Palette }) {
  const signedOut = !snap.uid;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'nudge://progress' }}
      style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 'match_parent', height: 'match_parent', backgroundColor: p.bg, borderRadius: 24, padding: 8 }}
    >
      <Coach pose={signedOut ? 'waiting' : snap.pose} size={64} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text={signedOut ? '-' : String(snap.streak)} style={{ fontSize: 30, fontWeight: '900', color: p.accent }} />
        <TextWidget text={snap.streak === 1 ? ' day' : ' days'} style={{ fontSize: 13, fontWeight: '800', color: p.muted }} />
      </FlexWidget>
      <TextWidget
        text={signedOut ? 'Sign in' : snap.atRisk ? 'Keep it alive. Do one.' : 'streak'}
        maxLines={1}
        style={{ fontSize: 11, fontWeight: '700', color: snap.atRisk ? p.accent : p.muted }}
      />
    </FlexWidget>
  );
}

/** 2x2: one tap into the Add sheet. */
export function QuickAddWidget({ p }: { p: Palette }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'nudge://add' }}
      accessibilityLabel="Add a task"
      style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 'match_parent', height: 'match_parent', backgroundColor: p.primary, borderRadius: 24 }}
    >
      <TextWidget text="+" style={{ fontSize: 44, fontWeight: '900', color: p.onFill }} />
      <TextWidget text="Add task" style={{ fontSize: 14, fontWeight: '800', color: p.onFill }} />
    </FlexWidget>
  );
}
