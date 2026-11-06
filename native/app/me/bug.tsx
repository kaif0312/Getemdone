// Report a bug / suggest something. Same bugReports doc shape + admin notifications as the PWA's BugReportModal.
import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { useAuth } from '@/hooks/useAuth';
import { db, storage } from '@/lib/firebase';
import { Button, haptic, Icon, SheetScaffold, Text, TextField, useTheme, useToast } from '@/ui';

const MAX_BYTES = 10 * 1024 * 1024;

export default function Bug() {
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { uid, profile, user } = useAuth();
  const [text, setText] = useState('');
  const [shot, setShot] = useState<{ uri: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pickShot = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show('Allow photo access in your phone settings.', { kind: 'error' });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    if (a.fileSize && a.fileSize > MAX_BYTES) {
      toast.show('That image is over 10 MB.', { kind: 'error' });
      return;
    }
    setShot({ uri: a.uri });
  };

  const submit = async () => {
    if (!uid || !text.trim()) return;
    setBusy(true);
    try {
      let imageUrl: string | null = null;
      if (shot) {
        const blob = await (await fetch(shot.uri)).blob();
        const r = ref(storage, `bugReports/${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
        await uploadBytes(r, blob, { contentType: blob.type || 'image/jpeg' });
        imageUrl = await getDownloadURL(r);
      }
      const userName = profile?.displayName || 'Nudge user';
      const ref2 = await addDoc(collection(db, 'bugReports'), {
        userId: uid,
        userName,
        userEmail: user?.email || profile?.email || '',
        description: text.trim(),
        imageUrl,
        status: 'open',
        createdAt: serverTimestamp(),
        resolvedAt: null,
        adminNotes: null,
        source: 'native',
      });
      try {
        const admins = await getDocs(query(collection(db, 'users'), where('isAdmin', '==', true)));
        await Promise.all(
          admins.docs.map((a) =>
            addDoc(collection(db, 'notifications'), {
              userId: a.id, type: 'bugReport', title: 'New bug report / feature request', message: `${userName} sent feedback from the app`,
              bugReportId: ref2.id, fromUserId: uid, fromUserName: userName, createdAt: Date.now(), read: false,
            }),
          ),
        );
      } catch {
        /* admin ping is best effort */
      }
      haptic.success();
      toast.show('Sent. Thank you.', { kind: 'success' });
      router.back();
    } catch (e) {
      console.warn('[bug] submit failed', e);
      toast.show('Could not send that. Try again.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScaffold title="Report a bug" footer={<Button label="Send" size="lg" fullWidth loading={busy} disabled={!text.trim()} onPress={submit} />}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 12 }}>
        <TextField
          label="What happened"
          value={text}
          onChangeText={setText}
          placeholder="What broke, or what should Nudge do better?"
          multiline
          maxLength={2000}
          style={{ minHeight: 140 }}
        />
        {shot ? (
          <View>
            <Image source={{ uri: shot.uri }} style={{ width: '100%', height: 180, borderRadius: 16 }} contentFit="cover" />
            <Pressable
              onPress={() => setShot(null)}
              accessibilityRole="button"
              accessibilityLabel="Remove screenshot"
              style={{ position: 'absolute', top: 8, right: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="x" size={18} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <Button label="Add a screenshot" icon="camera" variant="secondary" size="sm" onPress={() => void pickShot()} />
        )}
        <Text variant="caption" tone="faint">The team reads every one.</Text>
      </ScrollView>
    </SheetScaffold>
  );
}
