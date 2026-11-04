import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts,
} from '@expo-google-fonts/nunito';
import { AppLock } from '@/components/AppLock';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { EncryptionProvider } from '@/hooks/useEncryption';
import { FitnessProvider } from '@/hooks/useFitness';
import { FriendsProvider } from '@/hooks/useFriends';
import { NotificationsInboxProvider } from '@/hooks/useNotificationsInbox';
import { usePushSetup } from '@/hooks/usePush';
import { StreakProvider } from '@/hooks/useStreak';
import { TasksProvider } from '@/hooks/useTasks';
import { configureNotificationHandler } from '@/lib/push';
import { ConfettiProvider, sheetOptions, ThemeProvider, ToastProvider, useTheme } from '@/ui';

void SplashScreen.preventAutoHideAsync().catch(() => {});
configureNotificationHandler();

function Navigator() {
  const { user, loading } = useAuth();
  const { colors, isDark } = useTheme();
  usePushSetup();

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync().catch(() => {});
  }, [loading]);

  // Render the stack only once we know who is signed in: a cold-start deep link (nudge://friends/add?code=...) hitting a
  // Stack.Protected guard that is still `false` would be redirected away and lost. The splash screen covers this wait.
  if (loading) return null;

  const sheet = sheetOptions({}, colors);
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          {/* Sheets: see native/src/ui/Sheet.tsx for the convention. */}
          <Stack.Screen name="add" options={sheetOptions({ detents: [0.5, 0.92] }, colors)} />
          <Stack.Screen name="task/[id]" options={sheetOptions({ detents: [0.9] }, colors)} />
          <Stack.Screen name="friend/[uid]" options={{ presentation: 'card' }} />
          <Stack.Screen name="inbox" options={{ ...sheet, sheetAllowedDetents: [0.9] }} />
          <Stack.Screen name="today/more" options={sheetOptions({ detents: 'fitToContents' }, colors)} />
          <Stack.Screen name="today/focus" options={sheetOptions({ detents: [0.7, 0.95] }, colors)} />
          <Stack.Screen name="today/recap" options={sheetOptions({ detents: [0.75, 0.95] }, colors)} />
          <Stack.Screen name="today/bin" options={sheetOptions({ detents: [0.7, 0.95] }, colors)} />
          {/* Friends (native/app/friends/*): sheets + the groups page */}
          <Stack.Screen name="friends/add" options={sheetOptions({ detents: [0.94] }, colors)} />
          <Stack.Screen name="friends/requests" options={sheetOptions({ detents: [0.6, 0.94] }, colors)} />
          <Stack.Screen name="friends/groups" options={{ presentation: 'card' }} />
          <Stack.Screen name="friends/group" options={sheetOptions({ detents: [0.8, 0.94] }, colors)} />
          <Stack.Screen name="friends/comments" options={sheetOptions({ detents: [0.7, 0.94] }, colors)} />
          <Stack.Screen name="friends/encourage" options={sheetOptions({ detents: [0.7] }, colors)} />
          <Stack.Screen name="friends/remove" options={sheetOptions({ detents: [0.42] }, colors)} />
          {/* Progress + Me (nudge-progress): sheets, then Me sub-pages as plain cards. */}
          <Stack.Screen name="progress/log-workout" options={sheetOptions({ detents: [0.85, 1] }, colors)} />
          <Stack.Screen name="progress/log-metric" options={sheetOptions({ detents: [0.62, 1] }, colors)} />
          <Stack.Screen name="progress/goals" options={sheetOptions({ detents: [0.8, 1] }, colors)} />
          <Stack.Screen name="me/name" options={sheetOptions({ detents: 'fitToContents' }, colors)} />
          <Stack.Screen name="me/photo" options={sheetOptions({ detents: 'fitToContents' }, colors)} />
          <Stack.Screen name="me/bug" options={sheetOptions({ detents: [0.8, 1] }, colors)} />
          <Stack.Screen name="me/sign-out" options={sheetOptions({ detents: 'fitToContents' }, colors)} />
          <Stack.Screen name="me/delete-data" options={sheetOptions({ detents: 'fitToContents' }, colors)} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        {/* Hidden dev route (guards itself: only in __DEV__). */}
        <Stack.Screen name="dev/kit" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <ConfettiProvider>
              <AuthProvider>
                <EncryptionProvider>
                  <TasksProvider>
                    <FriendsProvider>
                      <NotificationsInboxProvider>
                        <FitnessProvider>
                          <StreakProvider>
                            <AppLock>
                              <Navigator />
                            </AppLock>
                          </StreakProvider>
                        </FitnessProvider>
                      </NotificationsInboxProvider>
                    </FriendsProvider>
                  </TasksProvider>
                </EncryptionProvider>
              </AuthProvider>
            </ConfettiProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
