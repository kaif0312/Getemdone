// Native app API auth: `Authorization: Bearer <Firebase ID token>` -> uid. Used by app/api/app/* routes that act as a signed-in user.
import { adminAuth } from './firebaseAdmin';

/** Injectable for tests (the emulator test has no Auth emulator). */
export const authDeps = {
  verify: async (token: string): Promise<string> => (await adminAuth().verifyIdToken(token)).uid,
  /** Strict check for destructive calls: also rejects revoked sessions. `authTime` = ms of the last real sign-in. */
  verifyStrict: async (token: string): Promise<{ uid: string; authTime: number }> => {
    const t = await adminAuth().verifyIdToken(token, true);
    return { uid: t.uid, authTime: (t.auth_time ?? 0) * 1000 };
  },
};

const bearer = (req: Request): string | null => /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim() || null;

export async function uidFromRequest(req: Request): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;
  try {
    return await authDeps.verify(token);
  } catch {
    return null;
  }
}

/** uid + time of the last sign-in (refreshing a token does not move it; signing in or re-authenticating does). */
export async function sessionFromRequest(req: Request): Promise<{ uid: string; authTime: number } | null> {
  const token = bearer(req);
  if (!token) return null;
  try {
    return await authDeps.verifyStrict(token);
  } catch {
    return null;
  }
}

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;
