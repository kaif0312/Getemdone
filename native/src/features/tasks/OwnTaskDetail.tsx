/** Task detail for YOUR task: edit everything the PWA can (text, notes, subtasks, dates, reminder, repeat, tags, photos, visibility, comments). */
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTasks } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import type { Recurrence, Subtask, Task, TaskVisibility } from '@/lib/types';
import {
  AnimatedCheckbox, Button, Chip, fonts, haptic, Icon, radius, SheetScaffold, StrikeText, Text, useConfetti, useTheme, useToast,
} from '@/ui';
import { Attachments } from './Attachments';
import { CommentComposer, CommentsThread, TaskReactions, type ReplyTarget } from './Comments';
import { DateTimeEditor } from './DateTimeEditor';
import { FieldGroup, FieldRow } from './FieldRow';
import { buildScheduled, fmtDay, fmtDayTime, fmtTime, fromTimestamp, parseScheduled, tagDisplay, toTimestamp } from './helpers';
import { TagPickerPanel } from './Pickers';
import { describeRecurrence, RecurrenceEditor } from './RecurrenceEditor';
import { VIS_META, VisibilityPicker, type VisValue } from './VisibilityPicker';

type Field = 'schedule' | 'deadline' | 'remind' | 'repeat' | 'tags' | 'vis' | null;

function SectionTitle({ children, right }: { children: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 28 }}>
      <Text variant="label" tone="muted" style={{ flex: 1 }}>{children}</Text>
      {right}
    </View>
  );
}

