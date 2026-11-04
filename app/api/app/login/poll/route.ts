// Native app: poll for the result of "Continue with WhatsApp". The pollToken is the secret; no auth header.
import { pollAppLogin } from '@/lib/wa/appLogin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get('t') ?? '';
  try {
    return Response.json(await pollAppLogin(t), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[app/login/poll] failed', e);
    return Response.json({ error: 'server_error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
