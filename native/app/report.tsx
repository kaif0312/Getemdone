// Report a comment or a person (App Store guideline 1.2). Params: kind=comment|user, uid (the person), name, taskId +
// commentId (comment). Sends POST /api/app/report (src/lib/safetyApi.ts); the owner is alerted on WhatsApp and reviews
// within 24 h. After sending, offers to block the person too.
import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBlocks } from '@/hooks/useBlocks';
import { useFriends } from '@/hooks/useFriends';
import { useTasks } from '@/hooks/useTasks';
import { REPORT_REASONS, reportContent, safetyErrorText, type ReportReason } from '@/lib/safetyApi';
import { first } from '@/features/friends/logic';
import { Group, OptionRow } from '@/features/settings/ui';
import { Button, CoachSticker, haptic, SheetScaffold, Text, TextField, useTheme, radius, useToast } from '@/ui';

export default function Report() {
  const p = useLocalSearchParams<{ kind?: string; uid?: string; name?: string; taskId?: string; commentId?: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { tasks } = useTasks();
  const { friendTasks } = useFriends();
  const { isBlocked } = useBlocks();
  const kind = p.kind === 'comment' ? 'comment' : 'user';
  const name = p.name || 'this person';
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // The comment as shown to you (decrypted), so the reviewer sees what you saw.
  const comment = useMemo(() => {
    if (kind !== 'comment' || !p.taskId || !p.commentId) return null;
    const list = friendTasks.find((t) => t.id === p.taskId)?.comments ?? tasks.find((t) => t.id === p.taskId)?.comments ?? [];
    return list.find((c) => c.id === p.commentId) ?? null;
  }, [kind, p.taskId, p.commentId, friendTasks, tasks]);

  const send = async () => {
    if (!p.uid || !reason || busy) return;
    if (reason === 'other' && !note.trim()) {
      toast.show('Add a short note so we know what happened.', { kind: 'info' });
      return;
    }
    setBusy(true);
    haptic.light();
    const r = await reportContent({
      kind,
      targetUid: p.uid,
      reason,
      note: note.trim() || undefined,
      taskId: kind === 'comment' ? p.taskId : undefined,
      commentId: kind === 'comment' ? p.commentId : undefined,
      contentSeen: comment?.text,
    });
    setBusy(false);
    if (r.ok) {
      haptic.success();
      setSent(true);
    } else {
      toast.show(safetyErrorText(r.error), { kind: 'error' });
    }
  };

  if (sent) {
    const canBlock = !!p.uid && !isBlocked(p.uid);
    return (
      <SheetScaffold title="Reported" hideClose>
        <View style={{ alignItems: 'center', gap: 10, paddingTop: 8 }}>
          <CoachSticker pose="clipboard" size={110} animated={false} />
          <Text variant="subheading" align="center">Thanks. We review it within 24 hours.</Text>
          <Text variant="body" tone="muted" align="center" style={{ maxWidth: 320 }}>
            {name === 'this person' ? 'They are not told who reported them.' : `${first(name)} is not told who reported them.`}
            {canBlock ? ' Block them too if you never want to hear from them.' : ''}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, alignSelf: 'stretch' }}>
            {canBlock ? (
              <View style={{ flex: 1 }}>
                <Button
                  label={name === 'this person' ? 'Block' : `Block ${first(name)}`}
                  variant="danger"
                  fullWidth
                  onPress={() => router.replace({ pathname: '/block', params: { uid: p.uid!, name } })}
                />
              </View>
            ) : null}
            <View style={{ flex: 1 }}><Button label="Done" variant="secondary" fullWidth onPress={() => router.back()} /></View>
          </View>
        </View>
      </SheetScaffold>
    );
  }

  return (
    <SheetScaffold
      title={kind === 'comment' ? 'Report comment' : `Report ${first(name)}`}
      avoidKeyboard
      footer={<Button label="Send report" variant="danger" fullWidth disabled={!reason} loading={busy} onPress={() => void send()} />}
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
          {comment ? (
            <View style={{ backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 12, gap: 4 }}>
              <Text variant="caption" tone="muted">{comment.userName}</Text>
              <Text numberOfLines={4}>{comment.text}</Text>
            </View>
          ) : null}
          <Group title="What's wrong?">
            {REPORT_REASONS.map((r) => (
              <OptionRow
                key={r.id}
                title={r.title}
                subtitle={r.subtitle}
                selected={reason === r.id}
                onPress={() => {
                  haptic.select();
                  setReason(r.id);
                }}
              />
            ))}
          </Group>
          <TextField
            label={reason === 'other' ? 'Note' : 'Note (optional)'}
            value={note}
            onChangeText={setNote}
            placeholder="What happened?"
            multiline
            maxLength={500}
          />
          <Text variant="caption" tone="muted">We review every report within 24 hours and remove content or accounts that break the rules.</Text>
      </ScrollView>
    </SheetScaffold>
  );
}
