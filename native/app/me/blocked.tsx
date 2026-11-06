// Me > Privacy and security > Blocked people: everyone in blocks/{me}.uids, with Unblock (POST /api/app/block {block:false}).
// Unblocking does not make you friends again; either of you can send a request afterwards.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { useBlocks } from '@/hooks/useBlocks';
import { db } from '@/lib/firebase';
import { safetyErrorText, SAFETY_LINE } from '@/lib/safetyApi';
import { Group, Row, SettingsPage } from '@/features/settings/ui';
import { Avatar, Button, Card, CoachSticker, Text, useToast } from '@/ui';

interface Person { id: string; name: string; photoURL?: string }

export default function Blocked() {
  const toast = useToast();
  const { blocked, unblock } = useBlocks();
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const key = [...blocked].sort().join(',');

  useEffect(() => {
    let live = true;
    const ids = key ? key.split(',') : [];
    void Promise.all(
      ids.map(async (id): Promise<Person> => {
        try {
          const s = await getDoc(doc(db, 'users', id));
          const d = s.data() as { displayName?: string; photoURL?: string } | undefined;
          return { id, name: d?.displayName || 'Deleted account', photoURL: d?.photoURL };
        } catch {
          return { id, name: 'Someone' };
        }
      }),
    ).then((list) => {
      if (live) setPeople(Object.fromEntries(list.map((x) => [x.id, x])));
    });
    return () => {
      live = false;
    };
  }, [key]);

  const doUnblock = async (id: string) => {
    setBusy(id);
    const r = await unblock(id);
    setBusy(null);
    if (r.ok) toast.show('Unblocked.', { kind: 'success' });
    else toast.show(safetyErrorText(r.error), { kind: 'error' });
  };

  return (
    <SettingsPage title="Blocked people" subtitle="They can't see your tasks or send you requests">
      {blocked.length === 0 ? (
        <Card padding={18}>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <CoachSticker pose="proud" size={96} animated={false} />
            <Text variant="bodyStrong">Nobody blocked.</Text>
            <Text variant="caption" tone="muted" align="center">Block someone from their profile or by holding one of their comments.</Text>
          </View>
        </Card>
      ) : (
        <Group footer="Unblocking does not make you friends again.">
          {blocked.map((id) => {
            const p = people[id];
            return (
              <Row
                key={id}
                title={p?.name ?? '...'}
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar name={p?.name ?? '?'} photoURL={p?.photoURL} size={32} />
                    <Button label="Unblock" size="sm" variant="secondary" loading={busy === id} onPress={() => void doUnblock(id)} />
                  </View>
                }
              />
            );
          })}
        </Group>
      )}
      <Text variant="caption" tone="muted" style={{ paddingHorizontal: 6 }}>{SAFETY_LINE}</Text>
    </SettingsPage>
  );
}
