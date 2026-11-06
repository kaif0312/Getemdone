/** Draft date (+ optional time) editor with quick options, used for schedule, deadline and custom reminder. Saves on "Save". */
import React, { useState } from 'react';
import { View } from 'react-native';
import { addDays } from '@/lib/dates';
import { Button, Chip, Text } from '@/ui';
import { fmtDay, fmtTime } from './helpers';
import { DatePickerPanel, TimePickerPanel } from './Pickers';

export function DateTimeEditor({ today, initialDate, initialTime, withTime, requireTime, timeDefault, minDate, onSave, onClear, clearLabel = 'Clear' }: {
  today: string;
  initialDate: string | null;
  initialTime: string | null;
  /** Offer an optional time. */
  withTime?: boolean;
  /** Time is mandatory (custom reminder). */
  requireTime?: boolean;
  timeDefault?: string;
  minDate?: string;
  onSave: (date: string, time: string | null) => void;
  onClear?: () => void;
  clearLabel?: string;
}) {
  const [date, setDate] = useState<string>(initialDate ?? today);
  const [time, setTime] = useState<string | null>(initialTime ?? (requireTime ? (timeDefault ?? '09:00') : null));
  const [showCal, setShowCal] = useState(false);
  const tomorrow = addDays(today, 1);
  const nextWeek = addDays(today, 7);
  const quick = [
    { d: today, label: 'Today' },
    { d: tomorrow, label: 'Tomorrow' },
    { d: nextWeek, label: 'Next week' },
  ];
  const isQuick = quick.some((q) => q.d === date);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {quick.map((q) => (
          <Chip key={q.d} label={q.label} selected={date === q.d} onPress={() => { setDate(q.d); setShowCal(false); }} />
        ))}
        <Chip label={isQuick ? 'Pick date' : fmtDay(date, today)} icon="calendar" selected={!isQuick || showCal} onPress={() => setShowCal((v) => !v)} />
      </View>
      {showCal ? <DatePickerPanel value={date} today={today} minDate={minDate} onChange={(d) => { setDate(d); setShowCal(false); }} /> : null}

      {withTime || requireTime ? (
        time ? (
          <View style={{ gap: 8 }}>
            <TimePickerPanel value={time} onChange={setTime} />
            {!requireTime ? <Button label="Remove time" variant="ghost" size="sm" onPress={() => setTime(null)} /> : null}
          </View>
        ) : (
          <Chip label="Add a time" icon="clock" onPress={() => setTime(timeDefault ?? '09:00')} />
        )
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Button label="Save" size="sm" icon="check" onPress={() => onSave(date, time)} />
        {onClear ? <Button label={clearLabel} size="sm" variant="ghost" onPress={onClear} /> : null}
        <Text variant="caption" tone="faint" style={{ flex: 1 }} numberOfLines={1}>{fmtDay(date, today)}{time ? `, ${fmtTime(time)}` : ''}</Text>
      </View>
    </View>
  );
}
