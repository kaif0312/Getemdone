// Firebase Admin for server code (API routes, cron, the WhatsApp bot). Never import from client components.
// Credentials: FIREBASE_SERVICE_ACCOUNT = base64 of the service-account JSON (Vercel env).
// Tests: set FIRESTORE_EMULATOR_HOST (+ GCLOUD_PROJECT=demo-nudge) and no credentials are needed.
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

let app: App | null = null;

function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]);
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    app = initializeApp({ credential: cert(json), projectId: json.project_id });
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    app = initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-nudge' });
  } else {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  }
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

export function adminAuth(): Auth {
  return getAuth(adminApp());
}

export function adminMessaging(): Messaging {
  return getMessaging(adminApp());
}
