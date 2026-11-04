/**
 * WhatsApp link state + actions for Me.
 * Linked = `users/{uid}.whatsapp.waId` (written by the bot when it redeems `LINK <code>`; the live profile snapshot flips the UI).
 * Code creation goes through the SAME endpoint the PWA uses (POST /api/wa/link-code, Bearer Firebase ID token), because
 * `waLinkCodes` is server-only in the rules. Disconnect = DELETE on the same endpoint.
 */
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { auth } from '@/lib/firebase';
import { API_BASE } from '@/lib/config';
import { deviceZone } from '@/lib/dates';
import { useAuth } from '@/hooks/useAuth';
import { coachChatUrl } from './links';

export interface LinkCode {
  code: string;
  waUrl: string;
}

async function call(method: 'POST' | 'DELETE', body?: unknown): Promise<Record<string, unknown>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Not signed in.');
  const res = await fetch(`${API_BASE}/api/wa/link-code`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return (await res.json()) as Record<string, unknown>;
}

/** "+96*****617" style, never the full number. */
export function maskWaId(waId: string): string {
  return waId.length > 5 ? `+${waId.slice(0, 2)}${'*'.repeat(waId.length - 5)}${waId.slice(-3)}` : '+***';
}

export function useWhatsAppLink() {
  const { profile } = useAuth();
  const waId = (profile as { whatsapp?: { waId?: string } } | null)?.whatsapp?.waId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState<LinkCode | null>(null);

  /** Create a one-time code and open WhatsApp with `LINK <code>` prefilled. */
  const startLink = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      const r = (await call('POST', { timezone: deviceZone() })) as unknown as LinkCode;
      if (!r.code) throw new Error('No code came back.');
      const link = { code: r.code, waUrl: r.waUrl || coachChatUrl(`LINK ${r.code}`) };
      setCode(link);
      await Linking.openURL(link.waUrl);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disconnect = useCallback(async (): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      await call('DELETE');
      setCode(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not disconnect. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { linked: !!waId, masked: waId ? maskWaId(waId) : '', busy, error, code, startLink, disconnect };
}
