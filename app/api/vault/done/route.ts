// The Iskaria console calls this when a big-file upload (the link page) has finished, so the person gets the same
// WhatsApp confirmation as for small files. HMAC-signed with NUDGE_FORWARD_SECRET like /api/wa/inbound.
import { adminDb } from '@/lib/server/firebaseAdmin';
import { sendText } from '@/lib/wa/send';
import { verifySignature } from '@/lib/wa/inbound';
import { vaultFolderFor } from '@/lib/vault';

export const runtime = 'nodejs';

function mb(n: number): string {
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`;
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-nudge-signature'))) return new Response('bad signature', { status: 401 });
  let b: { wa?: unknown; name?: unknown; fileName?: unknown; size?: unknown; fileId?: unknown };
  try {
    b = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const wa = typeof b.wa === 'string' ? b.wa : '';
  const fileName = typeof b.fileName === 'string' ? b.fileName.slice(0, 200) : '';
  const size = typeof b.size === 'number' && Number.isFinite(b.size) ? b.size : 0;
  // Only vault users (allowlist or a linked Nudge account), even with a valid signature.
  const who = wa && fileName ? await vaultFolderFor(wa) : null;
  if (!who) return new Response('not allowed', { status: 403 });

  await adminDb()
    .collection('vaultUploads')
    .add({ via: 'link', from: wa, who, name: fileName, driveId: typeof b.fileId === 'string' ? b.fileId : null, bytes: size, at: Date.now() })
    .catch((e) => console.error('[vault/done] audit write failed', e));
  // Free-form text only works inside 24 h of their last message; a failure here must not fail the request.
  await sendText(wa, `✅ Saved to Drive: ${fileName}${size ? ` (${mb(size)})` : ''}`).catch((e) => console.error('[vault/done] confirm failed', e));
  return Response.json({ ok: true });
}
