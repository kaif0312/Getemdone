// PLACEHOLDER: wave 2 (Today) replaces this file wholesale (task detail sheet). Route: /task/<taskId>.
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useTasks } from '@/hooks/useTasks';
import { EmptyState, SheetScaffold, Text } from '@/ui';

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks } = useTasks();
  const task = tasks.find((t) => t.id === id);
  return (
    <SheetScaffold title="Task">
      {task ? <Text variant="heading">{task.text}</Text> : <EmptyState pose="sleepy" title="Task not found." compact />}
    </SheetScaffold>
  );
}
