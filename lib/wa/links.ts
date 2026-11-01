// OWNER: agent "transport". Linking a WhatsApp number to a Nudge uid. Docs: waLinks/{waId}, waLinkCodes/{code}, users/{uid}.whatsapp.
import type { WaLink } from './types';

/** 6-char code (no 0/O/1/I), 10 min, single use. Called by POST /api/wa/link-code (Firebase ID token auth). */
export async function createLinkCode(uid: string, timezone?: string): Promise<{ code: string; waUrl: string }> { throw new Error('TODO' + uid + timezone); }
/** Consume a code from "LINK ABC123"; creates waLinks/{waId}. Re-linking a number to another uid replaces the old link. */
export async function redeemLinkCode(waId: string, code: string): Promise<{ ok: true; link: WaLink } | { ok: false; reason: 'invalid' | 'expired' }> { throw new Error('TODO' + waId + code); }
export async function getLink(waId: string): Promise<WaLink | null> { throw new Error('TODO' + waId); }
export async function getLinkByUid(uid: string): Promise<WaLink | null> { throw new Error('TODO' + uid); }
export async function updateLink(waId: string, patch: Partial<WaLink>): Promise<void> { throw new Error('TODO' + waId + patch); }
export async function unlink(waId: string): Promise<void> { throw new Error('TODO' + waId); }
/** All linked, non-muted users (for the scheduler). */
export async function listLinks(): Promise<WaLink[]> { throw new Error('TODO'); }
