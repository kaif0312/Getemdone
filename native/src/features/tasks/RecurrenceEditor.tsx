/** Recurrence editor with the PWA's options (daily, weekdays, weekly, every 2 weeks, monthly, custom + end condition). */
import React, { useState } from 'react';
import { View } from 'react-native';
import type { Recurrence } from '@/lib/types';
import { Button, Chip, Text } from '@/ui';
import { fmtDay } from './helpers';
import { Cell, DatePickerPanel, Stepper } from './Pickers';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function describeRecurrence(r: Recurrence | null | undefined): string {
  if (!r) return 'Does not repeat';
  const days = (r.days ?? []).slice().sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)).map((d) => DAY_SHORT[d]).join(', ');
  let base: string;
  switch (r.frequency) {
    case 'daily': base = 'Every day'; break;
    case 'weekdays': base = 'Weekdays'; break;
    case 'weekly': base = days ? `Weekly: ${days}` : 'Weekly'; break;
    case 'biweekly': base = days ? `Every 2 weeks: ${days}` : 'Every 2 weeks'; break;
    case 'monthly': base = r.dayOfMonth === -1 ? 'Monthly, last day' : `Monthly, day ${r.dayOfMonth ?? ''}`.trim(); break;
    default: {
      const n = r.interval ?? 1;
      const unit = r.intervalUnit ?? 'days';
      base = `Every ${n > 1 ? `${n} ` : ''}${n > 1 ? unit : unit.slice(0, -1)}${unit === 'weeks' && days ? `: ${days}` : ''}`;
    }
  }
  if (r.endType === 'onDate' && r.endDate) base += `, until ${r.endDate}`;
  if (r.endType === 'afterOccurrences' && r.endAfterOccurrences) base += `, ${r.endAfterOccurrences} times`;
  return base;
}

type Preset = 'none' | Recurrence['frequency'];

export function RecurrenceEditor({ value, today, onSave, onCancel }: {
  value: Recurrence | null; today: string; onSave: (r: Recurrence | null) => void; onCancel: () => void;
}) {
  const [freq, setFreq] = useState<Preset>(value?.frequency ?? 'none');
  const [days, setDays] = useState<number[]>(value?.days ?? []);
  const [interval, setInterval_] = useState(value?.interval ?? 2);
  const [unit, setUnit] = useState<'days' | 'weeks' | 'months'>(value?.intervalUnit ?? 'days');
  const [dom, setDom] = useState(value?.dayOfMonth ?? Number(today.slice(8, 10)));
  const [endType, setEndType] = useState<'never' | 'onDate' | 'afterOccurrences'>(value?.endType ?? 'never');
  const [endDate, setEndDate] = useState<string | null>(value?.endDate ?? null);
  const [after, setAfter] = useState(value?.endAfterOccurrences ?? 10);

  const needsDays = freq === 'weekly' || freq === 'biweekly' || (freq === 'custom' && unit === 'weeks');
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const save = () => {
    if (freq === 'none') return onSave(null);
    const r: Recurrence = {
      ...(value ?? {}),
      frequency: freq,
      startDate: value?.startDate ?? today,
      endType,
    };
    if (needsDays) r.days = days.length ? days : [new Date(today + 'T00:00:00').getDay()];
    else delete r.days;
    if (freq === 'custom') {
      r.interval = interval;
      r.intervalUnit = unit;
    } else {
      delete r.interval;
      delete r.intervalUnit;
    }
    if (freq === 'monthly') r.dayOfMonth = dom;
    else delete r.dayOfMonth;
    if (endType === 'onDate' && endDate) r.endDate = endDate;
    else delete r.endDate;
    if (endType === 'afterOccurrences') r.endAfterOccurrences = after;
    else delete r.endAfterOccurrences;
    onSave(r);
  };

  const freqs: { id: Preset; label: string }[] = [
    { id: 'none', label: 'Never' }, { id: 'daily', label: 'Daily' }, { id: 'weekdays', label: 'Weekdays' }, { id: 'weekly', label: 'Weekly' },
    { id: 'biweekly', label: 'Every 2 weeks' }, { id: 'monthly', label: 'Monthly' }, { id: 'custom', label: 'Custom' },
  ];

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {freqs.map((f) => <Chip key={f.id} label={f.label} selected={freq === f.id} onPress={() => setFreq(f.id)} />)}
      </View>

      {freq === 'custom' ? (
        <View style={{ gap: 10 }}>
          <Text variant="label" tone="faint">Every</Text>
          <Stepper value={interval} min={1} max={99} onChange={setInterval_} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['days', 'weeks', 'months'] as const).map((u) => <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} size="sm" />)}
          </View>
        </View>
      ) : null}

      {needsDays ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="faint">On</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {DAY_ORDER.map((d) => <Cell key={d} label={DAY_SHORT[d].slice(0, 2)} selected={days.includes(d)} onPress={() => toggleDay(d)} height={42} />)}
          </View>
        </View>
      ) : null}

      {freq === 'monthly' ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="faint">Day of month</Text>
          <Stepper value={dom === -1 ? 31 : dom} min={1} max={31} onChange={setDom} />
          <Chip label="Last day" selected={dom === -1} onPress={() => setDom(dom === -1 ? Number(today.slice(8, 10)) : -1)} size="sm" />
        </View>
      ) : null}

      {freq !== 'none' ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="faint">Ends</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label="Never" selected={endType === 'never'} onPress={() => setEndType('never')} size="sm" />
            <Chip label="On a date" selected={endType === 'onDate'} onPress={() => setEndType('onDate')} size="sm" />
            <Chip label="After N times" selected={endType === 'afterOccurrences'} onPress={() => setEndType('afterOccurrences')} size="sm" />
          </View>
          {endType === 'onDate' ? (
            <>
              <DatePickerPanel value={endDate} today={today} minDate={today} onChange={setEndDate} />
              {endDate ? <Text variant="caption" tone="muted">Ends {fmtDay(endDate, today)}</Text> : null}
            </>
          ) : null}
          {endType === 'afterOccurrences' ? <Stepper value={after} min={1} max={999} onChange={setAfter} suffix="times" /> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="Save" size="sm" icon="check" onPress={save} disabled={freq !== 'none' && endType === 'onDate' && !endDate} />
        <Button label="Cancel" size="sm" variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}
