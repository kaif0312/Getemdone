// Settings -> "Connect WhatsApp". Auth: Authorization: Bearer <Firebase ID token>.
import { adminAuth } from '@/lib/server/firebaseAdmin';
import { createLinkCode, getLinkByUid, unlink } from '@/lib/wa/links';

export const runtime = 'nodejs';

async function uidFrom(req: Request): Promise<string | null> {
  const m = /^Bearer (.+)$/i.exec(req.headers.get('authorization') ?? '');
  if (!m) return null;
  try {
    return (await adminAuth().verifyIdToken(m[1])).uid;
  } catch {
    return null;
  }
}

const unauthorized = () => Response.json({ error: 'unauthorized' }, { status: 401 });

function mask(waId: string): string {
  return waId.length > 5 ? `+${waId.slice(0, 2)}${'*'.repeat(waId.length - 5)}${waId.slice(-3)}` : '+***';
}

export async function POST(req: Request) {
  const uid = await uidFrom(req);
  if (!uid) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { timezone?: string };
  const { code, waUrl } = await createLinkCode(uid, typeof body.timezone === 'string' ? body.timezone : undefined);
  return Response.json({ code, waUrl });
}

export async function GET(req: Request) {
  const uid = await uidFrom(req);
  if (!uid) return unauthorized();
  const l = await getLinkByUid(uid);
  if (!l) return Response.json({ linked: false });
  return Response.json({
    linked: true,
    waId: mask(l.waId),
    checkinTime: l.checkinTime,
    recapTime: l.recapTime,
    friendAlerts: l.friendAlerts,
  });
}

export async function DELETE(req: Request) {
  const uid = await uidFrom(req);
  if (!uid) return unauthorized();
  const l = await getLinkByUid(uid);
  if (l) await unlink(l.waId);
  return Response.json({ linked: false });
}
