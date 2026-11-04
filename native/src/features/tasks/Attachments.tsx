/** Task attachments (max 3): thumbnails, add photo (expo-image-picker -> Firebase Storage like the PWA), remove. */
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/useTasks';
import { storage } from '@/lib/firebase';
import type { Attachment } from '@/lib/types';
import { haptic, Icon, radius, Text, useTheme, useToast } from '@/ui';
import { XIcon } from './XIcon';

const MAX = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_LIMIT = 100 * 1024 * 1024;

export function Attachments({ taskId, items }: { taskId: string; items: Attachment[] }) {
  const { colors } = useTheme();
  const toast = useToast();
  const { profile } = useAuth();
  const { addAttachment, removeAttachment } = useTasks();
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    if (items.length >= MAX) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.canAskAgain === false) {
      toast.show('Allow photo access in Settings to attach photos.', { kind: 'error' });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
    if (res.canceled || !res.assets[0]) return;
    const asset = res.assets[0];
    setBusy(true);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      if (blob.size > MAX_BYTES) throw new Error('That photo is over 10 MB.');
      const used = profile?.storageUsed ?? 0;
      const limit = profile?.storageLimit ?? DEFAULT_LIMIT;
      if (used + blob.size > limit) throw new Error('Out of storage space.');
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const r = storageRef(storage, `attachments/${taskId}/${id}`);
      await uploadBytes(r, blob, { contentType: asset.mimeType ?? 'image/jpeg' });
      const url = await getDownloadURL(r);
      await addAttachment(taskId, { id, type: 'image', url, name: asset.fileName ?? 'photo.jpg', size: blob.size, uploadedAt: Date.now() });
      haptic.success();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Upload failed. Try again.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = (a: Attachment) => {
    haptic.warning();
    void removeAttachment(taskId, a.id).catch(() => toast.show('Could not remove it.', { kind: 'error' }));
  };

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {items.map((a) => (
        <View key={a.id} style={{ width: 92, height: 92, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
          {a.type === 'image' ? (
            <Image source={{ uri: a.thumbnailUrl ?? a.url }} style={{ width: 92, height: 92 }} contentFit="cover" accessibilityLabel={a.name} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6 }}>
              <XIcon name="note" size={24} color={colors.textMuted} />
              <Text variant="caption" tone="muted" numberOfLines={2} align="center">{a.name}</Text>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${a.name}`}
            onPress={() => remove(a)}
            hitSlop={6}
            style={{ position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="x" size={14} color="#fff" strokeWidth={3} />
          </Pressable>
        </View>
      ))}
      {items.length < MAX ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          disabled={busy}
          onPress={pick}
          style={{ width: 92, height: 92, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 4, opacity: busy ? 0.5 : 1 }}
        >
          <XIcon name="image" size={24} color={colors.textMuted} />
          <Text variant="caption" tone="muted">{busy ? 'Uploading' : 'Add photo'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
