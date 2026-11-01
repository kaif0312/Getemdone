// OWNER: agent "transport". Linking a WhatsApp number to a Nudge uid. Docs: waLinks/{waId}, waLinkCodes/{code}, users/{uid}.whatsapp.
import { randomInt } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/server/firebaseAdmin';
import { timezoneForWaId } from '@/lib/server/users';
import type { WaLink } from './types';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_TTL_MS = 10 * 60_000;
const DEFAULT_TZ = 'Asia/Kolkata';

function validZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Tiny local fallback used if lib/server/users.ts timezoneForWaId is not implemented yet. */
const CC_ZONES: [string, string][] = [
  ['971', 'Asia/Dubai'], ['965', 'Asia/Kuwait'], ['966', 'Asia/Riyadh'], ['974', 'Asia/Qatar'], ['968', 'Asia/Muscat'],
  ['973', 'Asia/Bahrain'], ['91', 'Asia/Kolkata'], ['92', 'Asia/Karachi'], ['94', 'Asia/Colombo'], ['44', 'Europe/London'],
  ['1', 'America/New_York'],
];

function fallbackZone(waId: string): string {
  try {
    const tz = timezoneForWaId(waId);
    if (validZone(tz)) return tz;
  } catch {
    /* stub or failure: use the local map */
  }
  return CC_ZONES.find(([cc]) => waId.startsWith(cc))?.[1] ?? DEFAULT_TZ;
}

function makeCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}

export function waLinkUrl(code: string): string {
  return `https://wa.me/${process.env.NUDGE_WA_NUMBER ?? ''}?text=` + encodeURIComponent(`LINK ${code}`);
}

/** 6-char code (no 0/O/1/I), 10 min, single use. Called by POST /api/wa/link-code (Firebase ID token auth). */
export async function createLinkCode(uid: string, timezone?: string): Promise<{ code: string; waUrl: string }> {
  const db = adminDb();
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = makeCode();
    try {
      await db.doc(`waLinkCodes/${code}`).create({
        uid,
        timezone: validZone(timezone) ? timezone : '',
        expiresAt: Date.now() + CODE_TTL_MS,
        usedAt: null,
      });
      return { code, waUrl: waLinkUrl(code) };
    } catch (e) {
      const code2 = (e as { code?: number | string }).code;
      if (code2 === 6 || code2 === 'already-exists') continue; // collision: try another
      throw e;
    }
  }
  throw new Error('could not allocate a link code');
}

/** Consume a code from "LINK ABC123"; creates waLinks/{waId}. Re-linking a number to another uid replaces the old link. */
export async function redeemLinkCode(waId: string, code: string): Promise<{ ok: true; link: WaLink } | { ok: false; reason: 'invalid' | 'expired' }> {
  const norm = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(norm)) return { ok: false, reason: 'invalid' };
  const db = adminDb();
  const codeRef = db.doc(`waLinkCodes/${norm}`);
  const linkRef = db.doc(`waLinks/${waId}`);

  return db.runTransaction(async (tx) => {
    const codeSnap = await tx.get(codeRef);
    if (!codeSnap.exists) return { ok: false as const, reason: 'invalid' as const };
    const c = codeSnap.data() as { uid: string; timezone?: string; expiresAt: number; usedAt: number | null };
    if (c.usedAt) return { ok: false as const, reason: 'invalid' as const };
    if (Date.now() > c.expiresAt) return { ok: false as const, reason: 'expired' as const };

    const userRef = db.doc(`users/${c.uid}`);
    const [existing, userSnap] = await Promise.all([tx.get(linkRef), tx.get(userRef)]);
    const oldWaId = (userSnap.data()?.whatsapp as { waId?: string } | undefined)?.waId;
    const prev = existing.exists ? (existing.data() as WaLink) : null;
    // The number was linked to a different account: that account loses its pointer.
    const prevUserRef = prev && prev.uid !== c.uid ? db.doc(`users/${prev.uid}`) : null;
    const prevUserSnap = prevUserRef ? await tx.get(prevUserRef) : null;

    const now = Date.now();
    const sameAccount = prev?.uid === c.uid;
    const link: WaLink = {
      waId,
      uid: c.uid,
      linkedAt: now,
      lastInboundAt: now,
      timezone: validZone(c.timezone) ? c.timezone : fallbackZone(waId),
      checkinTime: sameAccount ? prev.checkinTime : '08:00',
      recapTime: sameAccount ? prev.recapTime : '21:00',
      friendAlerts: sameAccount ? prev.friendAlerts : true,
      muted: false,
    };

    tx.set(linkRef, link);
    tx.update(codeRef, { usedAt: now, usedBy: waId });
    tx.set(userRef, { whatsapp: { waId, linkedAt: now }, timezone: link.timezone }, { merge: true });
    if (oldWaId && oldWaId !== waId) tx.delete(db.doc(`waLinks/${oldWaId}`));
    if (prevUserRef && prevUserSnap?.exists && (prevUserSnap.data()?.whatsapp as { waId?: string } | undefined)?.waId === waId) {
      tx.update(prevUserRef, { whatsapp: FieldValue.delete() });
    }
    return { ok: true as const, link };
  });
}

export async function getLink(waId: string): Promise<WaLink | null> {
  const s = await adminDb().doc(`waLinks/${waId}`).get();
  return s.exists ? (s.data() as WaLink) : null;
}

export async function getLinkByUid(uid: string): Promise<WaLink | null> {
  const q = await adminDb().collection('waLinks').where('uid', '==', uid).limit(1).get();
  return q.empty ? null : (q.docs[0].data() as WaLink);
}

export async function updateLink(waId: string, patch: Partial<WaLink>): Promise<void> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && k !== 'waId' && k !== 'uid') clean[k] = v;
  }
  if (!Object.keys(clean).length) return;
  await adminDb().doc(`waLinks/${waId}`).update(clean);
}

export async function unlink(waId: string): Promise<void> {
  const db = adminDb();
  const ref = db.doc(`waLinks/${waId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const uid = (snap.data() as WaLink).uid;
  await ref.delete();
  const userRef = db.doc(`users/${uid}`);
  const u = await userRef.get();
  if (u.exists && (u.data()?.whatsapp as { waId?: string } | undefined)?.waId === waId) {
    await userRef.update({ whatsapp: FieldValue.delete() });
  }
}

/** All linked, non-muted users (for the scheduler). */
export async function listLinks(): Promise<WaLink[]> {
  const q = await adminDb().collection('waLinks').get();
  return q.docs.map((d) => d.data() as WaLink).filter((l) => !l.muted);
}
