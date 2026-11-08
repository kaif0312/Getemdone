/**
 * Routines API (server: app/api/routines/route.ts in the web app, AGENTS.md "Routines"). Bearer = Firebase ID token.
 *   GET -> { routines }   POST { title, time, days? }   PUT { id, title?, time?, days? }   PATCH { id, status }   DELETE ?id=
 * Errors come back as { error: 'bad_time' | 'no_title' | 'too_many' | 'not_found' | ... }.
 */
import { auth } from '@/lib/firebase';
import { API_BASE } from '@/lib/config';

export interface Routine {
  id: string;
  title: string;
  /** "HH:mm", 24h. */
  time: string;
  /** 0 = Sunday. Empty = every day. */
  days: number[];
  today: 'none' | 'sent' | 'done' | 'skipped';
  runsToday: boolean;
  streak: number;
}

export class RoutinesApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function call<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown, query = ''): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new RoutinesApiError('unauthorized', 401);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(`${API_BASE}/api/routines${query}`, {
      method,
      signal: ctl.signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new RoutinesApiError(json.error ?? 'failed', res.status);
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

export const listRoutines = () => call<{ routines: Routine[] }>('GET').then((r) => r.routines);
export const createRoutine = (b: { title: string; time: string; days: number[] }) => call<unknown>('POST', b);
export const editRoutine = (b: { id: string; title: string; time: string; days: number[] }) => call<unknown>('PUT', b);
export const markRoutine = (id: string, status: 'done' | 'skipped') => call<{ ok: boolean; streak?: number }>('PATCH', { id, status });
export const deleteRoutine = (id: string) => call<unknown>('DELETE', undefined, `?id=${encodeURIComponent(id)}`);

/** Short, strict copy for a server error code. */
export function routineErrorText(e: unknown): string {
  const code = e instanceof RoutinesApiError ? e.code : '';
  if (code === 'bad_time') return 'Pick a valid time.';
  if (code === 'no_title') return 'Give it a name.';
  if (code === 'too_many') return 'You have 20 routines already.';
  if (code === 'not_found') return 'That routine is gone. Pull to refresh.';
  if (code === 'unauthorized') return 'Please sign in again.';
  return 'That did not work. Try again.';
}
