// Native app: report a friend's comment or a person (App Store guideline 1.2). lib/server/moderation.ts fileReport.
// Body { kind:'comment'|'user', targetUid, reason:'spam'|'harassment'|'inappropriate'|'other', note?, taskId?, commentId?,
// contentSeen? } (taskId + commentId required for a comment). Bearer = Firebase ID token. Writes reports/{id} and alerts the
// owner on WhatsApp.
// 200 { ok:true, reportId } | 400 bad_request | 401 unauthorized | 404 not_found | 409 self | 429 rate_limited | 500 failed
import { fileReport, type ReportInput } from '@/lib/server/moderation';
import { NO_STORE, uidFromRequest } from '@/lib/server/appAuth';

export const runtime = 'nodejs';

const STATUS: Record<string, number> = { bad_request: 400, not_found: 404, self: 409, rate_limited: 429 };

export async function POST(req: Request) {
  const uid = await uidFromRequest(req);
  if (!uid) return Response.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  let body: ReportInput = {};
  try {
    const b = await req.json();
    if (b && typeof b === 'object') body = b as ReportInput;
  } catch {
    /* empty */
  }
  try {
    const r = await fileReport(uid, body);
    if (!r.ok) return Response.json({ error: r.reason }, { status: STATUS[r.reason] ?? 400, headers: NO_STORE });
    return Response.json({ ok: true, reportId: r.reportId }, { headers: NO_STORE });
  } catch (e) {
    console.error('[app/report] failed', e);
    return Response.json({ error: 'failed' }, { status: 500, headers: NO_STORE });
  }
}
