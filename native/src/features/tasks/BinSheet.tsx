/** Recycle bin: deleted tasks, restore, delete forever, empty (with an in-sheet confirm). Route: /today/bin. */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useTasks } from '@/hooks/useTasks';
import type { Task } from '@/lib/types';
import { Button, Card, EmptyState, ErrorState, haptic, radius, SheetScaffold, SkeletonList, Text, useTheme, useToast } from '@/ui';
import { fmtAgo } from './helpers';

const RETENTION_DAYS = 30;

export default function BinSheet() {
  const { colors } = useTheme();
  const toast = useToast();
  const { fetchDeleted, restoreTask, permanentlyDeleteTask, emptyBin } = useTasks();
  const [items, setItems] = useState<Task[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<'all' | string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setItems(await fetchDeleted());
    } catch (e) {
      console.warn('[bin] load', e);
      setFailed(true);
    }
  }, [fetchDeleted]);
  useEffect(() => {
    void load();
  }, [load]);

  const restore = async (t: Task) => {
    haptic.success();
    setItems((cur) => (cur ?? []).filter((x) => x.id !== t.id));
    try {
      await restoreTask(t.id);
      toast.show('Restored.', { kind: 'success' });
    } catch {
      toast.show('Could not restore it.', { kind: 'error' });
      void load();
    }
  };

  const destroy = async () => {
    setBusy(true);
    try {
      if (confirm === 'all') {
        await emptyBin();
        setItems([]);
      } else if (confirm) {
        await permanentlyDeleteTask(confirm);
        setItems((cur) => (cur ?? []).filter((x) => x.id !== confirm));
      }
      haptic.warning();
      setConfirm(null);
    } catch {
      toast.show('Could not delete that.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const daysLeft = (t: Task) => Math.max(0, RETENTION_DAYS - Math.floor((Date.now() - (t.deletedAt ?? Date.now())) / 86400000));

  return (
    <SheetScaffold
      title="Recycle bin"
      footer={
        items && items.length > 0 && confirm === null ? (
          <Button label="Empty the bin" variant="secondary" fullWidth onPress={() => setConfirm('all')} />
        ) : null
      }
    >
      {failed ? (
        <ErrorState onRetry={load} compact />
      ) : items === null ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <EmptyState pose="sleepy" title="Bin is empty." body="Deleted tasks wait here for 30 days." compact />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
          {confirm ? (
            <Card tone="danger" padding={14}>
              <Text variant="subheading">{confirm === 'all' ? `Delete ${items.length} ${items.length === 1 ? 'task' : 'tasks'} forever?` : 'Delete this task forever?'}</Text>
              <Text tone="muted" style={{ marginTop: 2 }}>This cannot be undone.</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Button label="Delete forever" variant="danger" size="sm" loading={busy} onPress={destroy} />
                <Button label="Cancel" variant="ghost" size="sm" onPress={() => setConfirm(null)} />
              </View>
            </Card>
          ) : null}
          {items.map((t) => (
            <View key={t.id} style={{ padding: 12, gap: 8, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }}>
              <Text variant="bodyStrong" numberOfLines={2}>{t.text}</Text>
              <Text variant="caption" tone="faint">Deleted {t.deletedAt ? `${fmtAgo(t.deletedAt)} ago` : ''} · {daysLeft(t)} days left</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Restore" size="sm" variant="success" icon="repeat" onPress={() => restore(t)} />
                <Button label="Delete" size="sm" variant="ghost" onPress={() => setConfirm(t.id)} />
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SheetScaffold>
  );
}
