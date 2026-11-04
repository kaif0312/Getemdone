// Log workout sheet: type chips, minutes / distance / sets, today or yesterday. Mirrors useFitness().logWorkout (source 'app').
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFitness } from '@/hooks/useFitness';
import { usePush } from '@/hooks/usePush';
import { useToday } from '@/hooks/useToday';
import { addDays } from '@/lib/dates';
import { Button, Chip, haptic, SheetScaffold, Text, TextField, useConfetti, useToast } from '@/ui';
import { WORKOUT_TYPES } from '@/features/fitness/workouts';

const num = (s: string): number | undefined => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export default function LogWorkout() {
  const router = useRouter();
  const toast = useToast();
  const confetti = useConfetti();
  const push = usePush();
  const { logWorkout, week } = useFitness();
  const { today } = useToday();
  const [typeId, setTypeId] = useState('run');
  const [custom, setCustom] = useState('');
  const [minutes, setMinutes] = useState('');
  const [distance, setDistance] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [yesterday, setYesterday] = useState(false);
  const [busy, setBusy] = useState(false);
  const type = WORKOUT_TYPES.find((t) => t.id === typeId) ?? WORKOUT_TYPES[0];
  const name = typeId === 'other' ? custom.trim() : type.label.toLowerCase();

  const save = async () => {
    if (!name) {
      toast.show('Name the workout.', { kind: 'error' });
      return;
    }
    setBusy(true);
    try {
      await logWorkout({
        type: name,
        minutes: num(minutes),
        distanceKm: type.distance ? num(distance) : undefined,
        sets: type.sets ? num(sets) : undefined,
        reps: type.sets ? num(reps) : undefined,
        date: yesterday ? addDays(today, -1) : undefined,
      });
      haptic.success();
      const goal = week.goal;
      const hitGoal = !yesterday && goal !== undefined && week.workouts + 1 === goal;
      if (hitGoal) confetti.fire();
      toast.show(hitGoal ? 'Weekly goal hit.' : 'Logged. Keep going.', { kind: 'success' });
      void push.askAfterFirstAction();
      router.back();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save that.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScaffold title="Log workout" footer={<Button label="Save workout" size="lg" fullWidth variant="accent" loading={busy} onPress={save} />}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 16 }}>
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">What did you do</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {WORKOUT_TYPES.map((t) => (
              <Chip key={t.id} label={t.label} emoji={t.emoji} selected={typeId === t.id} tone="accent" onPress={() => setTypeId(t.id)} />
            ))}
          </View>
        </View>
        {typeId === 'other' ? <TextField label="Name it" value={custom} onChangeText={setCustom} placeholder="Boxing, climbing, football" maxLength={60} /> : null}
        <View style={{ gap: 8 }}>
          <TextField label="Minutes" value={minutes} onChangeText={setMinutes} placeholder="30" keyboardType="number-pad" maxLength={4} />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {[15, 30, 45, 60, 90].map((m) => (
              <Chip key={m} label={`${m}`} size="sm" tone="neutral" selected={minutes === String(m)} onPress={() => setMinutes(String(m))} />
            ))}
          </View>
        </View>
        {type.distance ? <TextField label="Distance (km)" value={distance} onChangeText={setDistance} placeholder="5" keyboardType="decimal-pad" maxLength={6} /> : null}
        {type.sets ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <TextField label="Sets" value={sets} onChangeText={setSets} placeholder="4" keyboardType="number-pad" maxLength={3} />
            </View>
            <View style={{ flex: 1 }}>
              <TextField label="Reps" value={reps} onChangeText={setReps} placeholder="10" keyboardType="number-pad" maxLength={3} />
            </View>
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">When</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Today" selected={!yesterday} onPress={() => setYesterday(false)} />
            <Chip label="Yesterday" selected={yesterday} onPress={() => setYesterday(true)} />
          </View>
        </View>
      </ScrollView>
    </SheetScaffold>
  );
}
