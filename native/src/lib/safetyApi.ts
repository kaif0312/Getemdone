/**
 * Report + block (App Store guideline 1.2). The server does the work (contract: the server repo's AGENTS.md, "Safety"):
 *   POST {API_BASE}/api/app/report { kind:'comment'|'user', targetUid, reason, note?, taskId?, commentId?, contentSeen? } -> { ok, reportId }
 *   POST {API_BASE}/api/app/block  { uid, block } -> { ok }
 * Auth: `Authorization: Bearer <Firebase ID token>`. A report that cannot reach the server is written straight to
 * `reports/{id}` (firestore.rules allow a create-only write by the reporter), so it is never lost; that path has no
 * WhatsApp alert, the owner sees it in the console.
 */
import { addDoc, collection } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { API_BASE } from '@/lib/config';

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';
export const REPORT_REASONS: { id: ReportReason; title: string; subtitle: string }[] = [
  { id: 'spam', title: 'Spam', subtitle: 'Ads, scams, the same thing again and again' },
  { id: 'harassment', title: 'Harassment or bullying', subtitle: 'Insults, threats, picking on someone' },
  { id: 'inappropriate', title: 'Inappropriate', subtitle: 'Sexual, violent, hateful or otherwise not OK' },
  { id: 'other', title: 'Something else', subtitle: 'Tell us in the note' },
];

export interface ReportInput {
  kind: 'comment' | 'user';
  targetUid: string;
  reason: ReportReason;
  note?: string;
  taskId?: string;
  commentId?: string;
  /** The comment as you saw it (decrypted). */
  contentSeen?: string;
}

export type SafetyError = 'unauthorized' | 'bad_request' | 'not_found' | 'self' | 'rate_limited' | 'network' | 'failed';

async function post(path: string, body: unknown): Promise<{ ok?: boolean; error?: string; reportId?: string; status: number }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return { error: 'unauthorized', status: 401 };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; reportId?: string };
    return res.ok ? { ...json, status: res.status } : { ...json, error: json.error ?? 'failed', status: res.status };
  } catch {
    return { error: 'network', status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

const clip = (s: string | undefined, n: number) => (s ? Array.from(s.trim()).slice(0, n).join('') : '');

export async function reportContent(input: ReportInput): Promise<{ ok: true } | { ok: false; error: SafetyError }> {
  const body = { ...input, note: clip(input.note, 500) || undefined, contentSeen: clip(input.contentSeen, 1000) || undefined };
  const r = await post('/api/app/report', body);
  if (r.ok) return { ok: true };
  // Server unreachable (offline, or a 5xx): keep the report anyway.
  if (r.error === 'network' || r.status >= 500) {
    const uid = auth.currentUser?.uid;
    if (!uid) return { ok: false, error: 'unauthorized' };
    try {
      const doc: Record<string, unknown> = {
        reporterUid: uid, targetUid: input.targetUid, kind: input.kind, reason: input.reason, status: 'open', createdAt: Date.now(), source: 'app',
      };
      if (body.note) doc.note = body.note;
      if (input.taskId) doc.taskId = input.taskId;
      if (input.commentId) doc.commentId = input.commentId;
      if (body.contentSeen) doc.contentSeen = body.contentSeen;
      await addDoc(collection(db, 'reports'), doc);
      return { ok: true };
    } catch {
      return { ok: false, error: 'network' };
    }
  }
  return { ok: false, error: (r.error as SafetyError) ?? 'failed' };
}

export async function setBlockedApi(uid: string, block: boolean): Promise<{ ok: true } | { ok: false; error: SafetyError }> {
  const r = await post('/api/app/block', { uid, block });
  if (r.ok) return { ok: true };
  return { ok: false, error: (r.error as SafetyError) ?? 'failed' };
}

export function safetyErrorText(e: SafetyError): string {
  switch (e) {
    case 'rate_limited': return 'Too many reports today. Try again tomorrow.';
    case 'not_found': return 'That account is gone.';
    case 'self': return "That's you.";
    case 'unauthorized': return 'Sign in again.';
    case 'network': return "Can't reach Nudge. Check your connection.";
    default: return 'That did not work. Try again.';
  }
}

/** The one line shown wherever people can comment (App Store 1.2: users must know they can report and block). */
export const SAFETY_LINE = 'Report or block anyone who bothers you; we review reports within 24 hours.';
