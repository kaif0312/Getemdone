/** One task row on Today: checkbox, title, meta chips; swipe right = done, swipe left = Tomorrow / Delete. */
import React, { memo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import type { Task } from '@/lib/types';
import { AnimatedCheckbox, Icon, StrikeText, SwipeRow, Text, useReduceMotion, useTheme, radius } from '@/ui';
import { daysRolled, fmtDayTime, fmtDay, fmtTime, parseScheduled, tagDisplay } from './helpers';
import { VisIcon } from './VisibilityPicker';

export interface TaskRowProps {
  task: Task;
  today: string;
  /** Row animates in (only after the first paint, so the initial list does not all fly in). */
  animate?: boolean;
  onToggle: (task: Task, next: boolean) => void;
  onOpen: (task: Task) => void;
  onTomorrow: (task: Task) => void;
  onDelete: (task: Task) => void;
  /** Rolled-over rows show how many days they have been rolling. */
  showRolled?: boolean;
  dim?: boolean;
}

function MetaPill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'danger' | 'accent' | 'primary' }) {
  const { colors } = useTheme();
  const bg = { neutral: colors.surfaceAlt, danger: colors.dangerSoft, accent: colors.accentSoft, primary: colors.primarySoft }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: bg }}>
      {children}
    </View>
  );
}

function TaskRowImpl({ task, today, animate, onToggle, onOpen, onTomorrow, onDelete, showRolled, dim }: TaskRowProps) {
  const { colors } = useTheme();
  const reduce = useReduceMotion();
  const sch = parseScheduled(task.deferredTo);
  const recurring = !!task.recurrence;
  const done = task.completed;
  const now = Date.now();
  const overdue = !done && !!task.dueDate && task.dueDate < now;
  const subs = task.subtasks ?? [];
  const subsDone = subs.filter((s) => s.completed).length;
  const comments = task.comments?.length ?? 0;
  const vis = task.visibility ?? (task.isPrivate ? 'private' : 'everyone');
  const rolled = showRolled ? daysRolled(task, today) : 0;
  const tags = (task.tags ?? []).slice(0, 3);
  const isFocus = task.focusDate === today && !done;

  const metaStyle = { fontSize: 12, lineHeight: 16 } as const;
  const pills: React.ReactNode[] = [];
  if (sch?.time && sch.date === today) {
    pills.push(
      <MetaPill key="t" tone="primary">
        <Icon name="clock" size={12} color={colors.primary} />
        <Text variant="caption" tone="primary" style={metaStyle}>{fmtTime(sch.time)}</Text>
      </MetaPill>,
    );
  } else if (sch && sch.date !== today) {
    pills.push(
      <MetaPill key="s" tone="primary">
        <Icon name="calendar" size={12} color={colors.primary} />
        <Text variant="caption" tone="primary" style={metaStyle}>{fmtDay(sch.date, today)}{sch.time ? `, ${fmtTime(sch.time)}` : ''}</Text>
      </MetaPill>,
    );
  }
  if (task.dueDate) {
    pills.push(
      <MetaPill key="d" tone={overdue ? 'danger' : 'neutral'}>
        <Icon name="flag" size={12} color={overdue ? colors.danger : colors.textMuted} />
        <Text variant="caption" tone={overdue ? 'danger' : 'muted'} style={metaStyle}>{fmtDayTime(task.dueDate, today)}</Text>
      </MetaPill>,
    );
  }
  if (rolled > 0 && !done) {
    pills.push(
      <MetaPill key="r" tone="accent">
        <Icon name="arrowRight" size={12} color={colors.accent} />
        <Text variant="caption" tone="accent" style={metaStyle}>{rolled === 1 ? 'since yesterday' : `${rolled} days`}</Text>
      </MetaPill>,
    );
  }
  if (recurring) pills.push(<MetaPill key="rep"><Icon name="repeat" size={12} color={colors.textMuted} /></MetaPill>);
  if (subs.length > 0) {
    pills.push(
      <MetaPill key="sub">
        <Icon name="list" size={12} color={colors.textMuted} />
        <Text variant="caption" tone="muted" style={metaStyle}>{subsDone}/{subs.length}</Text>
      </MetaPill>,
    );
  }
  if (comments > 0) {
    pills.push(
      <MetaPill key="c">
        <Icon name="message" size={12} color={colors.textMuted} />
        <Text variant="caption" tone="muted" style={metaStyle}>{comments}</Text>
      </MetaPill>,
    );
  }
  if ((task.attachments?.length ?? 0) > 0) {
    pills.push(
      <MetaPill key="a">
        <Icon name="paperclip" size={12} color={colors.textMuted} />
        <Text variant="caption" tone="muted" style={metaStyle}>{task.attachments!.length}</Text>
      </MetaPill>,
    );
  }
  if (task.notes) pills.push(<MetaPill key="n"><Icon name="note" size={12} color={colors.textMuted} /></MetaPill>);
  for (const t of tags) {
    pills.push(
      <MetaPill key={`g${t}`}>
        <Text style={{ fontSize: 12, lineHeight: 16 }}>{tagDisplay(t).emoji}</Text>
      </MetaPill>,
    );
  }

  return (
    <Animated.View
      entering={animate && !reduce ? FadeInDown.duration(240) : undefined}
      layout={reduce ? undefined : LinearTransition.duration(220)}
      style={{ opacity: dim ? 0.7 : 1 }}
    >
      <SwipeRow
        onSwipeRight={() => onToggle(task, !done)}
        rightLabel={done ? 'Undo' : 'Done'}
        actions={[
          { key: 'tomorrow', label: 'Tomorrow', icon: 'arrowRight', tone: 'sun', onPress: () => onTomorrow(task) },
          { key: 'delete', label: 'Delete', icon: 'trash', tone: 'danger', onPress: () => onDelete(task) },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${task.text}. Open details`}
          onPress={() => onOpen(task)}
          style={{
            flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, minHeight: 64, borderRadius: radius.lg, borderWidth: 2,
            borderColor: isFocus ? colors.accent : colors.border, backgroundColor: isFocus ? colors.accentSoft : colors.surface,
          }}
        >
          <View style={{ paddingTop: 1 }}>
            <AnimatedCheckbox checked={done} onToggle={(next) => onToggle(task, next)} accessibilityLabel={done ? 'Mark not done' : 'Mark done'} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <StrikeText variant="bodyStrong" struck={done} numberOfLines={3}>{task.text}</StrikeText>
            {pills.length > 0 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{pills}</View> : null}
          </View>
          <View style={{ alignItems: 'center', gap: 6, paddingTop: 2 }}>
            {task.committed && !done ? <Icon name="sparkle" size={16} color={colors.sunEdge} /> : null}
            {vis !== 'everyone' ? <VisIcon v={vis} size={15} color={colors.textFaint} /> : null}
          </View>
        </Pressable>
      </SwipeRow>
    </Animated.View>
  );
}

export const TaskRow = memo(TaskRowImpl);
