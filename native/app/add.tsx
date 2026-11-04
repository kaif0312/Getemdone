// PLACEHOLDER: wave 2 (Today) replaces this file wholesale. It is registered as a form sheet in app/_layout.tsx.
// Minimal but wired end to end so the foundation can be tried: one text field -> useTasks().addTask.
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { usePush } from '@/hooks/usePush';
import { useTasks } from '@/hooks/useTasks';
import { Button, SheetScaffold, TextField, useToast } from '@/ui';

export default function Add() {
  const router = useRouter();
  const toast = useToast();
  const { addTask } = useTasks();
  const push = usePush();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addTask({ text });
      void push.askAfterFirstAction(); // polite: after a first meaningful action, once
      router.back();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not add that.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScaffold title="Add task" footer={<Button label="Add" fullWidth size="lg" loading={busy} disabled={!text.trim()} onPress={save} />}>
      <TextField value={text} onChangeText={setText} placeholder="What needs doing?" autoFocus returnKeyType="done" onSubmitEditing={save} />
    </SheetScaffold>
  );
}
