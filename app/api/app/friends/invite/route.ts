// Native app: send a friend invite (consent flow). Body { code } (friend code) or { uid }. Bearer = Firebase ID token.
// 200 { ok:true, inviteId } | 400 bad_request | 401 unauthorized | 404 not_found | 409 self|already_friends|already_invited
import { inviteFriendForApp } from '@/lib/server/social';
import { NO_STORE, uidFromRequest } from '@/lib/server/appAuth';

export const runtime = 'nodejs';

const STATUS: Record<string, number> = { not_found: 404, no_user: 401, self: 409, already_friends: 409, already_invited: 409 };

export async function POST(req: Request) {
  const uid = await uidFromRequest(req);
  if (!uid) return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  let body: { code?: unknown; uid?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const toUid = typeof body.uid === 'string' ? body.uid.trim() : '';
  if (!code && !toUid) return Response.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  const r = await inviteFriendForApp(uid, toUid ? { toUid } : { code });
  if (!r.ok) return Response.json({ error: r.reason ?? 'failed' }, { status: STATUS[r.reason ?? ''] ?? 400, headers: NO_STORE });
  return Response.json({ ok: true, inviteId: r.inviteId }, { headers: NO_STORE });
}
