/**
 * Firebase init for iOS/Android: Auth with AsyncStorage persistence (stay signed in), Firestore over long-polling
 * auto-detect (WebChannel can stall on RN), Storage. Same project as the PWA (see .env). `firebase.web.ts` is the web twin.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function makeAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Fast refresh: already initialised.
    return getAuth(app);
  }
}

function makeDb(): Firestore {
  try {
    return initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    return getFirestore(app);
  }
}

export const auth = makeAuth();
export const db = makeDb();
export const storage = getStorage(app);
