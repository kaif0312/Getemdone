// Quick entry for weight / steps / sleep / water. Mirrors useFitness().logMetric.
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFitness } from '@/hooks/useFitness';
import { useToday } from '@/hooks/useToday';
import { addDays } from '@/lib/dates';
import { Button, Chip, haptic, SheetScaffold, Text, TextField, useToast } from '@/ui';
import { formatMetric, metricDef, METRICS } from '@/features/fitness/workouts';

export default function LogMetric() {
  const params = useLocalSearchParams<{ metric?: string }>();
  const router = useRouter();
  const toast = useToast();
  const { logMetric, dayMap } = useFitness();
  const { today } = useToday();
  const [key, setKey] = useState(metricDef(params.metric).key);
  const def = metricDef(key);
  const [text, setText] = useState('');
  const [yesterday, setYesterday] = useState(false);
  const [busy, setBusy] = useState(false);
  const last = useMemo(() => {
    for (let i = 0; i < 60; i++) {
      const v = dayMap[addDays(today, -i)]?.[def.key];
      if (typeof v === 'number') return v;
    }
    return null;
  }, [dayMap, today, def.key]);

  const value = parseFloat(text.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0;
  const bump = (dir: 1 | -1) => {
    haptic.select();
    const base = valid ? value : last ?? 0;
    const next = Math.max(0, Math.round((base + dir * def.step) * 100) / 100);
    setText(String(next));
  };

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await logMetric(def.key, value, yesterday ? addDays(today, -1) : undefined);
      haptic.success();
      toast.show(`${def.label} saved.`, { kind: 'success' });
      router.back();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save that.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScaffold title="Log a number" footer={<Button label="Save" size="lg" fullWidth loading={busy} disabled={!valid} onPress={save} />}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {METRICS.map((m) => (
            <Chip
              key={m.key}
              label={m.label}
              emoji={m.emoji}
              selected={key === m.key}
              onPress={() => {
                setKey(m.key);
                setText('');
              }}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={`${def.label}${def.unit ? ` (${def.unit})` : ''}`}
              value={text}
              onChangeText={setText}
              placeholder={def.placeholder}
              keyboardType="decimal-pad"
              maxLength={7}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </View>
          <Button label="-" variant="secondary" size="md" onPress={() => bump(-1)} accessibilityLabel="Less" />
          <Button label="+" variant="secondary" size="md" onPress={() => bump(1)} accessibilityLabel="More" />
        </View>
        {last !== null ? <Text variant="caption" tone="muted">Last: {formatMetric(def, last)}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Today" selected={!yesterday} onPress={() => setYesterday(false)} />
          <Chip label="Yesterday" selected={yesterday} onPress={() => setYesterday(true)} />
        </View>
      </ScrollView>
    </SheetScaffold>
  );
}
