/**
 * Add sheet (route /add, formSheet). One field; several lines or ';' make several tasks. Chips: Today / Tomorrow / Pick date,
 * time, tag, visibility. The keyboard is up immediately, submit closes the sheet and the rows animate in on Today.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { usePush } from '@/hooks/usePush';
import { useTasks, type NewTaskInput } from '@/hooks/useTasks';
import { useToday } from '@/hooks/useToday';
import { addDays } from '@/lib/dates';
import type { TaskVisibility } from '@/lib/types';
import { Button, Chip, fonts, haptic, radius, SheetScaffold, Text, TextField, useTheme, useToast } from '@/ui';
import { buildScheduled, defaultTime, fmtDay, fmtTime, parseTaskLines, tagDisplay, toTimestamp } from './helpers';
import { DatePickerPanel, TagPickerPanel, TimePickerPanel } from './Pickers';
import { VIS_META, VisibilityPicker, type VisValue } from './VisibilityPicker';

type Panel = 'date' | 'time' | 'tag' | 'vis' | null;

export default function AddSheet() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { addTasks } = useTasks();
  const push = usePush();
  const { today } = useToday();
  const tomorrow = addDays(today, 1);

  const [text, setText] = useState('');
  const [date, setDate] = useState<string>(today);
  const [time, setTime] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [vis, setVis] = useState<VisValue | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const inputRef = useRef<TextInput>(null);

  const lines = useMemo(() => parseTaskLines(text), [text]);
  const effVis: VisValue = vis ?? { visibility: (profile?.defaultVisibility ?? 'everyone') as TaskVisibility, list: profile?.defaultVisibilityList ?? [] };
  const customDate = date !== today && date !== tomorrow;

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));

  const submit = () => {
    if (lines.length === 0) return;
    const scheduledFor = date === today && !time ? null : buildScheduled(date, time);
    const at = time ? toTimestamp(date, time) : null;
    const remindAt = at && at > Date.now() ? at : null;
    const inputs: NewTaskInput[] = lines.map((t) => ({
      text: t,
      scheduledFor,
      remindAt,
      tags: tags.length ? tags : undefined,
      ...(vis ? { visibility: vis.visibility, visibilityList: vis.list } : {}),
    }));
    haptic.success();
    void addTasks(inputs)
      .then(() => push.askAfterFirstAction())
      .catch((e) => toast.show(e instanceof Error ? e.message : 'Could not add that.', { kind: 'error' }));
    router.back();
  };

  const vm = VIS_META[effVis.visibility];

  return (
    <SheetScaffold
      title="New task"
      footer={<Button label={lines.length > 1 ? `Add ${lines.length} tasks` : 'Add'} size="lg" fullWidth icon="plus" disabled={lines.length === 0} onPress={submit} />}
    >
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
        <TextField
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder="What needs doing?"
          autoFocus
          multiline
          maxLength={2000}
          returnKeyType="default"
          style={{ minHeight: 88, fontFamily: fonts.extrabold, fontSize: 19 }}
          hint={lines.length > 1 ? `${lines.length} tasks. One per line or split with ;` : 'New line or ; makes another task.'}
        />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Today" icon="today" selected={date === today} onPress={() => { setDate(today); setPanel(null); }} />
          <Chip label="Tomorrow" icon="arrowRight" selected={date === tomorrow} onPress={() => { setDate(tomorrow); setPanel(null); }} />
          <Chip label={customDate ? fmtDay(date, today) : 'Pick date'} icon="calendar" selected={customDate || panel === 'date'} onPress={() => toggle('date')} />
          <Chip label={time ? fmtTime(time) : 'Time'} icon="clock" selected={!!time || panel === 'time'} onPress={() => { if (!time) setTime(defaultTime()); toggle('time'); }} />
          <Chip
            label={tags.length ? tags.map((t) => tagDisplay(t).emoji).join(' ') : 'Tag'}
            icon={tags.length ? undefined : 'tag'}
            selected={tags.length > 0 || panel === 'tag'}
           
            onPress={() => toggle('tag')}
          />
          <Chip label={vm.short} icon={effVis.visibility === 'private' ? 'lock' : effVis.visibility === 'everyone' ? 'eye' : 'users'} selected={panel === 'vis' || !!vis} onPress={() => toggle('vis')} />
        </View>

        {panel === 'date' ? (
          <View style={{ padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}>
            <DatePickerPanel value={date} today={today} minDate={today} onChange={(d) => { setDate(d); setPanel(null); }} />
          </View>
        ) : null}
        {panel === 'time' && time ? (
          <View style={{ padding: 12, gap: 8, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}>
            <TimePickerPanel value={time} onChange={setTime} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Done" size="sm" onPress={() => setPanel(null)} />
              <Button label="No time" size="sm" variant="ghost" onPress={() => { setTime(null); setPanel(null); }} />
            </View>
            <Text variant="caption" tone="faint">We will remind you at this time.</Text>
          </View>
        ) : null}
        {panel === 'tag' ? (
          <View style={{ padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}>
            <TagPickerPanel value={tags} onChange={setTags} />
          </View>
        ) : null}
        {panel === 'vis' ? (
          <View style={{ padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}>
            <VisibilityPicker value={effVis} onChange={setVis} />
          </View>
        ) : null}
      </ScrollView>
    </SheetScaffold>
  );
}
