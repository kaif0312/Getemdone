/** A friend's task, read-only: react and comment. Reached via /task/<friendTaskId> (e.g. from the Friends feed or a notification). */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import type { FriendTask } from '@/lib/types-extra';
import { Avatar, Chip, EmptyState, Icon, SheetScaffold, StrikeText, Text, useTheme } from '@/ui';
import { CommentComposer, CommentsThread, TaskReactions, type ReplyTarget } from './Comments';
import { fmtAgo, tagDisplay } from './helpers';

export default function FriendTaskView({ task, photoURL }: { task: FriendTask; photoURL?: string }) {
  const { colors } = useTheme();
  const [reply, setReply] = useState<ReplyTarget | null>(null);
  const raw = task.raw;

  if (task.hidden) {
    return (
      <SheetScaffold title={task.userName}>
        <EmptyState pose="sleepy" title="Private task." body="Only they can see this one." compact />
      </SheetScaffold>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SheetScaffold title={`${task.userName}'s task`} footer={<CommentComposer taskId={task.id} reply={reply} onClearReply={() => setReply(null)} />}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar name={task.userName} photoURL={photoURL} size={36} />
            <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{task.userName}</Text>
            <Text variant="caption" tone="faint">{task.completed && task.completedAt ? `Done ${fmtAgo(task.completedAt)} ago` : `Added ${fmtAgo(task.createdAt)} ago`}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ paddingTop: 5 }}>
              <View
                style={{
                  width: 32, height: 32, borderRadius: 16, borderWidth: 3, alignItems: 'center', justifyContent: 'center',
                  borderColor: task.completed ? colors.success : colors.border, backgroundColor: task.completed ? colors.success : 'transparent',
                }}
              >
                {task.completed ? <Icon name="check" size={18} color="#fff" strokeWidth={3.5} /> : null}
              </View>
            </View>
            <StrikeText variant="title" struck={task.completed} style={{ flex: 1, fontSize: 24, lineHeight: 30 }}>{task.text}</StrikeText>
          </View>

          {(task.tags?.length ?? 0) > 0 || task.committed || task.focusDate ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {task.focusDate ? <Chip label="Focus" icon="star" tone="accent" size="sm" /> : null}
              {task.committed ? <Chip label="Committed" size="sm" /> : null}
              {(task.tags ?? []).map((tg) => <Chip key={tg} emoji={tagDisplay(tg).emoji} label={tagDisplay(tg).label} size="sm" tone="neutral" />)}
            </View>
          ) : null}

          <View style={{ gap: 8 }}>
            <Text variant="label" tone="muted">React</Text>
            <TaskReactions taskId={task.id} reactions={raw?.reactions ?? task.reactions} canReact />
          </View>

          <View style={{ gap: 10 }}>
            <Text variant="label" tone="muted">Comments</Text>
            <CommentsThread taskId={task.id} comments={task.comments ?? []} onReply={setReply} />
          </View>
        </ScrollView>
      </SheetScaffold>
    </KeyboardAvoidingView>
  );
}
