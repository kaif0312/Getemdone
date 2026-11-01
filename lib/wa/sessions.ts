// OWNER: agent "transport". waSessions/{waId} (short bot memory) + inbound dedupe (waSeen/{messageId}).
import type { WaSession } from './types';

export async function getSession(waId: string): Promise<WaSession> { throw new Error('TODO' + waId); }
export async function saveSession(waId: string, s: WaSession): Promise<void> { throw new Error('TODO' + waId + s); }
/** Returns false if this message id was already processed (Meta retries). */
export async function claimMessage(messageId: string): Promise<boolean> { throw new Error('TODO' + messageId); }
