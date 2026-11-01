// Receives WhatsApp events forwarded by the Iskaria console (HMAC-signed with NUDGE_FORWARD_SECRET).
import { after } from 'next/server';
import { handleMessage } from '@/lib/bot/handle';
import { parseForwarded, verifySignature } from '@/lib/wa/inbound';
import { getLink, updateLink } from '@/lib/wa/links';
import { markRead } from '@/lib/wa/send';
import { claimMessage } from '@/lib/wa/sessions';
import type { ForwardedEvent, InboundMessage } from '@/lib/wa/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function processOne(msg: InboundMessage): Promise<void> {
  try {
    if (!(await claimMessage(msg.id))) return; // Meta retry
    if (await getLink(msg.from)) {
      await updateLink(msg.from, { lastInboundAt: Date.now() });
    }
    await markRead(msg.id, true);
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
  const { messages } = parseForwarded(body);
  if (messages.length) {
    after(async () => {
      for (const m of messages) await processOne(m);
    });
  }
  return Response.json({ ok: true, received: messages.length });
}
