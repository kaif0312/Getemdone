// OWNER: agent "brain". Entry point for one inbound message from a WhatsApp user (linked or not).
// Called by app/api/wa/inbound/route.ts after dedupe. Must reply via lib/wa/send.ts; never throws to the caller.
import type { InboundMessage } from '@/lib/wa/types';
import { handleWith } from './core';
import { defaultDeps } from './deps';

export async function handleMessage(msg: InboundMessage): Promise<void> {
  await handleWith(defaultDeps, msg);
}
