import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useFriends } from '@/hooks/useFriends';
import { useTaskSocial } from '@/hooks/useTaskSocial';
import { useTasks } from '@/hooks/useTasks';
import type { Comment } from '@/lib/types';
import { groupReactions, timeAgo } from '@/features/friends/logic';
import { openCommentMenu } from '@/features/safety/commentMenu';
import { SAFETY_LINE } from '@/lib/safetyApi';
import { Avatar, CoachSticker, haptic, Icon, SheetScaffold, Text, useToast, useTheme, fonts, radius } from '@/ui';

interface Row extends Comment {
  pending?: boolean;
}

/** Comments on one task (a friend's or yours). Optimistic send: the comment shows at once, the write needs the network. */
export default function Comments() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const { uid, profile } = useAuth();
  const { friendTasks } = useFriends();
  const { tasks } = useTasks();
  const social = useTaskSocial();
  const scroll = useRef<ScrollView>(null);
  const [text, setText] = useState('');
  const [pending, setPending] = useState<Row[]>([]);

  const friendTask = friendTasks.find((t) => t.id === taskId);
  const own = tasks.find((t) => t.id === taskId);
  const title = friendTask?.text ?? own?.text ?? 'Task';
  const server: Comment[] = (friendTask ? friendTask.comments : own?.comments) ?? [];
  const reactions = friendTask?.reactions ?? own?.reactions;

  const rows = useMemo<Row[]>(() => {
    const stillPending = pending.filter((p) => !server.some((c) => c.userId === p.userId && c.text === p.text));
    return [...server, ...stillPending].sort((a, b) => a.timestamp - b.timestamp);
  }, [server, pending]);

  const send = () => {
    const body = text.trim();
    if (!body || !uid || !profile || !taskId) return;
    haptic.light();
    const row: Row = {
      id: `pending_${Date.now()}`, userId: uid, userName: profile.displayName, photoURL: profile.photoURL, text: body, timestamp: Date.now(), pending: true,
    };
    setPending((p) => [...p, row]);
    setText('');
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    social.addComment(taskId, body).catch(() => {
      setPending((p) => p.filter((x) => x.id !== row.id));
      setText(body);
      toast.show("Couldn't send. Try again.", { kind: 'error' });
    });
  };

  const del = (c: Row) => {
    if (!taskId) return;
    if (c.userId !== uid) {
      if (!c.pending) openCommentMenu(taskId, c); // someone else's: report / block
      return;
    }
    haptic.warning();
    void social.deleteComment(taskId, c.id).catch(() => toast.show("Couldn't delete.", { kind: 'error' }));
  };

  const grouped = groupReactions(reactions, uid);

  return (
    <SheetScaffold title="Comments">
      <View style={{ flex: 1 }}>
        <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12, gap: 6, marginBottom: 12 }}>
          <Text variant="bodyStrong" numberOfLines={2}>{title}</Text>
          {grouped.length ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {grouped.map((g) => (
                <Text key={g.emoji} variant="caption" tone="muted">{`${g.emoji} ${g.count}`}</Text>
              ))}
            </View>
          ) : null}
        </View>
        <ScrollView ref={scroll} style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {rows.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 12, gap: 4 }}>
              <CoachSticker pose="sleepy" size={110} animated={false} />
              <Text variant="bodyStrong">Quiet in here.</Text>
              <Text variant="caption" tone="muted">Say something.</Text>
            </View>
          ) : null}
          {rows.length > 0 ? (
            <Text variant="caption" tone="faint">{`Hold a comment to report it. ${SAFETY_LINE}`}</Text>
          ) : null}
          {rows.map((c) => {
            const mine = c.userId === uid;
            return (
              <Pressable key={c.id} onLongPress={() => del(c)} delayLongPress={450} accessibilityHint={mine ? 'Hold to delete' : 'Hold to report or block'}>
                <View style={{ flexDirection: 'row', gap: 10, opacity: c.pending ? 0.6 : 1 }}>
                  <Avatar name={c.userName} photoURL={c.photoURL} size={34} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
                      <Text variant="bodyStrong" style={{ fontSize: 15 }}>{mine ? 'You' : c.userName}</Text>
                      <Text variant="caption" tone="faint">{c.pending ? 'sending' : timeAgo(c.timestamp)}</Text>
                    </View>
                    <Text variant="body">{c.text}</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 4 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Add a comment"
            placeholderTextColor={colors.textFaint}
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={send}
            accessibilityLabel="Comment"
            style={{
              flex: 1, height: 48, borderRadius: radius.pill, paddingHorizontal: 18, backgroundColor: colors.surface, borderWidth: 2,
              borderColor: colors.border, color: colors.text, fontFamily: fonts.bold, fontSize: 16,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            disabled={!text.trim()}
            onPress={send}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: text.trim() ? colors.primary : colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="send" size={20} color={text.trim() ? colors.onFill : colors.textFaint} />
          </Pressable>
        </View>
      </View>
    </SheetScaffold>
  );
}
