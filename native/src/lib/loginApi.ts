/**
 * WhatsApp login API (built by the server agent; this file codes against the contract in docs/NATIVE_APP_PLAN.md):
 *   POST {API_BASE}/api/app/login/start            -> { code, waLink, pollToken, expiresAt }
 *   GET  {API_BASE}/api/app/login/poll?t=<token>   -> { status:'pending' } | { status:'done', customToken } | { status:'expired' }
 */
import { API_BASE } from './config';

export interface LoginStart {
  code: string;
  waLink: string;
  pollToken: string;
  expiresAt: number;
}
export type LoginPoll = { status: 'pending' } | { status: 'done'; customToken: string } | { status: 'expired' };

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 12000): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function startWhatsAppLogin(): Promise<LoginStart> {
  return fetchJson<LoginStart>(`${API_BASE}/api/app/login/start`, { method: 'POST', body: '{}' });
}

export function pollWhatsAppLogin(pollToken: string): Promise<LoginPoll> {
  return fetchJson<LoginPoll>(`${API_BASE}/api/app/login/poll?t=${encodeURIComponent(pollToken)}`);
}
