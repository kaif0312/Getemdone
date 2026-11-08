// Settings -> Routines (web) and the phone app. Auth: Authorization: Bearer <Firebase ID token>.
//   GET                          -> { routines: RoutineView[] } (with today's state and streak)
//   POST   { title, time, days? }    -> create (same title = change)        time "HH:mm" or "10pm"; days: [0-6] or ["weekdays"]
//   PUT    { id, title?, time?, days? } -> edit
//   PATCH  { id, status: 'done'|'skipped' } -> mark today's occurrence
//   DELETE ?id=<id>              -> remove
import { adminAuth, adminDb } from '@/lib/server/firebaseAdmin';
import { getLinkByUid } from '@/lib/wa/links';
import { DEFAULT_TIMEZONE } from '@/lib/server/users';
import { deactivateRoutine, editRoutine, markToday, routinesView, upsertRoutine } from '@/lib/server/routines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

async function tzOf(uid: string): Promise<string> {
  const [link, u] = await Promise.all([getLinkByUid(uid), adminDb().doc(`users/${uid}`).get()]);
  return link?.timezone || ((u.data() as { timezone?: string } | undefined)?.timezone) || DEFAULT_TIMEZONE;
}

const fail = (reason: string) => Response.json({ error: reason }, { status: reason === 'not_found' ? 404 : 400 });

export async function GET(req: Request) {
  const uid = await uidFrom(req);
  if (!uid) return unauthorized();
  return Response.json({ routines: await routinesView(uid, Date.now(), await tzOf(uid)) });
}

export async function POST(req: Request) {
  const uid = await uidFrom(req);
  if (!uid) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { title?: string; time?: string; days?: unknown };
  const r = await upsertRoutine(uid, { title: String(b.title ?? ''), time: String(b.time ?? ''), days: b.days });
  return r.ok ? Response.json({ routine: r.routine }) : fail(r.reason);
}

export async function PUT(req: Request) {
  const uid = await uidFrom(req);
  if (!uid) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { id?: string; title?: string; time?: string; days?: unknown };
  if (!b.id) return fail('not_found');
  const r = await editRoutine(uid, b.id, { title: b.title, time: b.time, days: b.days });
  return r.ok ? Response.json({ routine: r.routine }) : fail(r.reason);
}

export async function PATCH(req: Request) {
  const uid = await uidFrom(req);
  if (!uid) return unauthorized();
  const b = (await req.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!b.id || (b.status !== 'done' && b.status !== 'skipped')) return fail('bad_request');
  const r = await markToday(uid, b.id, b.status, Date.now(), await tzOf(uid));
  return r.ok ? Response.json({ ok: true, streak: r.streak }) : fail('not_found');
}

export async function DELETE(req: Request) {
  const uid = await uidFrom(req);
  if (!uid) return unauthorized();
  const id = new URL(req.url).searchParams.get('id') ?? '';
  return (await deactivateRoutine(uid, id)) ? Response.json({ ok: true }) : fail('not_found');
}
