// Receives WhatsApp events forwarded by the Iskaria console (HMAC-signed with NUDGE_FORWARD_SECRET).
import { after } from 'next/server';
import { handleMessage } from '@/lib/bot/handle';
import { tryVault } from '@/lib/vault';
import { parseForwarded, verifySignature } from '@/lib/wa/inbound';
import { claimMessage } from '@/lib/wa/sessions';
import type { ForwardedEvent, InboundMessage } from '@/lib/wa/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function processOne(msg: InboundMessage): Promise<void> {
  try {
    if (!(await claimMessage(msg.id))) return; // Meta retry
    if (await tryVault(msg)) return; // file vault allowlist (Fairooz and co): files go to Drive, no Nudge account needed
    // handleMessage itself marks the message read and records lastInboundAt (lib/bot/core.ts).
    await handleMessage(msg);
  } catch (e) {
    console.error('[wa/inbound] message failed', msg.id, e);
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get('x-nudge-signature'))) {
    return new Response('bad signature', { status: 401 });
  }
  let body: ForwardedEvent;
  try {
    body = JSON.parse(raw) as ForwardedEvent;
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const { messages, statuses } = parseForwarded(body);
  // Shape-only diagnostic (no message content): events that produce no messages, or carry a Meta error code, are the ones
  // we can't explain from the reply alone (e.g. 131052 = media over 100 MB).
  if ((!messages.length && !statuses.length) || messages.some((m) => m.errorCode)) {
    const v = (body.value ?? {}) as Record<string, unknown>;
    console.log('[wa/inbound] event shape', JSON.stringify({ keys: Object.keys(v), msgs: messages.map((m) => ({ t: m.type, e: m.errorCode })), errors: v.errors ?? null }).slice(0, 800));
  }
  if (messages.length) {
    after(async () => {
      for (const m of messages) await processOne(m);
    });
  }
  return Response.json({ ok: true, received: messages.length });
}
