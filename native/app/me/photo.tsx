// Change / remove profile photo.
import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, Button, haptic, SheetScaffold, useToast } from '@/ui';
import { deletePhotoObject, pickAndUploadPhoto } from '@/features/settings/photo';

export default function Photo() {
  const router = useRouter();
  const toast = useToast();
  const { uid, profile, updateProfile } = useAuth();
  const [busy, setBusy] = useState<'library' | 'camera' | 'remove' | null>(null);

  const pick = async (source: 'library' | 'camera') => {
    if (!uid) return;
    setBusy(source);
    const r = await pickAndUploadPhoto(uid, source);
    if (r.ok) {
      try {
        await updateProfile({ photoURL: r.url });
        haptic.success();
        toast.show('Photo updated.', { kind: 'success' });
        router.back();
      } catch {
        toast.show('Could not save the photo.', { kind: 'error' });
      }
    } else if (r.reason === 'permission') toast.show('Allow photo access in your phone settings.', { kind: 'error' });
    else if (r.reason === 'toobig') toast.show('That photo is over 5 MB.', { kind: 'error' });
    else if (r.reason === 'failed') toast.show('Upload failed. Try again.', { kind: 'error' });
    setBusy(null);
  };

  const remove = async () => {
    if (!uid) return;
    setBusy('remove');
    try {
      await deletePhotoObject(uid);
      // null clears it, like the PWA (updateDoc photoURL: null)
      await updateProfile({ photoURL: null as unknown as undefined });
      toast.show('Photo removed.', { kind: 'info' });
      router.back();
    } catch {
      toast.show('Could not remove it.', { kind: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SheetScaffold title="Profile photo">
      <View style={{ alignItems: 'center', gap: 14, paddingBottom: 16 }}>
        <Avatar name={profile?.displayName ?? 'You'} photoURL={profile?.photoURL} size={96} />
        <View style={{ alignSelf: 'stretch', gap: 8 }}>
          <Button label="Choose from library" icon="camera" fullWidth loading={busy === 'library'} disabled={!!busy} onPress={() => void pick('library')} />
          {Platform.OS !== 'web' ? (
            <Button label="Take a photo" variant="secondary" fullWidth loading={busy === 'camera'} disabled={!!busy} onPress={() => void pick('camera')} />
          ) : null}
          {profile?.photoURL ? <Button label="Remove photo" variant="ghost" fullWidth loading={busy === 'remove'} disabled={!!busy} onPress={() => void remove()} /> : null}
        </View>
      </View>
    </SheetScaffold>
  );
}
