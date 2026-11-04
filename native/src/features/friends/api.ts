/**
 * Friend-invite API (consent flow). `friendInvites` is server-write only (firestore.rules), so the app calls the Next API:
 *   POST {API_BASE}/api/app/friends/invite  { code } | { uid }  -> { ok, inviteId } | { error }
 *   POST {API_BASE}/api/app/friends/answer  { inviteId, accept } -> { ok } | { error }
 * Auth: `Authorization: Bearer <Firebase ID token>`. Contract: the server repo's AGENTS.md ("Friend invites for the app").
 */
import { auth } from '@/lib/firebase';
import { API_BASE } from '@/lib/config';

export type InviteError =
  | 'not_found' | 'self' | 'already_friends' | 'already_invited' | 'unauthorized' | 'bad_request' | 'network' | 'failed';
export type AnswerError = 'not_your_invite' | 'invite_not_found' | 'invite_already_answered' | 'unauthorized' | 'network' | 'failed';

async function post<T extends { ok?: boolean; error?: string }>(path: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { error: 'unauthorized' } as T;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T;
    return res.ok ? json : ({ ...json, error: json.error ?? 'failed' } as T);
  } catch {
    return { error: 'network' } as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function sendInvite(target: { code: string } | { uid: string }): Promise<{ ok: true; inviteId: string } | { ok: false; error: InviteError }> {
  const r = await post<{ ok?: boolean; inviteId?: string; error?: string }>('/api/app/friends/invite', target);
  if (r.ok && r.inviteId) return { ok: true, inviteId: r.inviteId };
  return { ok: false, error: (r.error as InviteError) ?? 'failed' };
}

export async function answerInviteApi(inviteId: string, accept: boolean): Promise<{ ok: true } | { ok: false; error: AnswerError }> {
  const r = await post<{ ok?: boolean; error?: string }>('/api/app/friends/answer', { inviteId, accept });
  if (r.ok) return { ok: true };
  return { ok: false, error: (r.error as AnswerError) ?? 'failed' };
}

/** Plain-language line for an API error. */
export function inviteErrorText(e: InviteError | AnswerError): string {
  switch (e) {
    case 'not_found': return 'No one has that code.';
    case 'self': return "That's your own code.";
    case 'already_friends': return 'Already friends.';
    case 'already_invited': return 'Request already sent. Wait for them.';
    case 'invite_already_answered': return 'Already answered.';
    case 'invite_not_found':
    case 'not_your_invite': return 'That request is gone.';
    case 'unauthorized': return 'Sign in again.';
    case 'network': return "Can't reach Nudge. Check your connection.";
    default: return 'That did not work. Try again.';
  }
}
