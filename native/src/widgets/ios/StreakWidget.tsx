import { Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export interface StreakWidgetProps {
  /** '-' when signed out. */
  streak: string;
  unit: string;
  note: string;
  atRisk: boolean;
}

/** Streak (small): the number, "days", and one line (the app computes the text). Tap opens Progress. */
const Streak = (props: StreakWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  const bg = dark ? '#1E1433' : '#FFF8EC';
  const muted = dark ? '#A398BD' : '#6A5E85';
  return (
    <VStack
      spacing={0}
      modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'center' }), containerBackground(bg, 'widget'), widgetURL('nudge://progress')]}
    >
      <Spacer />
      <Text modifiers={[font({ size: 44, weight: 'black', design: 'rounded' }), foregroundStyle('#FF6A1F')]}>{props.streak}</Text>
      <Text modifiers={[font({ size: 14, weight: 'heavy', design: 'rounded' }), foregroundStyle(muted)]}>{props.unit}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 12, weight: 'bold', design: 'rounded' }), foregroundStyle(props.atRisk ? '#FF6A1F' : muted)]}>{props.note}</Text>
    </VStack>
  );
};

export default createWidget('NudgeStreak', Streak);
