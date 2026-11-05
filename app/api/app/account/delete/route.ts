// Native app: delete the CALLER's own account and data (Google Play: in-app account deletion). lib/server/accountDelete.ts.
// Body { confirm: 'DELETE' }. Bearer = Firebase ID token from a sign-in within the last 5 minutes (else 401 reauth_required:
// the app re-authenticates and calls again), so a stolen or long-lived session cannot wipe an account.
// 200 { ok:true, deleted, updated, kept } | 400 bad_request | 401 unauthorized | reauth_required | 500 failed (safe to retry)
import { deleteAccount } from '@/lib/server/accountDelete';
import { NO_STORE, sessionFromRequest } from '@/lib/server/appAuth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const REAUTH_WINDOW_MS = 5 * 60_000;
const SKEW_MS = 60_000;

export async function POST(req: Request) {
  const s = await sessionFromRequest(req);
  if (!s) return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const age = Date.now() - s.authTime;
  if (!s.authTime || age > REAUTH_WINDOW_MS || age < -SKEW_MS) {
    return Response.json({ error: 'reauth_required' }, { status: 401, headers: NO_STORE });
  }
  let body: { confirm?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  if (body.confirm !== 'DELETE') return Response.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  try {
    const r = await deleteAccount(s.uid);
    console.log('[account/delete] done', s.uid, JSON.stringify(r.deleted), JSON.stringify(r.updated), 'skippedWa', r.skippedWaIds.length);
    return Response.json({ ok: true, deleted: r.deleted, updated: r.updated, kept: r.kept }, { headers: NO_STORE });
  } catch (e) {
    console.error('[account/delete] failed', s.uid, (e as Error).message);
    return Response.json({ error: 'failed', retry: true }, { status: 500, headers: NO_STORE });
  }
}
