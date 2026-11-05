/**
 * Calendar: a month grid (tap a day to see it below) and a week agenda. Same data rules as the WhatsApp images
 * (`./events.ts` is a copy of the server's lib/calendar/events.ts): deferredTo -> task, dueDate -> deadline, recurring -> habit.
 * Route: app/calendar.tsx. Opened from the calendar button in the Today header.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { BackButton } from '@/features/friends/BackButton';
import { fmtTime } from '@/features/tasks/helpers';
import { useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import { getActiveZone } from '@/lib/dates';
import type { Task } from '@/lib/types';
import {
  AnimatedCheckbox, Button, Card, Chip, EmptyState, ErrorState, haptic, Header, Icon, radius, Screen, SkeletonList, Text, useTheme, useToast,
} from '@/ui';
import { buildMonth, buildWeek, DOW_SHORT, MONTH_NAMES, dowMon, type CalDay, type CalEvent } from './events';

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function dayTitle(date: string, today: string): string {
  const [, m, d] = date.split('-').map(Number);
  const base = `${DOW_SHORT[dowMon(date)]} ${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
  return date === today ? `Today, ${base}` : base;
}

type Tone = 'accent' | 'primary' | 'success' | 'danger';
function toneOf(e: CalEvent, past: boolean): Tone {
  if (e.done) return 'success';
  if (past && !e.recurring) return 'danger';
  return e.kind === 'deadline' ? 'primary' : 'accent';
}

// ---- month grid -----------------------------------------------------------------------------------------------------

const Cell = memo(function Cell({ day, selected, onPress }: { day: CalDay; selected: boolean; onPress: (d: string) => void }) {
  const { colors } = useTheme();
  const col = { accent: colors.accent, primary: colors.primary, success: colors.success, danger: colors.danger };
  const n = Number(day.date.slice(8));
  const chips = day.events.filter((e) => !e.recurring);
  const habits = day.events.filter((e) => e.recurring);
  const allDone = day.events.length > 0 && day.events.every((e) => e.done);
  return (
    <Pressable
      onPress={() => onPress(day.date)}
      accessibilityRole="button"
      accessibilityLabel={`${dayTitle(day.date, '')}, ${day.events.length} items`}
      accessibilityState={{ selected }}
      style={{ flex: 1, height: 58, padding: 2 }}
    >
      <View
        style={{
          flex: 1, borderRadius: 14, alignItems: 'center', paddingTop: 5, gap: 4,
          backgroundColor: selected ? colors.primarySoft : day.inMonth ? colors.surface : 'transparent',
          borderWidth: 2, borderColor: selected ? colors.primary : 'transparent', opacity: day.inMonth ? 1 : 0.45,
        }}
      >
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: day.isToday ? colors.accent : 'transparent' }}>
          {allDone && !day.isToday ? (
            <Icon name="check" size={16} color={colors.success} strokeWidth={3.2} />
          ) : (
            <Text variant="bodyStrong" tone={day.isToday ? 'onFill' : 'default'} style={{ fontSize: 15, lineHeight: 20 }}>{String(n)}</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' }}>
          {chips.slice(0, 3).map((e, i) => (
            <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: col[toneOf(e, day.isPast)] }} />
          ))}
          {habits.length ? (
            <View style={{ width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: habits.every((h) => h.done) ? colors.success : colors.textFaint }} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

function Legend() {
  const { colors } = useTheme();
  const item = (c: string, label: string) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c }} />
      <Text variant="caption" tone="muted">{label}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', paddingHorizontal: 4 }}>
      {item(colors.accent, 'Task')}{item(colors.primary, 'Deadline')}{item(colors.success, 'Done')}{item(colors.danger, 'Missed')}
    </View>
  );
}

// ---- agenda rows ----------------------------------------------------------------------------------------------------

function EventRow({ e, past, onToggle, onOpen }: { e: CalEvent; past: boolean; onToggle: (e: CalEvent, next: boolean) => void; onOpen: (id: string) => void }) {
  const { colors } = useTheme();
  const tone = toneOf(e, past);
  const c = { accent: colors.accent, primary: colors.primary, success: colors.success, danger: colors.danger }[tone];
  return (
    <Pressable
      onPress={() => onOpen(e.id)}
      accessibilityRole="button"
      accessibilityLabel={`${e.text}${e.time ? ', ' + fmtTime(e.time) : ''}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 }}
    >
      <AnimatedCheckbox checked={e.done} onToggle={(next) => onToggle(e, next)} size={26} accessibilityLabel={e.done ? 'Mark not done' : 'Mark done'} />
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: c, opacity: 0.9 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={2} tone={e.done ? 'muted' : 'default'} style={e.done ? { textDecorationLine: 'line-through' } : undefined}>{e.text}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="caption" tone={e.time ? (tone === 'danger' ? 'danger' : 'muted') : 'faint'}>{e.time ? fmtTime(e.time) : 'Anytime'}</Text>
          {e.kind === 'deadline' && !e.done ? <Text variant="caption" tone="primary">Due</Text> : null}
          {e.recurring ? <Icon name="repeat" size={13} color={colors.textMuted} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

function Rows({ day, onToggle, onOpen }: { day: CalDay; onToggle: (e: CalEvent, next: boolean) => void; onOpen: (id: string) => void }) {
  return (
    <View>
      {day.events.map((e, i) => <EventRow key={`${e.id}-${e.kind}-${i}`} e={e} past={day.isPast} onToggle={onToggle} onOpen={onOpen} />)}
    </View>
  );
}

// ---- screen ---------------------------------------------------------------------------------------------------------

export default function CalendarScreen() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { today } = useToday();
  const { tasks, loading, error, retry, toggleComplete } = useTasks();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(today);
  const zone = getActiveZone();

  const month = useMemo(() => buildMonth(tasks, zone, today, offset), [tasks, zone, today, offset]);
  const week = useMemo(() => buildWeek(tasks, zone, today, offset), [tasks, zone, today, offset]);
  const model = view === 'month' ? month : week;

  // Moving to another month selects its first day (or today for the current month).
  useEffect(() => {
    if (view === 'month') setSelected(offset === 0 ? today : month.month);
  }, [offset, view, today, month.month]);

  const selectedDay = useMemo(() => month.weeks.flat().find((d) => d.date === selected), [month, selected]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t] as const)), [tasks]);

  const onToggle = useCallback(
    (e: CalEvent, next: boolean) => {
      const t: Task | undefined = byId.get(e.id);
      if (!t) return;
      void toggleComplete(t, next, e.recurring ? e.date : undefined).catch(() => toast.show('Could not save that. Try again.', { kind: 'error' }));
    },
    [byId, toggleComplete, toast],
  );
  const onOpen = useCallback((id: string) => router.push({ pathname: '/task/[id]', params: { id } }), [router]);

  const switchView = (v: 'month' | 'week') => {
    if (v === view) return;
    haptic.select();
    setView(v);
    setOffset(0);
  };
  const step = (n: number) => {
    haptic.select();
    setOffset((o) => o + n);
  };

  const header = (
    <Header
      title="Calendar"
      subtitle={model.title}
      left={<BackButton />}
      right={
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip size="sm" label="Month" selected={view === 'month'} onPress={() => switchView('month')} />
          <Chip size="sm" label="Week" selected={view === 'week'} onPress={() => switchView('week')} />
        </View>
      }
    />
  );

  if (loading) return <Screen header={header} tabs={false}><SkeletonList count={5} /></Screen>;
  if (error) return <Screen header={header} tabs={false}><ErrorState title="Could not load your calendar." onRetry={retry} /></Screen>;

  const nav = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={view === 'month' ? 'Previous month' : 'Previous week'} onPress={() => step(-1)}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}>
        <Icon name="chevronLeft" size={20} color={colors.text} />
      </Pressable>
      <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
        <Text variant="heading">{model.title}</Text>
        <Text variant="caption" tone="muted">
          {model.total ? `${model.total - model.done} to go, ${model.done} done` : 'Nothing planned'}
        </Text>
      </View>
      {offset !== 0 ? <Chip size="sm" tone="accent" label="Today" onPress={() => { haptic.select(); setOffset(0); }} /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={view === 'month' ? 'Next month' : 'Next week'} onPress={() => step(1)}
        style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}>
        <Icon name="chevronRight" size={20} color={colors.text} />
      </Pressable>
    </View>
  );

  const undated = model.undated > 0 ? (
    <Text variant="caption" tone="faint" align="center">{`+ ${model.undated} open ${model.undated === 1 ? 'task' : 'tasks'} with no date. Plan them from Today.`}</Text>
  ) : null;

  if (view === 'week') {
    return (
      <Screen header={header} tabs={false}>
        {nav}
        {week.days.map((d) => (
          <Card key={d.date} style={d.isToday ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: d.events.length ? 4 : 0 }}>
              <Text variant="heading" tone={d.isToday ? 'accent' : 'default'}>{dayTitle(d.date, today)}</Text>
              <View style={{ flex: 1 }} />
              {d.events.length ? <Text variant="caption" tone="muted">{`${d.events.filter((e) => e.done).length}/${d.events.length}`}</Text> : <Text variant="caption" tone="faint">Free</Text>}
            </View>
            {d.events.length ? <Rows day={d} onToggle={onToggle} onOpen={onOpen} /> : null}
          </Card>
        ))}
        {undated}
      </Screen>
    );
  }

  return (
    <Screen header={header} tabs={false}>
      {nav}
      <View>
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {LETTERS.map((l, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="label" tone={i >= 5 ? 'accent' : 'muted'}>{l}</Text>
            </View>
          ))}
        </View>
        {month.weeks.map((w, wi) => (
          <View key={wi} style={{ flexDirection: 'row' }}>
            {w.map((d) => <Cell key={d.date} day={d} selected={d.date === selected} onPress={(date) => { haptic.select(); setSelected(date); }} />)}
          </View>
        ))}
      </View>
      <Legend />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text variant="heading" style={{ flex: 1 }}>{dayTitle(selected, today)}</Text>
          <Button label="Add" icon="plus" size="sm" variant="secondary" onPress={() => router.push('/add')} />
        </View>
        {selectedDay && selectedDay.events.length ? (
          <Rows day={selectedDay} onToggle={onToggle} onOpen={onOpen} />
        ) : (
          <EmptyState pose="sleepy" title="Nothing planned." body="Free day. Add something, or tell the coach on WhatsApp." />
        )}
      </Card>
      {undated}
    </Screen>
  );
}
