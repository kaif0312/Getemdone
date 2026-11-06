/**
 * Self-service account deletion (server: app/api/app/account/delete/route.ts + lib/server/accountDelete.ts, server AGENTS.md
 * "Account deletion"):
 *   POST {API_BASE}/api/app/account/delete  { confirm: 'DELETE' }  Bearer = Firebase ID token
 *   -> 200 { ok, deleted, updated, kept } | 401 { error: 'unauthorized' | 'reauth_required' } | 400 | 500 { error:'failed' }
 * The token's sign-in (auth_time) must be under 5 minutes old: on `reauth_required` re-authenticate and call again
 * (refreshing the token does not help, only a real sign-in moves auth_time).
 */
import { EmailAuthProvider, reauthenticateWithCredential, type User } from 'firebase/auth';
import { auth } from './firebase';
import { API_BASE } from './config';

export type DeleteResult =
  | { ok: true; kept: string[] }
  | { ok: false; error: 'reauth_required' | 'unauthorized' | 'network' | 'failed' };

export async function deleteMyAccount(): Promise<DeleteResult> {
  const user = auth.currentUser;
  if (!user) return { ok: false, error: 'unauthorized' };
  let token: string;
  try {
    token = await user.getIdToken(true); // fresh token so a re-auth's new auth_time is in it
  } catch {
    return { ok: false, error: 'network' };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  try {
    const res = await fetch(`${API_BASE}/api/app/account/delete`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirm: 'DELETE' }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; kept?: string[] };
    if (res.ok && json.ok) return { ok: true, kept: json.kept ?? [] };
    if (json.error === 'reauth_required') return { ok: false, error: 'reauth_required' };
    if (res.status === 401) return { ok: false, error: 'unauthorized' };
    return { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** How this account can prove it is still the owner: its password, or a fresh WhatsApp login code. */
export function reauthMethod(user: User | null): 'password' | 'whatsapp' {
  return user?.email && user.providerData.some((p) => p.providerId === 'password') ? 'password' : 'whatsapp';
}

export async function reauthWithPassword(password: string): Promise<void> {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('no email');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

/** The `uid` claim of a Firebase custom token (from /api/app/login/poll), read without verifying: we only compare it to the
 *  signed-in uid so a WhatsApp number linked to ANOTHER account can never switch the session before a delete. */
export function customTokenUid(token: string): string | null {
  try {
    const part = token.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = JSON.parse(globalThis.atob(b64)) as { uid?: unknown };
    return typeof json.uid === 'string' ? json.uid : null;
  } catch {
    return null;
  }
}
