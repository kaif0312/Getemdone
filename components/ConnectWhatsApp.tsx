'use client';

import { useCallback, useEffect, useState } from 'react';
import { FaWhatsapp } from 'react-icons/fa';
import { auth } from '@/lib/firebase';

interface Status {
  linked: boolean;
  waId?: string;
}

async function call(method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('not signed in');
  const res = await fetch('/api/wa/link-code', {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return res.json();
}

export default function ConnectWhatsApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setStatus(await call('GET'));
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const { waUrl } = await call('POST', { timezone: tz });
      window.open(waUrl, '_blank', 'noopener');
    } catch {
      setError('Could not start. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError('');
    try {
      await call('DELETE');
      setStatus({ linked: false });
    } catch {
      setError('Could not disconnect. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full px-4 py-3 flex items-center gap-3">
      <FaWhatsapp size={18} className="text-success" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-fg-secondary">Nudge on WhatsApp</div>
        <div className="text-xs text-fg-tertiary">
          {error || (status?.linked ? `Connected · ${status.waId}` : 'Add tasks and check in from WhatsApp')}
        </div>
      </div>
      {status?.linked ? (
        <button onClick={disconnect} disabled={busy} className="text-xs text-error disabled:opacity-50">
          Disconnect
        </button>
      ) : (
        <button onClick={connect} disabled={busy} className="text-xs text-primary disabled:opacity-50">
          Connect WhatsApp
        </button>
      )}
    </div>
  );
}
