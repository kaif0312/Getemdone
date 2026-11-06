/** Notifications inbox (the bell): grouped Today / Earlier, icon per type, tap routes, mark all read. Route: /inbox. */
import React, { useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useNotificationsInbox } from '@/hooks/useNotificationsInbox';
import { fmtAgo } from '@/features/tasks/helpers';
import { getDateString } from '@/lib/taskFilter';
import type { InAppNotification } from '@/lib/types';
import { Avatar, Button, EmptyState, haptic, Icon, radius, SheetScaffold, SkeletonList, SwipeRow, Text, useTheme, type IconName } from '@/ui';

const TYPE_META: Record<InAppNotification['type'], { icon: IconName; tone: 'primary' | 'success' | 'danger' | 'accent' | 'sun' }> = {
  comment: { icon: 'message', tone: 'primary' },
  completion: { icon: 'check', tone: 'success' },
  deadline: { icon: 'clock', tone: 'danger' },
  commitment: { icon: 'bolt', tone: 'accent' },
  encouragement: { icon: 'star', tone: 'sun' },
  bugReport: { icon: 'settings', tone: 'primary' },
  announcement: { icon: 'bell', tone: 'primary' },
};

/** Server/PWA notifications often repeat the title as the message ("X nudged you..." twice): show it once. */
function sameLine(title: string, message: string): boolean {
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const a = norm(title);
  const b = norm(message);
  return !b || a === b || a.endsWith(b) || b.endsWith(a);
}

function Row({ n, onOpen, onRemove }: { n: InAppNotification; onOpen: () => void; onRemove: () => void }) {
  const { colors } = useTheme();
  const meta = TYPE_META[n.type] ?? TYPE_META.announcement;
  const fill = { primary: colors.primary, success: colors.success, danger: colors.danger, accent: colors.accent, sun: colors.sunEdge }[meta.tone];
  const soft = { primary: colors.primarySoft, success: colors.successSoft, danger: colors.dangerSoft, accent: colors.accentSoft, sun: colors.sunSoft }[meta.tone];
  const detail = n.commentText ? `"${n.commentText}"` : n.reactionEmoji ? n.reactionEmoji : n.taskText ?? '';
  return (
    <SwipeRow actions={[{ key: 'del', label: 'Remove', icon: 'trash', tone: 'danger', onPress: onRemove }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${n.title}. ${n.message}`}
        accessibilityActions={[{ name: 'remove', label: 'Remove' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'remove') onRemove();
        }}
        onPress={onOpen}
        style={{
          flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, minHeight: 64, borderRadius: radius.lg, borderWidth: 2,
          borderColor: n.read ? colors.border : fill, backgroundColor: n.read ? colors.surface : soft,
        }}
      >
        <View>
          {n.fromUserName ? (
            <Avatar name={n.fromUserName} photoURL={n.fromUserPhotoURL} size={40} />
          ) : (
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: soft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={meta.icon} size={20} color={fill} />
            </View>
          )}
          {n.fromUserName ? (
            <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: fill, borderWidth: 2, borderColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={meta.icon} size={11} color={colors.onFill} strokeWidth={3} />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={2}>{n.title}</Text>
          {sameLine(n.title, n.message) ? null : <Text variant="caption" tone="muted" numberOfLines={2}>{n.message}</Text>}
          {detail ? <Text variant="caption" tone="faint" numberOfLines={1}>{detail}</Text> : null}
        </View>
        <Text variant="caption" tone="faint">{fmtAgo(n.createdAt)}</Text>
      </Pressable>
    </SwipeRow>
  );
}

export default function InboxSheet() {
  const router = useRouter();
  const { notifications, unread, loading, markRead, markAllRead, remove } = useNotificationsInbox();

  const groups = useMemo(() => {
    const todayStr = getDateString(Date.now());
    const t: InAppNotification[] = [];
    const e: InAppNotification[] = [];
    for (const n of notifications) (getDateString(n.createdAt) === todayStr ? t : e).push(n);
    return [{ title: 'Today', items: t }, { title: 'Earlier', items: e }].filter((g) => g.items.length > 0);
  }, [notifications]);

  const open = (n: InAppNotification) => {
    if (!n.read) void markRead(n.id).catch(() => {});
    if (n.type === 'encouragement' && n.fromUserId) {
      router.replace({ pathname: '/friend/[uid]', params: { uid: n.fromUserId } });
    } else if (n.taskId) {
      router.replace({ pathname: '/task/[id]', params: { id: n.taskId } });
    }
  };

  return (
    <SheetScaffold
      title="Notifications"
      footer={unread > 0 ? <Button label={`Mark ${unread} read`} variant="secondary" fullWidth icon="check" onPress={() => { haptic.success(); void markAllRead().catch(() => {}); }} /> : null}
    >
      {loading ? (
        <SkeletonList count={4} />
      ) : notifications.length === 0 ? (
        <EmptyState pose="sleepy" title="All quiet." body="Friends' comments, nudges and deadlines show up here." compact />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
          {groups.map((g) => (
            <View key={g.title} style={{ gap: 10 }}>
              <Text variant="label" tone="muted">{g.title}</Text>
              {g.items.map((n) => (
                <Row key={n.id} n={n} onOpen={() => open(n)} onRemove={() => void remove(n.id).catch(() => {})} />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </SheetScaffold>
  );
}
