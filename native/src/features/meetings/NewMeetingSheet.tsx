/** New meeting (spec 2.4). Route: app/meetings/new.tsx, sheet. `?date=YYYY-MM-DD` prefills the day (never a past one). */
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FieldGroup, FieldRow } from '@/features/tasks/FieldRow';
import { DatePickerPanel, TimePickerPanel } from '@/features/tasks/Pickers';
import { useMeetings } from '@/hooks/useMeetings';
import { usePush } from '@/hooks/usePush';
import { useToday } from '@/hooks/useToday';
import { MeetingsApiError } from '@/lib/meetingsApi';
import type { MeetingAttendee } from '@/lib/meetingsTypes';
import { Button, Chip, haptic, SheetScaffold, Text, TextField, useToast } from '@/ui';
import { PersonPill } from './AttendeeChips';
import { useMeetingsCalendar } from './useMeetingsCalendar';
import {
  clockAt, DEFAULT_DURATION, DEFAULT_REMINDERS, defaultStart, dayLabel, DURATIONS, EMAIL_RE, fmtDuration, MAX_ATTENDEES,
  reminderLabel, REMINDER_CHOICES, validateDraft, wallToUtcMs, zoneChoices, zoneCity, type NewMeetingDraft,
} from './view';

type Open = 'date' | 'time' | 'length' | 'zone' | 'reminders' | null;

export default function NewMeetingSheet() {
  const router = useRouter();
  const toast = useToast();
  const push = usePush();
  const params = useLocalSearchParams<{ date?: string }>();
  const { create } = useMeetings();
  const { zone, today } = useToday();
  const cal = useMeetingsCalendar();

  const [draft, setDraft] = useState<NewMeetingDraft>(() => {
    const s = defaultStart(zone);
    const wanted = typeof params.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.date) && params.date >= s.date ? params.date : null;
    return {
      title: '', date: wanted ?? s.date, time: wanted && wanted !== s.date ? '09:00' : s.time, durationMin: DEFAULT_DURATION, tz: zone,
      attendees: [], notes: '', reminderMinutes: DEFAULT_REMINDERS,
    };
  });
  const [open, setOpen] = useState<Open>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof NewMeetingDraft>(k: K, v: NewMeetingDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (k: Exclude<Open, null>) => setOpen((o) => (o === k ? null : k));

  const problem = validateDraft(draft);
  const startMs = wallToUtcMs(draft.date, draft.time, draft.tz);
  const canAdd = (name.trim().length > 0 || email.trim().length > 0) && (!email.trim() || EMAIL_RE.test(email.trim())) && draft.attendees.length < MAX_ATTENDEES;
  const zones = useMemo(() => zoneChoices(zone), [zone]);

  const addPerson = () => {
    const a: MeetingAttendee = {};
    if (name.trim()) a.name = name.trim();
    if (email.trim()) a.email = email.trim();
    set('attendees', [...draft.attendees, a]);
    setName('');
    setEmail('');
    haptic.select();
  };

  const book = async () => {
    setTried(true);
    if (problem) { haptic.error(); return; }
    setBusy(true);
    try {
      const r = await create(draft);
      haptic.success();
      if (r.calendar === 'ok') toast.show('Booked.', { kind: 'success' });
      else if (r.calendar === 'not_connected') toast.show('Booked in Nudge. Connect Google Calendar for invites.', { kind: 'info' });
      else toast.show('Booked in Nudge. Google Calendar failed, no invite went out.', { kind: 'error' });
      void push.askAfterFirstAction();
      router.back();
    } catch (e) {
      setBusy(false);
      toast.show(e instanceof MeetingsApiError && e.status === 401 ? 'Please sign in again.' : 'Could not book it. Try again.', { kind: 'error' });
    }
  };

  const footer = (
    <View style={{ gap: 8 }}>
      <Button label="Book it" size="lg" fullWidth loading={busy} disabled={!!problem} onPress={book} />
      {tried && problem ? <Text variant="caption" tone="danger" align="center">{problem}</Text> : null}
    </View>
  );

  const body = (
    <SheetScaffold title="New meeting" footer={footer}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 16 }}>
        <TextField label="Title" placeholder="What is it about?" value={draft.title} onChangeText={(v) => set('title', v)} maxLength={120} autoFocus returnKeyType="done" />

        <FieldGroup>
          <FieldRow icon="calendar" label="Date" value={dayLabel(new Date(wallToUtcMs(draft.date, '12:00', draft.tz)).toISOString(), draft.tz)} open={open === 'date'} onToggle={() => toggle('date')}>
            <DatePickerPanel value={draft.date} today={today} minDate={today} onChange={(d) => { set('date', d); setOpen(null); }} />
          </FieldRow>
          <FieldRow icon="clock" label="Time" value={clockAt(startMs, draft.tz)} open={open === 'time'} onToggle={() => toggle('time')}>
            <TimePickerPanel value={draft.time} onChange={(t) => set('time', t)} />
          </FieldRow>
          <FieldRow icon="clock" label="Length" value={fmtDuration(draft.durationMin)} open={open === 'length'} onToggle={() => toggle('length')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DURATIONS.map((n) => <Chip key={n} label={fmtDuration(n)} selected={draft.durationMin === n} onPress={() => set('durationMin', n)} />)}
            </View>
          </FieldRow>
          <FieldRow icon="globe" label="Time zone" value={zoneCity(draft.tz)} open={open === 'zone'} onToggle={() => toggle('zone')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {zones.map((z) => <Chip key={z} label={zoneCity(z)} selected={draft.tz === z} onPress={() => set('tz', z)} />)}
            </View>
          </FieldRow>
          <FieldRow icon="bell" label="Reminders" value={reminderLabel(draft.reminderMinutes)} open={open === 'reminders'} onToggle={() => toggle('reminders')} last>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REMINDER_CHOICES.map((c) => {
                const on = draft.reminderMinutes.includes(c.min);
                return (
                  <Chip
                    key={c.min}
                    label={c.label}
                    selected={on}
                    onPress={() => set('reminderMinutes', on ? draft.reminderMinutes.filter((x) => x !== c.min) : [...draft.reminderMinutes, c.min])}
                  />
                );
              })}
            </View>
          </FieldRow>
        </FieldGroup>

        <Text variant="label" tone="muted">WHO</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><TextField label="Name" placeholder="Name" value={name} onChangeText={setName} maxLength={60} autoCapitalize="words" /></View>
          <View style={{ flex: 1.3 }}>
            <TextField label="Email" placeholder="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </View>
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Button label="Add" size="sm" variant="secondary" icon="plus" disabled={!canAdd} onPress={addPerson} />
        </View>
        {draft.attendees.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {draft.attendees.map((a, i) => (
              <PersonPill key={`${a.email ?? a.name}-${i}`} a={a} onRemove={() => set('attendees', draft.attendees.filter((_, j) => j !== i))} />
            ))}
          </View>
        ) : null}

        <TextField label="Notes" placeholder="Anything to remember (optional)" value={draft.notes} onChangeText={(v) => set('notes', v)} multiline numberOfLines={4} />

        {cal.connected === null ? null : (
          <Text variant="caption" tone="muted">
            {cal.connected ? 'Google Calendar sends the invite and the Meet link.' : 'Google Calendar is not connected: no invite, no Meet link.'}
          </Text>
        )}
      </ScrollView>
    </SheetScaffold>
  );

  return Platform.OS === 'ios' ? <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>{body}</KeyboardAvoidingView> : body;
}
