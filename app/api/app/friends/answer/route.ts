// Native app: accept or decline an incoming friend invite. Body { inviteId, accept }. Bearer = Firebase ID token.
// 200 { ok:true } | 400 bad_request | 401 unauthorized | 403 not_your_invite | 404 invite_not_found | 409 invite_already_answered
import { answerInvite } from '@/lib/server/social';
import { NO_STORE, uidFromRequest } from '@/lib/server/appAuth';

export const runtime = 'nodejs';

const STATUS: Record<string, number> = { not_your_invite: 403, invite_not_found: 404, invite_already_answered: 409 };

export async function POST(req: Request) {
  const uid = await uidFromRequest(req);
  if (!uid) return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  let body: { inviteId?: unknown; accept?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (typeof body.inviteId !== 'string' || !body.inviteId || typeof body.accept !== 'boolean') {
    return Response.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  try {
    await answerInvite(uid, body.inviteId, body.accept);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed';
    return Response.json({ error: msg }, { status: STATUS[msg] ?? 500, headers: NO_STORE });
  }
}
