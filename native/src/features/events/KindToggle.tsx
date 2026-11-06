/** Task | Event switch at the top of the Add sheet. */
import React from 'react';
import { View } from 'react-native';
import { Chip } from '@/ui';

export type AddKind = 'task' | 'event';

export default function KindToggle({ value, onChange }: { value: AddKind; onChange: (k: AddKind) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Chip label="Task" icon="check" selected={value === 'task'} onPress={() => onChange('task')} />
      <Chip label="Event" icon="calendar" selected={value === 'event'} onPress={() => onChange('event')} />
    </View>
  );
}
