/**
 * Me > Routines: things you do on a schedule (take isabgol at night). At the time Nudge sends a WhatsApp message with
 * Done / Skip; here you can also mark today's one done, add, edit and delete. Parity with the web RoutinesSheet.
 * Route: /me/routines (thin file in app/me). Data: useRoutines (api.ts -> /api/routines).
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { TimePickerPanel } from '@/features/tasks/Pickers';
import { fmtTime } from '@/features/tasks/helpers';
import { openCoachChat } from '@/features/settings/links';
import { Button, Card, EmptyState, ErrorState, haptic, Icon, SheetScaffold, SkeletonList, StreakFlame, Text, TextField, useTheme, useToast } from '@/ui';
import type { Routine } from './api';
import { DAY_LETTERS, dayFull, daysText } from './labels';
import { useRoutines } from './useRoutines';

const SAMPLE = 'remind me to take isabgol every night at 10';

function DayChips({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  const { colors } = useTheme();
  const toggle = (d: number) => {
    haptic.select();
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  };
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {DAY_LETTERS.map((l, d) => {
        const on = value.includes(d);
        return (
          <Pressable
            key={d}
            onPress={() => toggle(d)}
            accessibilityRole="button"
            accessibilityLabel={dayFull(d)}
            accessibilityState={{ selected: on }}
            style={{
              flex: 1, maxWidth: 48, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
              backgroundColor: on ? colors.primary : colors.surface, borderWidth: 2, borderColor: on ? colors.primary : colors.border,
            }}
          >
            <Text variant="bodyStrong" style={{ color: on ? colors.onFill : colors.textMuted }}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface FormValue {
  title: string;
  time: string;
  days: number[];
}

function RoutineForm({ initial, busy, error, onSave, onCancel }: {
  initial: Routine | null;
  busy: boolean;
  error: string;
  onSave: (v: FormValue) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [time, setTime] = useState(initial?.time ?? '22:00');
  const [days, setDays] = useState<number[]>(initial?.days ?? []);
  const footer = (
    <View style={{ gap: 6 }}>
      <Button label="Save" fullWidth loading={busy} disabled={!title.trim()} onPress={() => onSave({ title, time, days })} />
      <Button label="Cancel" variant="ghost" fullWidth disabled={busy} onPress={onCancel} />
    </View>
  );
  return (
    <SheetScaffold title={initial ? 'Edit routine' : 'New routine'} hideClose footer={footer}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 12 }}>
        <TextField label="Name" value={title} onChangeText={setTitle} maxLength={60} placeholder="e.g. Take isabgol" autoFocus={!initial} returnKeyType="done" />
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">Time</Text>
          <TimePickerPanel value={time} onChange={setTime} />
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">Days</Text>
          <DayChips value={days} onChange={setDays} />
          <Text variant="caption" tone="faint">{days.length ? daysText(days) : 'Every day. Tap days to limit it.'}</Text>
        </View>
        {error ? <Text variant="caption" tone="danger">{error}</Text> : null}
      </ScrollView>
    </SheetScaffold>
  );
}

function RoutineRow({ r, busy, confirming, onEdit, onDone, onAskDelete, onCancelDelete, onDelete }: {
  r: Routine;
  busy: string | null;
  confirming: boolean;
  onEdit: () => void;
  onDone: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const doneToday = r.runsToday && r.today === 'done';
  const canMark = r.runsToday && r.today !== 'done' && r.today !== 'skipped';
  const sub = r.runsToday ? (r.today === 'sent' ? 'Sent. Waiting for you.' : '') : 'Not today';
  return (
    <Card padding={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`${r.title}, ${fmtTime(r.time)}, ${daysText(r.days)}${r.streak ? `, streak ${r.streak}` : ''}. Edit`}
          style={{ flex: 1, minHeight: 44, justifyContent: 'center', gap: 2 }}
        >
          <Text variant="bodyStrong" numberOfLines={2}>{r.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text variant="caption" tone="muted">{fmtTime(r.time)} · {daysText(r.days)}</Text>
            {r.streak > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <StreakFlame size={14} lit={doneToday || !r.runsToday} />
                <Text variant="caption" tone="muted">{r.streak}</Text>
              </View>
            ) : null}
          </View>
          {sub ? <Text variant="caption" tone="faint">{sub}</Text> : null}
        </Pressable>
        {doneToday ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="check" size={16} color={colors.success} />
            <Text variant="caption" style={{ color: colors.success }}>Done today</Text>
          </View>
        ) : r.today === 'skipped' ? (
          <Text variant="caption" tone="faint">Skipped</Text>
        ) : canMark ? (
          <Button label="Mark done" size="sm" variant="success" loading={busy === `done:${r.id}`} disabled={!!busy} onPress={onDone} />
        ) : null}
        <Pressable
          onPress={onAskDelete}
          disabled={!!busy}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${r.title}`}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}
        >
          <Icon name="trash" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
      {confirming ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Text variant="caption" tone="muted">Delete this routine? Nudge stops messaging you about it.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Delete" size="sm" variant="danger" loading={busy === `del:${r.id}`} disabled={!!busy} onPress={onDelete} />
            <Button label="Keep" size="sm" variant="ghost" disabled={!!busy} onPress={onCancelDelete} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

export default function RoutinesSheet() {
  const toast = useToast();
  const { routines, loading, loadError, busy, refresh, create, edit, markDone, remove } = useRoutines();
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  if (editing) {
    return (
      <RoutineForm
        key={editing === 'new' ? 'new' : editing.id}
        initial={editing === 'new' ? null : editing}
        busy={busy === 'save'}
        error={formError}
        onCancel={() => { setEditing(null); setFormError(''); }}
        onSave={(v) => {
          setFormError('');
          void (editing === 'new' ? create(v) : edit(editing.id, v)).then((err) => {
            if (err) {
              haptic.error();
              setFormError(err);
            } else {
              haptic.success();
              setEditing(null);
            }
          });
        }}
      />
    );
  }

  const onMark = (id: string) =>
    void markDone(id).then((err) => {
      if (err) toast.show(err, { kind: 'error' });
      else {
        haptic.success();
        toast.show('Done. Streak kept.', { kind: 'success' });
      }
    });
  const onDelete = (id: string) =>
    void remove(id).then((err) => {
      setConfirmId(null);
      if (err) toast.show(err, { kind: 'error' });
      else haptic.success();
    });

  let body: React.ReactNode;
  if (loading) body = <SkeletonList count={3} />;
  else if (!routines) body = <ErrorState body="Could not load routines." onRetry={() => void refresh()} />;
  else if (routines.length === 0) {
    body = <EmptyState pose="clipboard" title="No routines yet." body="Set the things you do every day or week. Nudge messages you at the time with a Done button." />;
  } else {
    body = (
      <View style={{ gap: 10 }}>
        {routines.map((r) => (
          <RoutineRow
            key={r.id}
            r={r}
            busy={busy}
            confirming={confirmId === r.id}
            onEdit={() => { setFormError(''); setEditing(r); }}
            onDone={() => onMark(r.id)}
            onAskDelete={() => { haptic.select(); setConfirmId(confirmId === r.id ? null : r.id); }}
            onCancelDelete={() => setConfirmId(null)}
            onDelete={() => onDelete(r.id)}
          />
        ))}
      </View>
    );
  }

  return (
    <SheetScaffold
      title="Routines"
      footer={<Button label="Add a routine" icon="plus" fullWidth disabled={!routines} onPress={() => { setFormError(''); setEditing('new'); }} />}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
        <Text variant="caption" tone="muted">Things you do on a schedule. At the time you get a WhatsApp message with a Done button.</Text>
        {loadError && routines ? <Text variant="caption" tone="danger">Could not refresh. Showing the last list.</Text> : null}
        {body}
        <Pressable
          onPress={() => void openCoachChat(SAMPLE)}
          accessibilityRole="button"
          accessibilityLabel="Message Nudge on WhatsApp"
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text variant="caption" tone="muted">
            Or message Nudge on WhatsApp: <Text variant="caption" tone="primary">{`"${SAMPLE}"`}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </SheetScaffold>
  );
}
