// Edit display name (1-50 chars, same rule as the PWA ProfileSettings).
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { Button, haptic, SheetScaffold, TextField, useToast } from '@/ui';

export default function EditName() {
  const router = useRouter();
  const toast = useToast();
  const { profile, updateProfile } = useAuth();
  const [name, setName] = useState(profile?.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const error = trimmed.length > 50 ? 'Max 50 characters.' : null;

  const save = async () => {
    if (!trimmed || error) return;
    if (trimmed === profile?.displayName) {
      router.back();
      return;
    }
    setBusy(true);
    try {
      await updateProfile({ displayName: trimmed });
      haptic.success();
      router.back();
    } catch {
      toast.show('Could not save that.', { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetScaffold title="Your name" footer={<Button label="Save" size="lg" fullWidth loading={busy} disabled={!trimmed || !!error} onPress={save} />}>
      <TextField value={name} onChangeText={setName} placeholder="Your name" autoFocus maxLength={60} returnKeyType="done" onSubmitEditing={save} error={error} autoCapitalize="words" />
    </SheetScaffold>
  );
}
