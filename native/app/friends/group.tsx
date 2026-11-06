import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { useFriends } from '@/hooks/useFriends';
import type { FriendGroup } from '@/lib/types';
import { AnimatedCheckbox, Avatar, Button, haptic, SheetScaffold, Text, TextField, useToast, useTheme } from '@/ui';

/** Create (id=new) or edit a friend group: name + members. Stored in users.friendGroups, like the PWA. */
export default function GroupEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { friends, updateFriendGroups } = useFriends();
  const groups = useMemo(() => profile?.friendGroups ?? [], [profile?.friendGroups]);
  const existing = id && id !== 'new' ? groups.find((g) => g.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [members, setMembers] = useState<Set<string>>(new Set(existing?.memberIds ?? []));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggle = (fid: string) => {
    haptic.select();
    setMembers((m) => {
      const n = new Set(m);
      if (n.has(fid)) n.delete(fid);
      else n.add(fid);
      return n;
    });
  };

  const save = async () => {
    const clean = name.trim();
    if (!clean || members.size === 0 || saving) return;
    setSaving(true);
    const group: FriendGroup = { id: existing?.id ?? `g_${Date.now()}`, name: clean.slice(0, 40), memberIds: [...members] };
    const next = existing ? groups.map((g) => (g.id === existing.id ? group : g)) : [...groups, group];
    try {
      await updateFriendGroups(next);
      haptic.success();
      router.back();
    } catch {
      setSaving(false);
      toast.show("Couldn't save. Try again.", { kind: 'error' });
    }
  };

  const remove = async () => {
    if (!existing) return;
    if (!confirmDelete) {
      haptic.warning();
      setConfirmDelete(true);
      return;
    }
    try {
      await updateFriendGroups(groups.filter((g) => g.id !== existing.id));
      router.back();
    } catch {
      toast.show("Couldn't delete. Try again.", { kind: 'error' });
    }
  };

  const canSave = name.trim().length > 0 && members.size > 0;

  return (
    <SheetScaffold
      title={existing ? 'Edit group' : 'New group'}
      avoidKeyboard
      footer={
        <View style={{ gap: 8 }}>
          <Button label={existing ? 'Save' : 'Create group'} fullWidth loading={saving} disabled={!canSave} onPress={save} />
          {existing ? (
            <Button label={confirmDelete ? 'Tap again to delete' : 'Delete group'} variant={confirmDelete ? 'danger' : 'ghost'} fullWidth onPress={remove} />
          ) : null}
        </View>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="Gym crew" maxLength={40} returnKeyType="done" />
        <View style={{ gap: 6 }}>
          <Text variant="label" tone="muted">Members {members.size ? `(${members.size})` : ''}</Text>
          {friends.length === 0 ? <Text tone="muted">Add friends first.</Text> : null}
          {friends.map((f) => {
            const on = members.has(f.id);
            return (
              <Pressable
                key={f.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(f.id)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, borderRadius: 16,
                  backgroundColor: on ? colors.primarySoft : colors.surface, borderWidth: 2, borderColor: on ? colors.primary : colors.border,
                }}
              >
                <Avatar name={f.displayName} photoURL={f.photoURL} size={36} />
                <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{f.displayName}</Text>
                <AnimatedCheckbox checked={on} onToggle={() => toggle(f.id)} size={28} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SheetScaffold>
  );
}
