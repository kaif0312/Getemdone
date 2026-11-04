/** The Today tab: header, focus ritual, schedule strip, sections, done, coach states. Route: app/(tabs)/today.tsx. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useNotificationsInbox } from '@/hooks/useNotificationsInbox';
import { useAuth } from '@/hooks/useAuth';
import { useStreak } from '@/hooks/useStreak';
import { useTasks } from '@/hooks/useTasks';
import { addDays } from '@/lib/dates';
import type { Task } from '@/lib/types';
import {
  Button, Card, CoachSticker, EmptyState, ErrorState, haptic, Icon, ProgressRing, radius, Screen, SkeletonList, StreakBadge, Text,
  useConfetti, useReduceMotion, useTheme, useToast, Header,
} from '@/ui';
import { clearedLine, leftLine, openCoachWhatsApp } from './copy';
import { fmtHeaderDate, fmtTime, parseScheduled } from './helpers';
import { TaskRow } from './TaskRow';
import { useTodayTasks } from './useTodayTasks';

function SectionHeader({ title, count, extra, collapsed, onToggle }: { title: string; count: number; extra?: React.ReactNode; collapsed?: boolean; onToggle?: () => void }) {
  const { colors } = useTheme();
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 }}>
      <Text variant="label" tone="muted">{title}</Text>
      <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="caption" tone="muted" style={{ fontSize: 12, lineHeight: 16 }}>{count}</Text>
      </View>
      <View style={{ flex: 1 }} />
      {extra}
      {onToggle ? <View style={{ transform: [{ rotate: collapsed ? '-90deg' : '0deg' }] }}><Icon name="chevronDown" size={18} color={colors.textMuted} /></View> : null}
    </View>
  );
  if (!onToggle) return inner;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${collapsed ? 'collapsed' : 'expanded'}`} onPress={() => { haptic.select(); onToggle(); }}>
      {inner}
    </Pressable>
  );
}

const SKIP_KEY = 'nudge.focusSkipped';

export default function TodayScreen() {
  const router = useRouter();
  const toast = useToast();
  const confetti = useConfetti();
  const reduce = useReduceMotion();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { unread } = useNotificationsInbox();
  const { current } = useStreak();
  const { toggleComplete, deferTask, deleteTask, skipFocus } = useTasks();
  const m = useTodayTasks();
  const { today } = m;

  const [doneOpen, setDoneOpen] = useState(true);
  const [animateRows, setAnimateRows] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [skippedLocal, setSkippedLocal] = useState(false);
  const [clearedShown, setClearedShown] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(SKIP_KEY).then((v) => v === today && setSkippedLocal(true)).catch(() => {});
  }, [today]);

  // Rows animate in only after the first real paint.
  useEffect(() => {
    if (!m.loading) {
      const id = setTimeout(() => setAnimateRows(true), 350);
      return () => clearTimeout(id);
    }
  }, [m.loading]);

  const left = m.openToday.length;
  const doneCount = m.done.length;
  const total = left + doneCount;
  const line = leftLine(left, doneCount, today);

  const onToggle = useCallback(
    (task: Task, next: boolean) => {
      const wasLast = next && !task.completed && m.openToday.length === 1 && m.openToday[0].id === task.id;
      void toggleComplete(task, next).catch(() => toast.show('Could not save that. Try again.', { kind: 'error' }));
      if (wasLast) {
        setClearedShown(true);
        confetti.fire();
        haptic.success();
      }
    },
    [m.openToday, toggleComplete, toast, confetti],
  );

  // The cleared card goes away as soon as something is open again.
  const prevLeft = useRef(left);
  useEffect(() => {
    if (left > 0 && prevLeft.current === 0) setClearedShown(false);
    prevLeft.current = left;
  }, [left]);

  const onOpen = useCallback((t: Task) => router.push({ pathname: '/task/[id]', params: { id: t.id } }), [router]);
  const onTomorrow = useCallback(
    (t: Task) => {
      void deferTask(t, addDays(today, 1)).then(() => toast.show('Moved to tomorrow.', { kind: 'info' })).catch(() => toast.show('Could not move it.', { kind: 'error' }));
    },
    [deferTask, today, toast],
  );
  const onDelete = useCallback(
    (t: Task) => {
      void deleteTask(t.id).then(() => toast.show('Deleted. Restore it from the bin.', { kind: 'info' })).catch(() => toast.show('Could not delete it.', { kind: 'error' }));
    },
    [deleteTask, toast],
  );
  const moveAllRolled = useCallback(
    async (tasks: Task[]) => {
      haptic.medium();
      try {
        await Promise.all(tasks.map((t) => deferTask(t, addDays(today, 1))));
        toast.show(`${tasks.length} moved to tomorrow.`, { kind: 'info' });
      } catch {
        toast.show('Could not move them.', { kind: 'error' });
      }
    },
    [deferTask, today, toast],
  );

  // ---- header -------------------------------------------------------------------------------------------------------
  const header = (
    <Header
      title="Today"
      subtitle={fmtHeaderDate(today)}
      unread={unread}
      onBellPress={() => router.push('/inbox')}
      right={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${current} day streak. Open progress`}
            onPress={() => router.navigate('/progress')}
            style={{ height: 40, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.accentSoft, justifyContent: 'center' }}
          >
            <StreakBadge count={current} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More"
            onPress={() => {
              haptic.select();
              router.push('/today/more');
            }}
            style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}
          >
            <Icon name="more" size={20} color={colors.text} />
          </Pressable>
        </View>
      }
    />
  );

  // ---- states -------------------------------------------------------------------------------------------------------
  if (m.loading) {
    return (
      <Screen header={header}>
        <SkeletonList count={5} />
      </Screen>
    );
  }
  if (m.error) {
    return (
      <Screen header={header}>
        <ErrorState title="Could not load your tasks." onRetry={m.retry} />
      </Screen>
    );
  }
  if (m.visible.length === 0) {
    return (
      <Screen header={header}>
        <EmptyState pose="sleepy" title="Nothing on your list." body="Add one here, or just tell the coach on WhatsApp." />
        <View style={{ alignItems: 'center', gap: 12 }}>
          <Button label="Add a task" icon="plus" variant="accent" style={{ alignSelf: 'center' }} onPress={() => router.push('/add')} />
          <Button label="Tell the coach on WhatsApp" variant="secondary" style={{ alignSelf: 'center' }} onPress={openCoachWhatsApp} />
        </View>
      </Screen>
    );
  }

  // ---- ritual / recap prompts ---------------------------------------------------------------------------------------
  // Done = a session was written, or skipped on this phone, or Focus tasks already exist for today (set by the fallback write or the bot).
  const ritualDone = profile?.lastFocusSessionDate === today || skippedLocal || m.visible.some((t) => t.focusDate === today);
  const showRitual = !ritualDone && m.hour < 14 && m.openToday.length > 0;
  const showRecap = m.hour >= 18 && total > 0;
  const focusTasks = m.sections.find((s) => s.key === 'focus')?.tasks ?? [];
  const focusDone = m.done.filter((t) => t.focusDate === today).length;

  const doSkip = async () => {
    setSkipping(true);
    try {
      await skipFocus(today);
    } catch (e) {
      // Never block the day on the session write (e.g. rules not deployed): remember the skip on this device.
      console.warn('[today] skipFocus', e);
    }
    void AsyncStorage.setItem(SKIP_KEY, today).catch(() => {});
    setSkippedLocal(true);
    setSkipping(false);
  };

  const open = m.sections.filter((s) => s.key !== 'done');
  const doneSection = m.sections.find((s) => s.key === 'done');

  return (
    <Screen header={header} gap={14}>
      {/* progress hero */}
      <Animated.View entering={reduce ? undefined : FadeIn.duration(260)}>
        <Card padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <ProgressRing progress={total ? doneCount / total : 0} size={72} stroke={9}>
              <Text variant="subheading">{doneCount}/{total}</Text>
            </ProgressRing>
            <View style={{ flex: 1 }}>
              <Text variant="title">{line.big}</Text>
              <Text tone="muted">{line.small}</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      {clearedShown && left === 0 ? (
        <Animated.View entering={reduce ? undefined : FadeInDown.duration(300)}>
          <Card tone="success" padding={12}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <CoachSticker pose="cheer" size={84} animated />
              <Text variant="subheading" style={{ flex: 1 }}>{clearedLine(today)}</Text>
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {showRitual ? (
        <Card tone="sun" padding={14}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <CoachSticker pose="blowing" size={76} animated />
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="subheading">Pick your focus.</Text>
              <Text variant="caption" tone="muted">Up to 3 things that matter today. The rest can wait.</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <Button label="Pick focus" variant="accent" size="sm" icon="star" onPress={() => router.push('/today/focus')} />
            <Button label="Skip" variant="ghost" size="sm" loading={skipping} onPress={doSkip} />
          </View>
        </Card>
      ) : null}

      {showRecap && !showRitual ? (
        <Card tone="primary" padding={12} onPress={() => router.push('/today/recap')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <CoachSticker pose="clipboard" size={56} />
            <View style={{ flex: 1 }}>
              <Text variant="subheading">Wrap up the day.</Text>
              <Text variant="caption" tone="muted">See how you did and roll the rest.</Text>
            </View>
            <Icon name="chevronRight" size={20} color={colors.primary} />
          </View>
        </Card>
      ) : null}

      {/* schedule strip */}
      {m.schedule.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">Schedule</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 20 }} style={{ marginHorizontal: -20, paddingHorizontal: 20, flexGrow: 0 }}>
            {m.schedule.map((t, i) => {
              const s = parseScheduled(t.deferredTo)!;
              const next = !t.completed && m.schedule.findIndex((x) => !x.completed) === i;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  onPress={() => onOpen(t)}
                  style={{
                    width: 150, padding: 12, borderRadius: radius.lg, borderWidth: 2, gap: 2,
                    borderColor: next ? colors.primary : colors.border, backgroundColor: next ? colors.primarySoft : colors.surface, opacity: t.completed ? 0.55 : 1,
                  }}
                >
                  <Text variant="label" tone={next ? 'primary' : 'muted'}>{next ? 'Next' : fmtTime(s.time!)}</Text>
                  {next ? <Text variant="bodyStrong" tone="primary">{fmtTime(s.time!)}</Text> : null}
                  <Text variant="caption" numberOfLines={2} style={t.completed ? { textDecorationLine: 'line-through' } : undefined}>{t.text}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* sections */}
      {open.map((sec) => (
        <View key={sec.key} style={{ gap: 10 }}>
          <SectionHeader
            title={sec.title}
            count={sec.tasks.length}
            extra={
              sec.key === 'focus' ? (
                <Text variant="caption" tone="accent">{focusDone}/{focusTasks.length + focusDone} done</Text>
              ) : sec.key === 'rolled' ? (
                <Pressable accessibilityRole="button" onPress={() => moveAllRolled(sec.tasks)} hitSlop={10}>
                  <Text variant="caption" tone="primary">Move all to tomorrow</Text>
                </Pressable>
              ) : null
            }
          />
          {sec.key === 'rolled' ? (
            <Text variant="caption" tone="muted" style={{ marginTop: -4 }}>From earlier days. Finish them or let them go.</Text>
          ) : null}
          {sec.tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              today={today}
              animate={animateRows}
              showRolled={sec.key === 'rolled' || sec.key === 'overdue'}
              dim={sec.key === 'upcoming'}
              onToggle={onToggle}
              onOpen={onOpen}
              onTomorrow={onTomorrow}
              onDelete={onDelete}
            />
          ))}
        </View>
      ))}

      {doneSection ? (
        <View style={{ gap: 10 }}>
          <SectionHeader title="Done" count={doneSection.tasks.length} collapsed={!doneOpen} onToggle={() => setDoneOpen((v) => !v)} />
          {doneOpen
            ? doneSection.tasks.map((t) => (
                <TaskRow key={t.id} task={t} today={today} animate={animateRows} onToggle={onToggle} onOpen={onOpen} onTomorrow={onTomorrow} onDelete={onDelete} />
              ))
            : null}
        </View>
      ) : null}

      {left > 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 4 }}>
          <Pressable accessibilityRole="link" onPress={openCoachWhatsApp} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="caption" tone="faint">Faster on WhatsApp. Tell the coach.</Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  );
}
