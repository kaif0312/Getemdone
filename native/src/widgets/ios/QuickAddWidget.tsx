import { Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

/** Quick Add (small): one tap opens the Add sheet. Static, no props. */
const QuickAdd = () => {
  'widget';
  return (
    <VStack
      spacing={0}
      modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: 'center' }), containerBackground('#7B4FD6', 'widget'), widgetURL('nudge://add')]}
    >
      <Spacer />
      <Text modifiers={[font({ size: 48, weight: 'black', design: 'rounded' }), foregroundStyle('#FFFFFF')]}>+</Text>
      <Text modifiers={[font({ size: 14, weight: 'heavy', design: 'rounded' }), foregroundStyle('#FFFFFF')]}>Add task</Text>
      <Spacer />
    </VStack>
  );
};

export default createWidget('NudgeQuickAdd', QuickAdd);
