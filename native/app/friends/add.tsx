import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '@/hooks/useAuth';
import { useFriends } from '@/hooks/useFriends';
import { db } from '@/lib/firebase';
import type { UserDoc } from '@/lib/types-extra';
import { inviteErrorText, sendInvite } from '@/features/friends/api';
import { inviteDeepLink, inviteText } from '@/features/friends/logic';
import { QrCode } from '@/features/friends/QrCode';
import { Avatar, Button, Card, CoachSticker, haptic, SheetScaffold, StreakBadge, Text, TextField, useToast, useTheme } from '@/ui';

type Lookup =
  | { s: 'idle' }
  | { s: 'loading' }
  | { s: 'notfound' }
  | { s: 'found'; user: UserDoc; state: 'new' | 'self' | 'friend' | 'sent' };

function CodeBoxes({ code }: { code: string }) {
  const { colors } = useTheme();
  const chars = (code || '------').padEnd(6, ' ').slice(0, 6).split('');
  return (
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
      {chars.map((c, i) => (
        <View
          key={i}
          style={{
            width: 44, height: 58, borderRadius: 14, backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.primary,
            borderBottomWidth: 5, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text variant="title" tone="primary" style={{ fontFamily: 'Nunito_900Black' }}>{c}</Text>
        </View>
      ))}
    </View>
  );
}

export default function AddFriend() {
  const { uid, profile } = useAuth();
  const { friends, searchByFriendCode } = useFriends();
  const toast = useToast();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ code?: string }>();
  const myCode = profile?.friendCode ?? '';
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ s: 'idle' });
  const [sending, setSending] = useState(false);

  const find = useCallback(
    async (raw: string) => {
      const c = raw.trim().toUpperCase();
      if (c.length < 4) return;
      setLookup({ s: 'loading' });
      try {
        const user = await searchByFriendCode(c);
        if (!user) return setLookup({ s: 'notfound' });
        let state: 'new' | 'self' | 'friend' | 'sent' = 'new';
        if (user.id === uid) state = 'self';
        else if (friends.some((f) => f.id === user.id)) state = 'friend';
        else if (uid) {
          const pending = await getDocs(
            query(collection(db, 'friendInvites'), where('fromUid', '==', uid), where('toUid', '==', user.id), where('status', '==', 'pending')),
          );
          if (!pending.empty) state = 'sent';
        }
        setLookup({ s: 'found', user, state });
      } catch {
        setLookup({ s: 'idle' });
        toast.show("Couldn't look that up. Try again.", { kind: 'error' });
      }
    },
    [searchByFriendCode, friends, uid, toast],
  );

  // opened from a QR / link: nudge://friends/add?code=ABC123
  useEffect(() => {
    if (params.code) {
      const c = String(params.code).toUpperCase().slice(0, 6);
      setCode(c);
      void find(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code]);

  const copy = async () => {
    await Clipboard.setStringAsync(myCode);
    haptic.success();
    toast.show('Code copied.', { kind: 'success' });
  };
  const share = async () => {
    try {
      await Share.share({ message: inviteText(myCode) });
    } catch {
      /* dismissed */
    }
  };
  const whatsapp = () => {
    void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(inviteText(myCode))}`).catch(() =>
      toast.show("Couldn't open WhatsApp.", { kind: 'error' }),
    );
  };

  const send = async () => {
    if (lookup.s !== 'found' || sending) return;
    setSending(true);
    const r = await sendInvite({ uid: lookup.user.id });
    setSending(false);
    if (r.ok) {
      haptic.success();
      setLookup({ ...lookup, state: 'sent' });
      toast.show(`Request sent to ${lookup.user.displayName}.`, { kind: 'success' });
    } else if (r.error === 'already_invited') {
      setLookup({ ...lookup, state: 'sent' });
    } else {
      toast.show(inviteErrorText(r.error), { kind: 'error' });
    }
  };

  return (
    <SheetScaffold title="Add a friend" avoidKeyboard>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 18, paddingBottom: 32 }}>
        <Card padding={18}>
          <Text variant="label" tone="muted" align="center" style={{ marginBottom: 12 }}>Your friend code</Text>
          <CodeBoxes code={myCode} />
          <View style={{ alignItems: 'center', marginTop: 18, gap: 6 }}>
            <QrCode value={inviteDeepLink(myCode || 'XXXXXX')} size={168} />
            <Text variant="caption" tone="faint" align="center">Scan with a phone camera. Opens Nudge.</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button label="Copy" icon="copy" variant="secondary" size="sm" onPress={copy} />
            <Button label="Share" icon="share" size="sm" onPress={share} />
            <Button label="WhatsApp" icon="message" variant="success" size="sm" onPress={whatsapp} />
          </View>
        </Card>

        <View style={{ gap: 10 }}>
          <Text variant="heading">Got a code?</Text>
          <TextField
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6));
              if (lookup.s !== 'idle') setLookup({ s: 'idle' });
            }}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            returnKeyType="search"
            onSubmitEditing={() => find(code)}
            style={{ fontFamily: 'Nunito_900Black', letterSpacing: 4, fontSize: 22 }}
          />
          <Button label="Look up" icon="search" variant="secondary" fullWidth loading={lookup.s === 'loading'} disabled={code.length < 4} onPress={() => find(code)} />
        </View>

        {lookup.s === 'notfound' ? (
          <View style={{ alignItems: 'center', gap: 4 }}>
            <CoachSticker pose="disappointed" size={96} animated={false} />
            <Text variant="bodyStrong">No one has that code.</Text>
            <Text variant="caption" tone="muted">Check it with your friend.</Text>
          </View>
        ) : null}

        {lookup.s === 'found' ? (
          <Card tone={lookup.state === 'new' ? 'primary' : 'surface'} padding={16}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Avatar name={lookup.user.displayName} photoURL={lookup.user.photoURL} size={56} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="subheading" numberOfLines={1}>{lookup.user.displayName}</Text>
                <StreakBadge count={lookup.user.streakData?.currentStreak ?? 0} />
              </View>
            </View>
            <View style={{ marginTop: 14 }}>
              {lookup.state === 'new' ? (
                <Button label="Send request" icon="send" fullWidth loading={sending} onPress={send} />
              ) : (
                <Text variant="bodyStrong" tone={lookup.state === 'sent' ? 'success' : 'muted'} align="center">
                  {lookup.state === 'self' ? "That's you." : lookup.state === 'friend' ? 'Already friends.' : 'Request sent. Waiting on them.'}
                </Text>
              )}
            </View>
            {lookup.state === 'new' ? (
              <Text variant="caption" tone="muted" align="center" style={{ marginTop: 10, color: colors.textMuted }}>
                They have to accept before you see each other's tasks.
              </Text>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>
    </SheetScaffold>
  );
}
