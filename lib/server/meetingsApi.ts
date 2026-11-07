// Auth for /api/meetings*: EITHER an HMAC signature (Claude Code script) OR a Firebase ID token (PWA / native app).
//   Signed:  header `x-nudge-signature` = hex HMAC-SHA256(NUDGE_FORWARD_SECRET, payload), payload = the raw body (POST) or
//            `pathname + search` (GET / DELETE). The body / query carries `ts` (ms) and `ownerWa` or `ownerUid`; ts older than
//            5 min is refused (replay). Token: `Authorization: Bearer <ID token>`; the caller may only touch their own meetings.
import { verifySignature } from '../wa/inbound';
import { getLink } from '../wa/links';
import { uidFromRequest } from './appAuth';

export const MAX_SKEW_MS = 5 * 60_000;

export const deps = {
  uidFromWa: async (wa: string): Promise<string | null> => (await getLink(wa))?.uid ?? null,
  uidFromToken: (req: Request) => uidFromRequest(req),
};

export function freshTs(ts: unknown, now: number = Date.now()): boolean {
  const n = typeof ts === 'string' ? Number(ts) : ts;
  return typeof n === 'number' && Number.isFinite(n) && Math.abs(now - n) <= MAX_SKEW_MS;
}

/** `params` = the parsed body (POST) or the query (GET / DELETE). Returns the acting uid, or null = 401. */
export async function authenticate(req: Request, payload: string, params: Record<string, unknown>, now: number = Date.now()): Promise<string | null> {
  const sig = req.headers.get('x-nudge-signature');
  if (sig) {
    if (!verifySignature(payload, sig) || !freshTs(params.ts, now)) return null;
    if (typeof params.ownerUid === 'string' && params.ownerUid) return params.ownerUid;
    if (typeof params.ownerWa === 'string' && params.ownerWa) return deps.uidFromWa(params.ownerWa.replace(/\D/g, ''));
    return null;
  }
  return deps.uidFromToken(req);
}
