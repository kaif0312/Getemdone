/**
 * Push wiring.
 *   usePushSetup()   mount once in the root: refreshes the token if permission is already granted, and routes notification
 *                    taps (warm + cold start) to the right screen via routeForNotificationData.
 *   usePush()        { status, askAfterFirstAction(), enable() } for screens. Call askAfterFirstAction() right after the
 *                    user's first meaningful action (first task added), never on launch.
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { askForPushOnce, enablePush, getPushStatus, registerPushToken, routeForNotificationData, type PushStatus } from '@/lib/push';
import { useAuth } from './useAuth';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export function usePushSetup(): void {
  const { uid } = useAuth();
  const router = useRouter();
  // isNative is a module constant, so the hook order never changes at runtime (the hook throws on web).
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const last = isNative ? Notifications.useLastNotificationResponse() : null;

  useEffect(() => {
    if (!uid || !isNative) return;
    void getPushStatus().then((s) => (s === 'granted' ? registerPushToken(uid) : undefined));
  }, [uid]);

  useEffect(() => {
    if (!uid || !last) return;
    const route = routeForNotificationData(last.notification.request.content.data as Record<string, unknown>);
    if (route) router.push(route as never);
  }, [uid, last, router]);
}

export function usePush() {
  const { uid } = useAuth();
  const [status, setStatus] = useState<PushStatus>('undetermined');

  useEffect(() => {
    void getPushStatus().then(setStatus);
  }, []);

  const askAfterFirstAction = useCallback(async () => {
    if (!uid) return 'unavailable' as PushStatus;
    const s = await askForPushOnce(uid);
    setStatus(s);
    return s;
  }, [uid]);

  const enable = useCallback(async () => {
    if (!uid) return 'unavailable' as PushStatus;
    const s = await enablePush(uid);
    setStatus(s);
    return s;
  }, [uid]);

  return { status, askAfterFirstAction, enable };
}
