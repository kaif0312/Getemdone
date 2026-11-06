/** App configuration. Public client config only: no server secrets belong in this app. */

/** Backend (the Next app: WhatsApp login, push senders). Override with EXPO_PUBLIC_API_BASE. */
export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE ?? 'https://getemdone.vercel.app').replace(/\/$/, '');

/**
 * Mirrors lib/config.ts in the PWA. While false, writes stay plaintext (decryption of existing `e1:` data still works).
 * Flip ONLY together with the PWA: both clients must switch at the same time.
 */
export const E2EE_ENABLED = false;

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** The WhatsApp number people chat with (wa.me format). The login API returns a ready waLink; this is the fallback. */
export const NUDGE_WA_NUMBER = '96560091617';