function Subtasks({ task }: { task: Task }) {
  const { colors } = useTheme();
  const { setSubtasks } = useTasks();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const subs = task.subtasks ?? [];
  const save = (next: Subtask[]) => void setSubtasks(task.id, next).catch((e) => toast.show(e instanceof Error ? e.message : 'Could not save.', { kind: 'error' }));
  const add = () => {
    const title = draft.trim();
    if (!title) return;
    save([...subs, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: title.slice(0, 200), completed: false }]);
    setDraft('');
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= subs.length) return;
    const next = [...subs];
    [next[i], next[j]] = [next[j], next[i]];
    haptic.select();
    save(next);
  };
  return (
    <View style={{ gap: 8 }}>
      <SectionTitle right={subs.length ? <Text variant="caption" tone="muted">{subs.filter((s) => s.completed).length}/{subs.length}</Text> : undefined}>Subtasks</SectionTitle>
      <View style={{ borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14 }}>
        {subs.map((s, i) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
            <AnimatedCheckbox size={24} checked={s.completed} onToggle={(next) => save(subs.map((x) => (x.id === s.id ? { ...x, completed: next } : x)))} accessibilityLabel={s.title} />
            <StrikeText variant="body" struck={s.completed} style={{ flex: 1 }}>{s.title}</StrikeText>
            {subs.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Move up" hitSlop={{ left: 6, right: 6 }} onPress={() => move(i, -1)} disabled={i === 0} style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.25 : 1 }}>
                <View style={{ transform: [{ rotate: '-90deg' }] }}><Icon name="chevronRight" size={18} color={colors.textFaint} /></View>
              </Pressable>
            ) : null}
            {subs.length > 1 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Move down" hitSlop={{ left: 6, right: 6 }} onPress={() => move(i, 1)} disabled={i === subs.length - 1} style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center', opacity: i === subs.length - 1 ? 0.25 : 1 }}>
                <View style={{ transform: [{ rotate: '90deg' }] }}><Icon name="chevronRight" size={18} color={colors.textFaint} /></View>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${s.title}`} hitSlop={{ left: 6, right: 6 }} onPress={() => save(subs.filter((x) => x.id !== s.id))} style={{ width: 32, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={16} color={colors.textFaint} />
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
          <Icon name="plus" size={22} color={colors.primary} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            blurOnSubmit={false}
            returnKeyType="done"
            placeholder="Add a subtask"
            placeholderTextColor={colors.textFaint}
            maxLength={200}
            accessibilityLabel="Add a subtask"
            style={{ flex: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 16, height: 48 }}
          />
          {draft.trim() ? <Button label="Add" size="sm" onPress={add} /> : null}
        </View>
      </View>
    </View>
  );
}

export default function OwnTaskDetail({ task }: { task: Task }) {
  const router = useRouter();
  const toast = useToast();
  const confetti = useConfetti();
  const { colors } = useTheme();
  const { today } = useToday();
  const t = useTasks();
  const [field, setField] = useState<Field>(null);
  const [title, setTitle] = useState(task.text);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const titleFocused = useRef(false);
  const notesFocused = useRef(false);

  // Follow remote changes while not typing.
  useEffect(() => {
    if (!titleFocused.current) setTitle(task.text);
  }, [task.text]);
  useEffect(() => {
    if (!notesFocused.current) setNotes(task.notes ?? '');
  }, [task.notes]);

  const sch = parseScheduled(task.deferredTo);
  const recurring = !!task.recurrence;
  const eventAt = task.dueDate ?? (sch?.time ? toTimestamp(sch.date, sch.time) : null);
  const vis: VisValue = { visibility: (task.visibility ?? (task.isPrivate ? 'private' : 'everyone')) as TaskVisibility, list: task.visibilityList ?? [] };
  const [visDraft, setVisDraft] = useState<VisValue>(vis);
  const tags = task.tags ?? [];
  const toggle = (f: Exclude<Field, null>) => setField((cur) => (cur === f ? null : f));
  const fail = (msg = 'Could not save that.') => toast.show(msg, { kind: 'error' });
  const doneToday = recurring ? !!task.recurrence?.completedDates?.includes(today) : task.completed;

  const saveTitle = () => {
    titleFocused.current = false;
    const v = title.trim();
    if (!v) return setTitle(task.text);
    if (v !== task.text) void t.updateText(task.id, v).catch((e) => fail(e instanceof Error ? e.message : undefined));
  };
  const saveNotes = () => {
    notesFocused.current = false;
    if (notes.trim() !== (task.notes ?? '').trim()) void t.setNotes(task.id, notes).catch(() => fail());
  };

  const remindLabel = task.remindAt ? fmtDayTime(task.remindAt, today) : 'None';
  const remindOptions = eventAt
    ? [
        { label: 'At the time', min: 0 },
        { label: '15 min before', min: 15 },
        { label: '1 hour before', min: 60 },
        { label: '1 day before', min: 1440 },
      ]
    : [];
  const currentOffset = task.remindAt && eventAt ? Math.round((eventAt - task.remindAt) / 60000) : null;

  const setReminder = async (at: number | null) => {
    if (at && at <= Date.now()) return fail('That time has passed. Pick a later one.');
    try {
      await t.setRemindAt(task.id, at, at ? (eventAt ?? at) : undefined);
      haptic.success();
    } catch {
      fail();
    }
  };

  const onSomeday = async () => {
    haptic.select();
    try {
      if (task.parkedAt) {
        await t.unparkTask(task);
        toast.show("On today's list.", { kind: 'success' });
      } else {
        await t.parkTask(task);
        toast.show('Parked. Find it under ⋯ Someday.', { kind: 'info' });
      }
      router.back();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not do that.');
    }
  };

  const onDelete = async () => {
    haptic.warning();
    try {
      await t.deleteTask(task.id);
      toast.show('Deleted. Restore it from the bin.', { kind: 'info' });
      router.back();
    } catch {
      fail('Could not delete it.');
    }
  };

  const onToggleDone = (next: boolean) => {
    void t.toggleComplete(task, next).catch(() => fail());
    if (next) confetti.fire();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetScaffold title="Task" footer={<CommentComposer taskId={task.id} reply={reply} onClearReply={() => setReply(null)} />}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 24 }}>
          {/* title */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
            <View style={{ paddingTop: 5 }}>
              <AnimatedCheckbox size={32} checked={doneToday} onToggle={onToggleDone} accessibilityLabel={doneToday ? 'Mark not done' : 'Mark done'} />
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onFocus={() => (titleFocused.current = true)}
              onBlur={saveTitle}
              multiline
              maxLength={500}
              blurOnSubmit
              returnKeyType="done"
              accessibilityLabel="Task text"
              style={{
                flex: 1, color: doneToday ? colors.textFaint : colors.text, fontFamily: fonts.black, fontSize: 24, lineHeight: 30, paddingTop: 2, paddingBottom: 2,
                textDecorationLine: doneToday ? 'line-through' : 'none',
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label="Today's focus" icon="star" selected={task.focusDate === today} tone="accent" onPress={() => void t.setFocusDate(task.id, task.focusDate === today ? null : today).catch(() => fail())} />
            <Chip label="Committed" selected={!!task.committed} tone="primary" onPress={() => void t.setCommitted(task.id, !task.committed).catch(() => fail())} />
          </View>

          <TaskReactions taskId={task.id} reactions={task.reactions} canReact={false} />

          {/* when */}
          <FieldGroup>
            {!recurring ? (
              <FieldRow
                icon="calendar" label="Scheduled" open={field === 'schedule'} onToggle={() => toggle('schedule')}
                value={sch ? `${fmtDay(sch.date, today)}${sch.time ? `, ${fmtTime(sch.time)}` : ''}` : 'Not set'}
                valueTone={sch ? 'primary' : 'muted'}
              >
                <DateTimeEditor
                  today={today} initialDate={sch?.date ?? null} initialTime={sch?.time ?? null} withTime minDate={today}
                  onSave={async (d, time) => {
                    try {
                      await t.deferTask(task, buildScheduled(d, time));
                      if (time) {
                        const at = toTimestamp(d, time);
                        if (at > Date.now()) await t.setRemindAt(task.id, at, at);
                      }
                      haptic.success();
                      setField(null);
                    } catch {
                      fail();
                    }
                  }}
                  onClear={sch ? () => void t.deferTask(task, null).then(() => setField(null)).catch(() => fail()) : undefined}
                />
              </FieldRow>
            ) : null}
            <FieldRow
              icon="flag" label="Deadline" open={field === 'deadline'} onToggle={() => toggle('deadline')}
              value={task.dueDate ? fmtDayTime(task.dueDate, today) : 'None'}
              valueTone={task.dueDate ? (task.dueDate < Date.now() && !task.completed ? 'danger' : 'primary') : 'muted'}
            >
              <DateTimeEditor
                today={today} withTime timeDefault="17:00"
                initialDate={task.dueDate ? fromTimestamp(task.dueDate).date : null}
                initialTime={task.dueDate ? fromTimestamp(task.dueDate).time : null}
                onSave={(d, time) => void t.setDueDate(task.id, toTimestamp(d, time ?? '23:59')).then(() => { haptic.success(); setField(null); }).catch(() => fail())}
                onClear={task.dueDate ? () => void t.setDueDate(task.id, null).then(() => setField(null)).catch(() => fail()) : undefined}
              />
            </FieldRow>
            <FieldRow icon="bell" label="Remind me" open={field === 'remind'} onToggle={() => toggle('remind')} value={remindLabel} valueTone={task.remindAt ? 'primary' : 'muted'}>
              <View style={{ gap: 12 }}>
                {remindOptions.length === 0 ? <Text variant="caption" tone="muted">Set a time or deadline for relative reminders, or pick an exact time.</Text> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Chip label="None" selected={!task.remindAt} onPress={() => void setReminder(null)} />
                  {remindOptions.map((o) => (
                    <Chip key={o.min} label={o.label} selected={currentOffset === o.min} onPress={() => eventAt && void setReminder(eventAt - o.min * 60000)} />
                  ))}
                </View>
                <Text variant="label" tone="faint">Or at an exact time</Text>
                <DateTimeEditor
                  today={today} requireTime minDate={today}
                  initialDate={task.remindAt ? fromTimestamp(task.remindAt).date : null}
                  initialTime={task.remindAt ? fromTimestamp(task.remindAt).time : null}
                  onSave={(d, time) => void setReminder(toTimestamp(d, time ?? '09:00')).then(() => setField(null))}
                />
              </View>
            </FieldRow>
            <FieldRow icon="repeat" label="Repeat" open={field === 'repeat'} onToggle={() => toggle('repeat')} value={describeRecurrence(task.recurrence)} valueTone={recurring ? 'primary' : 'muted'}>
              <RecurrenceEditor
                value={task.recurrence ?? null} today={today} onCancel={() => setField(null)}
                onSave={(r: Recurrence | null) => void t.setRecurrence(task.id, r).then(() => { haptic.success(); setField(null); }).catch(() => fail())}
              />
            </FieldRow>
            <FieldRow
              icon="tag" label="Tags" open={field === 'tags'} onToggle={() => toggle('tags')}
              value={tags.length ? tags.map((x) => tagDisplay(x).emoji).join(' ') : 'None'}
              valueTone={tags.length ? 'primary' : 'muted'}
            >
              <TagPickerPanel value={tags} onChange={(next) => void t.setTags(task.id, next).catch((e) => fail(e instanceof Error ? e.message : undefined))} />
            </FieldRow>
            <FieldRow
              icon={VIS_META[vis.visibility].icon} label="Who sees it" open={field === 'vis'} last
              onToggle={() => { setVisDraft(vis); toggle('vis'); }}
              value={VIS_META[vis.visibility].label + (vis.list.length && vis.visibility !== 'everyone' && vis.visibility !== 'private' ? ` (${vis.list.length})` : '')}
            >
              <View style={{ gap: 12 }}>
                <VisibilityPicker value={visDraft} onChange={setVisDraft} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button label="Save" size="sm" icon="check" onPress={() => void t.setVisibility(task.id, visDraft.visibility, visDraft.list).then(() => { haptic.success(); setField(null); }).catch(() => fail())} />
                  <Button label="Cancel" size="sm" variant="ghost" onPress={() => setField(null)} />
                </View>
              </View>
            </FieldRow>
          </FieldGroup>

          <Subtasks task={task} />

          <View style={{ gap: 8 }}>
            <SectionTitle>Notes</SectionTitle>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              onFocus={() => (notesFocused.current = true)}
              onBlur={saveNotes}
              multiline
              placeholder="Private notes. Only you see these."
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="Notes"
              style={{
                minHeight: 88, padding: 14, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text,
                fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, textAlignVertical: 'top',
              }}
            />
          </View>

          <View style={{ gap: 8 }}>
            <SectionTitle right={<Text variant="caption" tone="faint">{(task.attachments?.length ?? 0)}/3</Text>}>Photos</SectionTitle>
            <Attachments taskId={task.id} items={task.attachments ?? []} />
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle>Comments</SectionTitle>
            <CommentsThread taskId={task.id} comments={task.comments ?? []} onReply={setReply} />
          </View>

          {task.parkedAt ? (
            <Button label="Do it today" icon="arrowRight" onPress={onSomeday} style={{ alignSelf: 'center' }} />
          ) : !task.recurrence && !task.completed ? (
            <Button label="Move to Someday" variant="secondary" icon="archive" onPress={onSomeday} style={{ alignSelf: 'center' }} />
          ) : null}
          <Button label="Delete task" variant="ghost" icon="trash" onPress={onDelete} style={{ alignSelf: 'center' }} />
        </ScrollView>
      </SheetScaffold>
    </KeyboardAvoidingView>
  );
}
