import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { Button, CoachSticker, Icon, Text, TextField, useTheme, useToast } from '@/ui';

function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Wrong email or password.';
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead.';
    case 'auth/weak-password':
      return 'Use at least 6 characters.';
    case 'auth/invalid-email':
      return 'That email does not look right.';
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a minute.';
    case 'auth/network-request-failed':
      return 'No connection. Try again.';
    default:
      return 'Something went wrong. Try again.';
  }
}

export default function EmailAuth() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const toast = useToast();
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) return setError('Email and password, please.');
    if (mode === 'up' && !name.trim()) return setError('What should we call you?');
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, password);
      else await signUp(email, password, name);
      // Stack.Protected in app/_layout.tsx moves us to Today.
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!email.trim()) return setError('Type your email first.');
    try {
      await resetPassword(email);
      toast.show('Reset link sent. Check your email.', { kind: 'success' });
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, paddingHorizontal: 24, gap: 18, flexGrow: 1 }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 44, height: 44, justifyContent: 'center' }}>
          <Icon name="chevronLeft" size={28} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <CoachSticker pose={mode === 'in' ? 'clipboard' : 'proud'} size={132} />
          <Text variant="title" align="center">{mode === 'in' ? 'Welcome back.' : 'Join the team.'}</Text>
          <Text tone="muted" align="center">{mode === 'in' ? 'Sign in to see your list.' : 'Two minutes. Then work.'}</Text>
        </View>

        <View style={{ gap: 14 }}>
          {mode === 'up' ? (
            <TextField label="Your name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" placeholder="Sam" />
          ) : null}
          <TextField
            label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" autoComplete="email" placeholder="you@email.com"
          />
          <TextField
            label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder="At least 6 characters"
            onSubmitEditing={submit} returnKeyType="go"
          />
          {error ? <Text variant="bodyStrong" tone="danger">{error}</Text> : null}
        </View>

        <View style={{ gap: 10 }}>
          <Button label={mode === 'in' ? 'Sign in' : 'Create account'} size="lg" fullWidth loading={busy} onPress={submit} />
          {mode === 'in' ? <Button label="Forgot password?" variant="ghost" size="sm" onPress={forgot} /> : null}
        </View>

        <View style={{ flex: 1 }} />
        <Pressable onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null); }} hitSlop={12} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 8 }}>
          <Text variant="bodyStrong" tone="primary">{mode === 'in' ? 'New here? Create an account' : 'Have an account? Sign in'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
