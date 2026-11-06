/** Route /task/<id>: your task (editable) or a friend's task (read-only + react/comment). */
import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useFriends } from '@/hooks/useFriends';
import { useTasks } from '@/hooks/useTasks';
import { EmptyState, SheetScaffold, SkeletonList } from '@/ui';
import FriendTaskView from './FriendTaskView';
import OwnTaskDetail from './OwnTaskDetail';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tasks, loading } = useTasks();
  const { friendTasks, friends, tasksLoading } = useFriends();

  const own = tasks.find((t) => t.id === id);
  if (own) return <OwnTaskDetail task={own} />;
  const theirs = friendTasks.find((t) => t.id === id);
  if (theirs) return <FriendTaskView task={theirs} photoURL={friends.find((f) => f.id === theirs.userId)?.photoURL} />;

  return (
    <SheetScaffold title="Task">
      {loading || tasksLoading ? <SkeletonList count={3} /> : <EmptyState pose="sleepy" title="Task not found." body="It may have been deleted." compact />}
    </SheetScaffold>
  );
}
