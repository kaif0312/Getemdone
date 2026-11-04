// Read side of the vault audit trail (Firestore `vaultUploads`, written by lib/vault/index.ts and app/api/vault/done).
import { adminDb } from '@/lib/server/firebaseAdmin';
import type { VaultItem } from '@/lib/bot/types';

/** The sender's newest vault items. One equality filter, sorted here: no composite index needed. */
export async function listVaultFiles(wa: string, limit: number): Promise<VaultItem[]> {
  const snap = await adminDb().collection('vaultUploads').where('from', '==', wa).limit(200).get();
  return snap.docs
    .map((d) => d.data() as { name?: unknown; bytes?: unknown; at?: unknown })
    .filter((x) => typeof x.name === 'string' && typeof x.at === 'number')
    .map((x) => ({ name: x.name as string, bytes: typeof x.bytes === 'number' ? x.bytes : 0, at: x.at as number }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}
