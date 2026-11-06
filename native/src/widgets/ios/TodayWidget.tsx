import { HStack, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export interface TodayWidgetProps {
  subtitle: string;
  rows: { id: string; label: string }[];
  more: number;
  /** Shown instead of the list when there is nothing to tick ("All clear.", "Open Nudge", ...). */
  empty: string;
}

/**
 * Today list (medium / large). The `'widget'` function runs in the widget's own runtime: no imports of app code, no module-scope
 * values, so the palette is inline and the app sends ready-made strings (features/widgets/iosProps.ts). A row opens the task;
 * ticking a task from an iOS widget is not possible with expo-widgets (a tap cannot run app code), so ticking stays in the app.
 */
const Today = (props: TodayWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#1E1433' : '#FFF8EC';
  const text = dark ? '#FFF8EC' : '#1E1433';
  const muted = dark ? '#A398BD' : '#6A5E85';
  const rowsMax = environment.widgetFamily === 'systemLarge' ? 7 : 3;
  const rows = props.rows.slice(0, rowsMax);
  return (
    <VStack
      alignment="leading"
      spacing={6}
      modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'topLeading' }), padding({ all: 2 }), containerBackground(bg, 'widget'), widgetURL('nudge://today')]}
    >
      <HStack>
        <VStack alignment="leading" spacing={0}>
          <Text modifiers={[font({ size: 18, weight: 'black', design: 'rounded' }), foregroundStyle('#7B4FD6')]}>Today</Text>
          <Text modifiers={[font({ size: 12, weight: 'semibold', design: 'rounded' }), foregroundStyle(muted)]}>{props.subtitle}</Text>
        </VStack>
        <Spacer />
        <Link
          destination="nudge://add"
          label="+"
          modifiers={[font({ size: 24, weight: 'black', design: 'rounded' }), foregroundStyle('#FF6A1F')]}
        />
      </HStack>
      {rows.length === 0 ? (
        <Text modifiers={[font({ size: 15, weight: 'heavy', design: 'rounded' }), foregroundStyle(text), padding({ top: 8 })]}>{props.empty}</Text>
      ) : (
        rows.map((r) => (
          <Link key={r.id} destination={`nudge://task/${r.id}`} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
            <HStack spacing={8}>
              <Text modifiers={[font({ size: 16, weight: 'bold' }), foregroundStyle('#FF6A1F')]}>○</Text>
              <Text modifiers={[font({ size: 15, weight: 'semibold', design: 'rounded' }), foregroundStyle(text), lineLimit(1)]}>{r.label}</Text>
            </HStack>
          </Link>
        ))
      )}
      {props.more > 0 && rows.length > 0 ? (
        <Text modifiers={[font({ size: 12, weight: 'bold', design: 'rounded' }), foregroundStyle(muted)]}>{`+${props.more} more`}</Text>
      ) : null}
      <Spacer />
    </VStack>
  );
};

export default createWidget('NudgeToday', Today);
