// Fitness goals sheet: workouts per week, steps per day, target weight, who sees your fitness. Mirrors useFitness().setGoals.
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFitness } from '@/hooks/useFitness';
import { Button, Chip, haptic, SheetScaffold, Text, TextField, useToast } from '@/ui';

const parse = (s: string): number | undefined => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export default function Goals() {
  const router = useRouter();
  const toast = useToast();
  const { goals, setGoals } = useFitness();
  const [wpw, setWpw] = useState(goals?.workoutsPerWeek ? String(goals.workoutsPerWeek) : '');
  const [steps, setSteps] = useState(goals?.stepsPerDay ? String(goals.stepsPerDay) : '');
  const [weight, setWeight] = useState(goals?.targetWeightKg ? String(goals.targetWeightKg) : '');
  const [vis, setVis] = useState<'friends' | 'private'>(goals?.visibility ?? 'friends');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await setGoals({ workoutsPerWeek: parse(wpw), stepsPerDay: parse(steps), targetWeightKg: parse(weight), visibility: vis });
      haptic.success();
      toast.show('Goals saved.', { kind: 'success' });
      router.back();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not save that.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScaffold title="Fitness goals" footer={<Button label="Save goals" size="lg" fullWidth loading={busy} onPress={save} />}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 16 }}>
        <View style={{ gap: 8 }}>
          <TextField label="Workouts per week" value={wpw} onChangeText={setWpw} placeholder="4" keyboardType="number-pad" maxLength={2} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[2, 3, 4, 5, 6].map((n) => (
              <Chip key={n} label={String(n)} size="sm" tone="neutral" selected={wpw === String(n)} onPress={() => setWpw(String(n))} />
            ))}
          </View>
        </View>
        <TextField label="Steps per day" value={steps} onChangeText={setSteps} placeholder="8000" keyboardType="number-pad" maxLength={6} />
        <TextField label="Target weight (kg)" value={weight} onChangeText={setWeight} placeholder="70" keyboardType="decimal-pad" maxLength={6} />
        <View style={{ gap: 8 }}>
          <Text variant="label" tone="muted">Who sees your fitness</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Friends" icon="users" selected={vis === 'friends'} onPress={() => setVis('friends')} />
            <Chip label="Only me" icon="lock" selected={vis === 'private'} onPress={() => setVis('private')} />
          </View>
          <Text variant="caption" tone="faint">
            {vis === 'friends' ? 'Friends see your workouts and goals on the Friends tab.' : 'Nobody else sees your workouts or goals.'}
          </Text>
        </View>
      </ScrollView>
    </SheetScaffold>
  );
}
