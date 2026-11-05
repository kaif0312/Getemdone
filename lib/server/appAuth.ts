// Native app API auth: `Authorization: Bearer <Firebase ID token>` -> uid. Used by app/api/app/* routes that act as a signed-in user.
import { adminAuth } from './firebaseAdmin';

/** Injectable for tests (the emulator test has no Auth emulator). */
export const authDeps = {
  verify: async (token: string): Promise<string> => (await adminAuth().verifyIdToken(token)).uid,
};

export async function uidFromRequest(req: Request): Promise<string | null> {
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  try {
    return await authDeps.verify(m[1].trim());
  } catch {
    return null;
  }
}

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;
