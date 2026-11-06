/**
 * Long-press (or "Report") on someone else's comment: Report comment / Block <name> / Cancel. Opens the `report` / `block`
 * sheets (app/report.tsx, app/block.tsx). Own comments keep their own actions (delete).
 */
import { Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import type { Comment } from '@/lib/types';
import { first } from '@/features/friends/logic';
import { haptic } from '@/ui';

export function openCommentMenu(taskId: string, c: Pick<Comment, 'id' | 'userId' | 'userName'>): void {
  const report = () =>
    router.push({ pathname: '/report', params: { kind: 'comment', uid: c.userId, name: c.userName, taskId, commentId: c.id } });
  const block = () => router.push({ pathname: '/block', params: { uid: c.userId, name: c.userName } });
  haptic.select();
  if (Platform.OS === 'web') {
    report(); // web (screenshots only) has no multi-button alert; the report sheet offers Block afterwards
    return;
  }
  Alert.alert(c.userName || 'Comment', undefined, [
    { text: 'Report comment', onPress: report },
    { text: `Block ${first(c.userName || 'them')}`, style: 'destructive', onPress: block },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
