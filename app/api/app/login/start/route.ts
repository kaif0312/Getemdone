// Native app: begin "Continue with WhatsApp". No auth; limited to 10 starts per client per 10 min.
import { startAppLogin } from '@/lib/wa/appLogin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  const r = await startAppLogin(ip);
  if (!r.ok) return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '600' } });
  const { code, waLink, pollToken, expiresAt } = r;
  return Response.json({ code, waLink, pollToken, expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
}
