// Native app: block or unblock a person (App Store guideline 1.2). lib/server/moderation.ts setBlocked.
// Body { uid, block?: boolean (default true) }. Bearer = Firebase ID token. Blocking removes the friendship both ways,
// declines pending invites between the two and stops new invites; the app hides the person's comments and reactions.
// 200 { ok:true } | 400 bad_request | 401 unauthorized | 404 not_found | 409 self | 500 failed
import { setBlocked } from '@/lib/server/moderation';
import { NO_STORE, uidFromRequest } from '@/lib/server/appAuth';

export const runtime = 'nodejs';

const STATUS: Record<string, number> = { bad_request: 400, not_found: 404, self: 409 };

export async function POST(req: Request) {
  const uid = await uidFromRequest(req);
  if (!uid) return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  let body: { uid?: unknown; block?: unknown } = {};
  try {
    const b = await req.json();
    if (b && typeof b === 'object') body = b;
  } catch {
    /* empty */
  }
  if (body.block !== undefined && typeof body.block !== 'boolean') {
    return Response.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  }
  try {
    const r = await setBlocked(uid, body.uid, body.block !== false);
    if (!r.ok) return Response.json({ error: r.reason }, { status: STATUS[r.reason] ?? 400, headers: NO_STORE });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error('[app/block] failed', e);
    return Response.json({ error: 'failed' }, { status: 500, headers: NO_STORE });
  }
}
