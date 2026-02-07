import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase only if it hasn't been initialized already
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Connect to emulators if in development and USE_EMULATOR is true
// Must be done on client side only, and BEFORE any Firebase operations
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_USE_EMULATOR === 'true') {
  // Use a flag to prevent multiple connection attempts
  if (!(globalThis as any).__firebaseEmulatorConnected) {
    try {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectStorageEmulator(storage, 'localhost', 9199);
      (globalThis as any).__firebaseEmulatorConnected = true;
      console.log('🔧 Connected to Firebase Emulators');
    } catch (error: any) {
      // Only log if it's not the "already connected" error
      if (!error.message?.includes('already been called') && !error.message?.includes('Cannot call')) {
        console.error('⚠️ Failed to connect to emulators:', error.message);
        console.error('💡 Make sure emulators are running: firebase emulators:start');
      }
    }
  }
}

export { app, auth, db, storage };
