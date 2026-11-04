/** Who sees a task: everyone / only selected / everyone except / just me, plus friend groups. Controlled. */
import React from 'react';
import { Pressable, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { useFriends } from '@/hooks/useFriends';
import type { TaskVisibility } from '@/lib/types';
import { Avatar, Chip, haptic, Icon, radius, Text, useTheme, type IconName } from '@/ui';
import { XIcon, type XIconName } from './XIcon';

export const VIS_META: Record<TaskVisibility, { label: string; short: string; hint: string; icon: IconName | XIconName; x?: boolean }> = {
  everyone: { label: 'All friends', short: 'Friends', hint: 'Every friend can see it.', icon: 'globe', x: true },
  only: { label: 'Only some friends', short: 'Some', hint: 'Pick who sees it.', icon: 'users' },
  except: { label: 'All except some', short: 'Most', hint: 'Hide it from a few.', icon: 'eye' },
  private: { label: 'Just me', short: 'Private', hint: 'Nobody else sees it.', icon: 'lock' },
};

export function VisIcon({ v, size = 16, color }: { v: TaskVisibility; size?: number; color: string }) {
  const m = VIS_META[v];
  return m.x ? <XIcon name={m.icon as XIconName} size={size} color={color} /> : <Icon name={m.icon as IconName} size={size} color={color} />;
}

export interface VisValue {
  visibility: TaskVisibility;
  list: string[];
}

export function VisibilityPicker({ value, onChange }: { value: VisValue; onChange: (v: VisValue) => void }) {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { friends } = useFriends();
  const groups = profile?.friendGroups ?? [];
  const needsList = value.visibility === 'only' || value.visibility === 'except';

  const pick = (visibility: TaskVisibility) => {
    haptic.select();
    onChange({ visibility, list: visibility === 'only' || visibility === 'except' ? value.list : [] });
  };
  const toggleFriend = (id: string) => {
    haptic.select();
    onChange({ ...value, list: value.list.includes(id) ? value.list.filter((x) => x !== id) : [...value.list, id] });
  };

  return (
    <View style={{ gap: 10 }}>
      {(Object.keys(VIS_META) as TaskVisibility[]).map((v) => {
        const sel = value.visibility === v;
        return (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ selected: sel }}
            onPress={() => pick(v)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56, borderRadius: radius.md,
              borderWidth: 2, borderColor: sel ? colors.primary : colors.border, backgroundColor: sel ? colors.primarySoft : colors.surface,
            }}
          >
            <VisIcon v={v} size={20} color={sel ? colors.primary : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{VIS_META[v].label}</Text>
              <Text variant="caption" tone="muted">{VIS_META[v].hint}</Text>
            </View>
            {sel ? <Icon name="check" size={20} color={colors.primary} /> : null}
          </Pressable>
        );
      })}
      {needsList ? (
        friends.length === 0 ? (
          <Text tone="muted">No friends yet. Add some in the Friends tab.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {groups.length > 0 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {groups.map((g) => (
                  <Chip key={g.id} label={g.name} icon="users" size="sm" tone="accent" onPress={() => onChange({ ...value, list: g.memberIds.filter((id) => friends.some((f) => f.id === id)) })} />
                ))}
              </View>
            ) : null}
            {friends.map((f) => {
              const on = value.list.includes(f.id);
              return (
                <Pressable
                  key={f.id}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggleFriend(f.id)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}
                >
                  <Avatar name={f.displayName} photoURL={f.photoURL} size={36} />
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>{f.displayName}</Text>
                  <View
                    style={{
                      width: 26, height: 26, borderRadius: 13, borderWidth: 3, alignItems: 'center', justifyContent: 'center',
                      borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent',
                    }}
                  >
                    {on ? <Icon name="check" size={14} color={colors.onFill} strokeWidth={3.5} /> : null}
                  </View>
                </Pressable>
              );
            })}
            {value.list.length === 0 ? (
              <Text variant="caption" tone="faint">{value.visibility === 'only' ? 'Nobody picked: nobody will see it.' : 'Nobody picked: everyone sees it.'}</Text>
            ) : null}
          </View>
        )
      ) : null}
    </View>
  );
}
