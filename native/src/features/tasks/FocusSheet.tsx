/** Morning focus ritual: pick up to 3 tasks, lock them in (commitFocus), or skip. Route: /today/focus. */
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTasks } from '@/hooks/useTasks';
import { Button, CoachSticker, EmptyState, haptic, Icon, radius, SheetScaffold, Text, useTheme, useToast } from '@/ui';
import { fmtTime, parseScheduled } from './helpers';
import { useTodayTasks } from './useTodayTasks';

const MAX_FOCUS = 3;

export default function FocusSheet() {
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { commitFocus, skipFocus, setFocusDate } = useTasks();
  const { openToday, today } = useTodayTasks();
  const [picked, setPicked] = useState<string[]>(() => openToday.filter((t) => t.focusDate === today).map((t) => t.id).slice(0, MAX_FOCUS));
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) => {
    if (picked.includes(id)) {
      haptic.select();
      setPicked(picked.filter((x) => x !== id));
    } else if (picked.length >= MAX_FOCUS) {
      haptic.warning();
      toast.show(`${MAX_FOCUS} is the limit. That is the point.`, { kind: 'info' });
    } else {
      haptic.select();
      setPicked([...picked, id]);
    }
  };

  const lockIn = async () => {
    setBusy(true);
    try {
      await commitFocus(picked, today);
      haptic.success();
      router.back();
    } catch (e) {
      console.warn('[focus] commitFocus', e);
      try {
        // Fall back to just marking the tasks (the session record is a nicety).
        await Promise.all(picked.map((id) => setFocusDate(id, today)));
        void AsyncStorage.setItem('nudge.focusSkipped', today).catch(() => {});
        router.back();
      } catch {
        toast.show('Could not save your focus.', { kind: 'error' });
      }
    } finally {
      setBusy(false);
    }
  };
  const skip = async () => {
    setBusy(true);
    try {
      await skipFocus(today);
      router.back();
    } catch {
      void AsyncStorage.setItem('nudge.focusSkipped', today).catch(() => {});
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScaffold
      title="Today's focus"
      footer={
        <View style={{ gap: 4 }}>
          <Button label={picked.length ? `Lock in ${picked.length}` : 'Pick at least one'} variant="accent" size="lg" fullWidth disabled={picked.length === 0} loading={busy} onPress={lockIn} />
          <Button label="Skip for now" variant="ghost" onPress={skip} style={{ alignSelf: 'center' }} />
        </View>
      }
    >
      {openToday.length === 0 ? (
        <EmptyState pose="sleepy" title="Nothing to focus on." body="Add a task first." compact />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <CoachSticker pose="blowing" size={64} />
            <Text tone="muted" style={{ flex: 1 }}>Pick up to {MAX_FOCUS}. Those are the ones that count today.</Text>
          </View>
          {openToday.map((t) => {
            const on = picked.includes(t.id);
            const s = parseScheduled(t.deferredTo);
            return (
              <Pressable
                key={t.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(t.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderRadius: radius.lg, borderWidth: 2,
                  borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface,
                }}
              >
                <View
                  style={{
                    width: 30, height: 30, borderRadius: 15, borderWidth: 3, alignItems: 'center', justifyContent: 'center',
                    borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accent : 'transparent',
                  }}
                >
                  {on ? <Icon name="star" size={14} color={colors.onFill} filled /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" numberOfLines={2}>{t.text}</Text>
                  {s?.time && s.date === today ? <Text variant="caption" tone="muted">{fmtTime(s.time)}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </SheetScaffold>
  );
}
