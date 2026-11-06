/** Meeting detail (spec 2.3). Route: app/meetings/[id].tsx, sheet. Read-only; the only action is the two-step cancel. */
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FieldGroup } from '@/features/tasks/FieldRow';
import { useMeetings } from '@/hooks/useMeetings';
import { useToday } from '@/hooks/useToday';
import { Button, Chip, EmptyState, haptic, SheetScaffold, Text, useTheme, useToast } from '@/ui';
import { MeetingsApiError } from '@/lib/meetingsApi';
import { Linking } from 'react-native';
import { SourceBadge } from './SourceBadge';
import { openMeet } from './ui';
import { useNow } from './useNow';
import { attendeeInitials, attendeeLabel, dayLabel, durationMin, fmtDuration, joinState, reminderLabel, timeLines, zoneCity } from './view';

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

export default function MeetingDetailSheet() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { meetings, cancel } = useMeetings();
  const { zone } = useToday();
  const now = useNow();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const m = meetings.find((x) => x.id === id);

  if (!m || m.status !== 'scheduled') {
    return (
      <SheetScaffold title="Meeting">
        <EmptyState compact pose="disappointed" title="That meeting is gone." action={{ label: 'Back', variant: 'secondary', onPress: () => router.back() }} />
      </SheetScaffold>
    );
  }

  const t = timeLines(m, zone);
  const join = joinState(m, now);
  const doCancel = async () => {
    setBusy(true);
    try {
      await cancel(m.id);
      haptic.success();
      toast.show(m.gcalEventId ? 'Cancelled. Google Calendar updated.' : 'Cancelled.', { kind: 'success' });
      router.back();
    } catch (e) {
      setBusy(false);
      setConfirm(false);
      toast.show(e instanceof MeetingsApiError && e.status === 401 ? 'Please sign in again.' : 'Could not cancel. Try again.', { kind: 'error' });
    }
  };

  const footer = confirm ? (
    <View style={{ gap: 8 }}>
      <Button label="Yes, cancel it" variant="danger" size="lg" fullWidth loading={busy} onPress={doCancel} />
      <Button label="Keep it" variant="ghost" fullWidth disabled={busy} onPress={() => setConfirm(false)} />
    </View>
  ) : (
    <Button label="Cancel meeting" variant="secondary" destructive size="lg" fullWidth onPress={() => { haptic.select(); setConfirm(true); }} />
  );

  return (
    <SheetScaffold title="Meeting" footer={footer}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 16 }}>
        <Text variant="title" numberOfLines={3}>{m.title}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <SourceBadge via={m.createdVia} />
          <Chip size="sm" label={dayLabel(m.startAt, zone, now)} tone="primary" selected={false} />
        </View>

        <FieldGroup>
          <Row label="When" value={t.main} sub={t.other} />
          <Row label="Length" value={fmtDuration(durationMin(m))} />
          <Row label="Reminders" value={reminderLabel(m.reminderMinutes)} />
          <Row label="Time zone" value={zoneCity(m.tz)} last />
        </FieldGroup>

        <Text variant="label" tone="muted">WHO</Text>
        {m.attendees.length === 0 ? (
          <Text variant="caption" tone="muted">Just you.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {m.attendees.map((a, i) => (
              <View key={`${a.email ?? a.name ?? i}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="caption" tone="primary" style={{ fontSize: 12 }}>{attendeeInitials(a)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>{attendeeLabel(a)}</Text>
                  {a.email && a.name ? <Text variant="caption" tone="muted" numberOfLines={1}>{a.email}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        )}

        {m.notes ? (
          <>
            <Text variant="label" tone="muted">NOTES</Text>
            <Text>{m.notes}</Text>
          </>
        ) : null}

        {m.meetUrl && join !== 'none' ? (
          <Button label="Join Meet" icon="video" size="lg" fullWidth variant={join === 'later' ? 'secondary' : 'accent'} onPress={() => openMeet(m.meetUrl!)} />
        ) : null}
        {m.gcalLink ? (
          <Button label="Open in Google Calendar" variant="ghost" fullWidth onPress={() => void Linking.openURL(m.gcalLink!).catch(() => {})} />
        ) : null}
      </ScrollView>
    </SheetScaffold>
  );
}
