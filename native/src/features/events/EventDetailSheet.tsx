/** Event detail. Route: app/events/[id].tsx (sheet). Shows when / length / repeat / reminder / place / notes; Edit (same form as New) and
 *  two-step Cancel. A repeating event offers "Cancel this day" (just the next occurrence) or "Cancel the whole series". */
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FieldGroup } from '@/features/tasks/FieldRow';
import { useNow } from '@/features/meetings/useNow';
import { dayLabel, reminderLabel, zoneCity } from '@/features/meetings/view';
import { useMeetings } from '@/hooks/useMeetings';
import { useToday } from '@/hooks/useToday';
import { MeetingsApiError } from '@/lib/meetingsApi';
import { Button, Chip, EmptyState, haptic, SheetScaffold, Text, useTheme, useToast } from '@/ui';
import EventForm from './EventForm';
import { draftOf, lengthText, occurrencesOf, rangeText, repeatLabel, toEventPatch } from './view';

function Row({ label, value, sub, last }: { label: string; value: string; sub?: string | null; last?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: last ? 0 : 2, borderBottomColor: colors.border }}>
      <Text variant="bodyStrong" style={{ width: 92 }}>{label}</Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text variant="body" tone="muted" style={{ textAlign: 'right' }}>{value}</Text>
        {sub ? <Text variant="caption" tone="faint" style={{ textAlign: 'right' }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function EventDetailSheet() {
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { events, updateEvent, cancelEvent } = useMeetings();
  const { zone } = useToday();
  const now = useNow();
  const [mode, setMode] = useState<'view' | 'edit' | 'confirm'>('view');
  const [busy, setBusy] = useState(false);
  const e = events.find((x) => x.id === id);
  const next = useMemo(() => (e ? occurrencesOf([e], now, now + 400 * 86_400_000)[0] : undefined), [e, now]);

  if (!e || e.status !== 'scheduled' || !next) {
    return (
      <SheetScaffold title="Event">
        <EmptyState compact pose="disappointed" title="That event is over or gone." action={{ label: 'Back', variant: 'secondary', onPress: () => router.back() }} />
      </SheetScaffold>
    );
  }

  const fail = (err: unknown, what: string) => {
    setBusy(false);
    toast.show(err instanceof MeetingsApiError && err.status === 401 ? 'Please sign in again.' : `Could not ${what}. Try again.`, { kind: 'error' });
  };

  if (mode === 'edit') {
    const orig = draftOf(e);
    return (
      <EventForm
        title="Edit event"
        initial={orig}
        submitLabel="Save"
        busy={busy}
        editing
        onSubmit={async (d) => {
          const patch = toEventPatch(d, orig);
          if (Object.keys(patch).length === 0) { setMode('view'); return; }
          setBusy(true);
          try {
            await updateEvent(e.id, patch);
            haptic.success();
            toast.show('Saved.', { kind: 'success' });
            setBusy(false);
            setMode('view');
          } catch (err) {
            fail(err, 'save it');
          }
        }}
      />
    );
  }

  const cancelOne = async () => {
    setBusy(true);
    try {
      await cancelEvent(e.id, next.date);
      haptic.success();
      toast.show('This day is cancelled.', { kind: 'success' });
      router.back();
    } catch (err) {
      setMode('view');
      fail(err, 'cancel');
    }
  };
  const cancelAll = async () => {
    setBusy(true);
    try {
      await cancelEvent(e.id);
      haptic.success();
      toast.show(e.repeat ? 'Series cancelled.' : 'Cancelled.', { kind: 'success' });
      router.back();
    } catch (err) {
      setMode('view');
      fail(err, 'cancel');
    }
  };

  const footer = mode === 'confirm' ? (
    <View style={{ gap: 8 }}>
      {e.repeat ? <Button label="Cancel just this day" variant="secondary" size="lg" fullWidth loading={busy} onPress={cancelOne} /> : null}
      <Button label={e.repeat ? 'Cancel the whole series' : 'Yes, cancel it'} variant="danger" size="lg" fullWidth loading={busy} onPress={cancelAll} />
      <Button label="Keep it" variant="ghost" fullWidth disabled={busy} onPress={() => setMode('view')} />
    </View>
  ) : (
    <View style={{ gap: 8 }}>
      <Button label="Edit" variant="secondary" size="lg" fullWidth icon="edit" onPress={() => { haptic.select(); setMode('edit'); }} />
      <Button label={e.repeat ? 'Cancel event...' : 'Cancel event'} variant="secondary" destructive size="lg" fullWidth onPress={() => { haptic.select(); setMode('confirm'); }} />
    </View>
  );

  return (
    <SheetScaffold title="Event" footer={footer}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 16 }}>
        <Text variant="title" numberOfLines={3}>{e.title}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Chip size="sm" label={now >= next.startMs ? 'Happening now' : dayLabel(new Date(next.startMs).toISOString(), zone, now)} tone="primary" selected={false} />
          {e.repeat ? <Chip size="sm" label={repeatLabel(e.repeat)} icon="repeat" selected={false} /> : null}
        </View>
        <FieldGroup>
          <Row label="When" value={rangeText(next.startMs, next.endMs, zone)} />
          <Row label="Length" value={lengthText(next)} />
          <Row label="Reminder" value={reminderLabel(e.reminderMinutes)} />
          {e.location ? <Row label="Place" value={e.location} /> : null}
          <Row label="Time zone" value={zoneCity(e.tz)} last />
        </FieldGroup>
        {e.notes ? (
          <>
            <Text variant="label" tone="muted">NOTES</Text>
            <Text>{e.notes}</Text>
          </>
        ) : null}
        <Text variant="caption" tone="muted">An event is not a task: there is nothing to tick off.</Text>
      </ScrollView>
    </SheetScaffold>
  );
}
