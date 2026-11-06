/** Web twin of firebase.ts (used only for `expo start --web`, i.e. screenshot checks). */
import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

function makeDb(): Firestore {
  try {
    return initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  } catch {
    return getFirestore(app);
  }
}
export const db = makeDb();
export const storage = getStorage(app);

/** Dev only: `EXPO_PUBLIC_EMULATOR=1 expo start --web` talks to local Auth (9099) + Firestore (8080) emulators instead of production. */
if (process.env.EXPO_PUBLIC_EMULATOR === '1') {
  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  } catch {
    /* already connected (fast refresh) */
  }
}
