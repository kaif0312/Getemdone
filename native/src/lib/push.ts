/**
 * Expo push: permission (asked politely, after a first meaningful action, never on launch), token, and the Firestore write.
 * Contract (docs/NATIVE_APP_PLAN.md section 4): users/{uid}.expoPushTokens.<sanitisedToken> = { token, platform, updatedAt }.
 * The server senders read these and call the Expo push API. Tolerates a missing EAS projectId (before `eas init`): status
 * 'unavailable', nothing is written.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from './firebase';
import type { ExpoPushTokenEntry } from './types-extra';

export type PushStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

const ASKED_KEY = 'nudge_push_asked_v1';
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

/** Firestore field names can't hold '.', '[' or ']' in a path; keep the raw token inside the value. */
export function pushTokenKey(token: string): string {
  return token.replace(/[^A-Za-z0-9_-]/g, '_');
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export function configureNotificationHandler(): void {
  if (!isNative) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isNative) return 'unavailable';
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/** Get the Expo token and store it on the user doc. Call only when permission is granted. */
export async function registerPushToken(uid: string): Promise<PushStatus> {
  if (!isNative) return 'unavailable';
  const pid = projectId();
  if (!pid) return 'unavailable'; // no EAS project yet
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Nudge',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor: '#7B4FD6',
      });
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    const entry: ExpoPushTokenEntry = { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', updatedAt: Date.now() };
    await setDoc(doc(db, 'users', uid), { expoPushTokens: { [pushTokenKey(token)]: entry } }, { merge: true });
    return 'granted';
  } catch (e) {
    console.warn('[push] token registration failed', e);
    return 'unavailable';
  }
}

/**
 * Ask for permission ONCE, after something meaningful (e.g. the first task added). Returns the resulting status.
 * If the user already answered (either way) it never prompts again; they can enable it in Me > Notifications.
 */
export async function askForPushOnce(uid: string): Promise<PushStatus> {
  const current = await getPushStatus();
  if (current === 'unavailable') return current;
  if (current === 'granted') return registerPushToken(uid);
  try {
    if ((await AsyncStorage.getItem(ASKED_KEY)) === '1') return current;
    await AsyncStorage.setItem(ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
  if (current === 'denied') return current;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted ? registerPushToken(uid) : 'denied';
}

/** Explicit request from a settings switch (always prompts if the OS still allows it). */
export async function enablePush(uid: string): Promise<PushStatus> {
  const current = await getPushStatus();
  if (current === 'granted') return registerPushToken(uid);
  if (current !== 'undetermined') return current;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted ? registerPushToken(uid) : 'denied';
}

/** Notification payloads from the server carry data.type in 'task' | 'friend' | 'inbox' (+ taskId / uid). */
export function routeForNotificationData(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null;
  const type = data.type;
  if (type === 'task' && typeof data.taskId === 'string') return `/task/${data.taskId}`;
  if (type === 'friend') {
    const id = typeof data.uid === 'string' ? data.uid : typeof data.friendId === 'string' ? data.friendId : null;
    return id ? `/friend/${id}` : '/(tabs)/friends';
  }
  if (type === 'inbox') return '/inbox';
  return null;
}

/** Sign-out: stop pushes for this user reaching this phone (the next person to sign in here must not get them). Best effort. */
export async function unregisterPushToken(uid: string): Promise<void> {
  const pid = projectId();
  if (!isNative || !pid) return;
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    await updateDoc(doc(db, 'users', uid), { [`expoPushTokens.${pushTokenKey(token)}`]: deleteField() });
  } catch (e) {
    console.warn('[push] unregister failed', e);
  }
}
