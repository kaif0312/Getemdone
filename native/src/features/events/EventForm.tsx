/** The event form, shared by "New event" (inside the Add sheet) and "Edit" (event detail). Title, day, start, length, repeat,
 *  reminder, notes. Same fields and rules as the WhatsApp bot: default 60 min, nudge 30 min before, no guests, no Meet. */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { FieldGroup, FieldRow } from '@/features/tasks/FieldRow';
import { DatePickerPanel, TimePickerPanel } from '@/features/tasks/Pickers';
import { clockAt, dayLabel, fmtDuration, reminderLabel, wallToUtcMs } from '@/features/meetings/view';
import { useToday } from '@/hooks/useToday';
import type { EventRepeat } from '@/lib/eventsRules';
import { Button, Chip, SheetScaffold, Text, TextField } from '@/ui';
import { EVENT_DURATIONS, EVENT_REMINDER_CHOICES, repeatLabel, validateEvent, WEEKDAYS, type EventDraft } from './view';

type Open = 'date' | 'time' | 'length' | 'repeat' | 'reminders' | null;

export default function EventForm({ title, initial, submitLabel, busy, onSubmit, top, editing }: {
  title: string;
  initial: EventDraft;
  submitLabel: string;
  busy: boolean;
  onSubmit: (d: EventDraft) => void;
  /** Rendered above the title field (the Task | Event switch). */
  top?: React.ReactNode;
  /** Editing: a one-off whose time has passed may keep its time. */
  editing?: boolean;
}) {
  const { today } = useToday();
  const [d, setD] = useState<EventDraft>(initial);
  const [open, setOpen] = useState<Open>(null);
  const [tried, setTried] = useState(false);
  const set = <K extends keyof EventDraft>(k: K, v: EventDraft[K]) => setD((x) => ({ ...x, [k]: v }));
  const toggle = (k: Exclude<Open, null>) => setOpen((o) => (o === k ? null : k));
  const problem = validateEvent(d, editing ? 0 : Date.now());
  const startMs = wallToUtcMs(d.date, d.time, d.tz);
  const setRepeat = (r: EventRepeat | null) => set('repeat', r);
  const weekly = d.repeat?.freq === 'weekly';
  const days = d.repeat?.days ?? [];

  const footer = (
    <View style={{ gap: 8 }}>
      <Button label={submitLabel} size="lg" fullWidth loading={busy} disabled={!!problem} onPress={() => { setTried(true); if (!problem) onSubmit(d); }} />
      {tried && problem ? <Text variant="caption" tone="danger" align="center">{problem}</Text> : null}
    </View>
  );

  const body = (
    <SheetScaffold title={title} footer={footer}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 16 }}>
        {top}
        <TextField label="Title" placeholder="Physio, music class, flight..." value={d.title} onChangeText={(v) => set('title', v)} maxLength={120} autoFocus={!editing} returnKeyType="done" />

        <FieldGroup>
          <FieldRow icon="calendar" label="Day" value={dayLabel(new Date(wallToUtcMs(d.date, '12:00', d.tz)).toISOString(), d.tz)} open={open === 'date'} onToggle={() => toggle('date')}>
            <DatePickerPanel value={d.date} today={today} minDate={editing ? undefined : today} onChange={(x) => { set('date', x); setOpen(null); }} />
          </FieldRow>
          <FieldRow icon="clock" label="Starts" value={clockAt(startMs, d.tz)} open={open === 'time'} onToggle={() => toggle('time')}>
            <TimePickerPanel value={d.time} onChange={(t) => set('time', t)} />
          </FieldRow>
          <FieldRow icon="clock" label="Length" value={fmtDuration(d.durationMin)} open={open === 'length'} onToggle={() => toggle('length')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EVENT_DURATIONS.map((n) => <Chip key={n} label={fmtDuration(n)} selected={d.durationMin === n} onPress={() => set('durationMin', n)} />)}
            </View>
          </FieldRow>
          <FieldRow icon="repeat" label="Repeat" value={repeatLabel(d.repeat)} open={open === 'repeat'} onToggle={() => toggle('repeat')}>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Chip label="Never" selected={!d.repeat} onPress={() => setRepeat(null)} />
                <Chip label="Every day" selected={d.repeat?.freq === 'daily'} onPress={() => setRepeat({ freq: 'daily' })} />
                <Chip label="Weekdays" selected={d.repeat?.freq === 'weekdays'} onPress={() => setRepeat({ freq: 'weekdays' })} />
                <Chip label="Weekly" selected={weekly} onPress={() => setRepeat({ freq: 'weekly', days: days.length ? days : [new Date(`${d.date}T12:00:00Z`).getUTCDay()] })} />
              </View>
              {weekly ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {WEEKDAYS.map((w) => {
                    const on = days.includes(w.n);
                    return <Chip key={w.n} size="sm" label={w.short} selected={on} onPress={() => setRepeat({ freq: 'weekly', days: on ? days.filter((x) => x !== w.n) : [...days, w.n].sort() })} />;
                  })}
                </View>
              ) : null}
            </View>
          </FieldRow>
          <FieldRow icon="bell" label="Reminder" value={reminderLabel(d.reminderMinutes)} open={open === 'reminders'} onToggle={() => toggle('reminders')} last>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {EVENT_REMINDER_CHOICES.map((c) => {
                const on = d.reminderMinutes.includes(c.min);
                return <Chip key={c.min} label={c.label} selected={on} onPress={() => set('reminderMinutes', on ? d.reminderMinutes.filter((x) => x !== c.min) : [...d.reminderMinutes, c.min])} />;
              })}
            </View>
          </FieldRow>
        </FieldGroup>

        <TextField label="Place" placeholder="Where (optional)" value={d.location} onChangeText={(v) => set('location', v)} maxLength={200} />
        <TextField label="Notes" placeholder="Anything to remember (optional)" value={d.notes} onChangeText={(v) => set('notes', v)} multiline numberOfLines={3} />
        <Text variant="caption" tone="muted">Events are not tasks: nothing to tick off. They show in your calendar feed after a sync.</Text>
      </ScrollView>
    </SheetScaffold>
  );

  return Platform.OS === 'ios' ? <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>{body}</KeyboardAvoidingView> : body;
}
