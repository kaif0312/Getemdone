'use client';

// Meetings state. Read: Firestore listener on the owner's meetings; on listener error (rules not deployed) fall back to
// GET /api/meetings, refreshed every 60 s while the tab is visible. Writes go through the API only.
import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { Meeting } from '@/lib/meetings/types';
import { cancelMeeting, createMeeting, listMeetings } from '@/components/meetings/api';
import type { CreateResult } from '@/components/meetings/api';
import { toCreateBody } from '@/components/meetings/view';
import type { NewMeetingDraft } from '@/components/meetings/view';

export interface UseMeetings {
  meetings: Meeting[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  refresh: () => Promise<void>;
  create: (draft: NewMeetingDraft) => Promise<CreateResult>;
  cancel: (id: string) => Promise<void>;
}

export function useMeetings(): UseMeetings {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<'listener' | 'poll'>('listener');
  const [nonce, setNonce] = useState(0);
  const fromListener = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listMeetings();
      setMeetings(list);
      setError(false);
    } catch {
      if (!fromListener.current) setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Firestore listener
  useEffect(() => {
    if (!uid) { setMeetings([]); setLoading(false); return; }
    if (mode !== 'listener') return;
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'meetings'), where('ownerUid', '==', uid)),
      (snap) => {
        fromListener.current = true;
        setMeetings(snap.docs.map((d) => ({ ...(d.data() as Meeting), id: d.id })));
        setError(false);
        setLoading(false);
      },
      () => { fromListener.current = false; setMode('poll'); },
    );
    return unsub;
  }, [uid, mode, nonce]);

  // GET fallback: now, then every 60 s while visible, and when the tab comes back.
  useEffect(() => {
    if (!uid || mode !== 'poll') return;
    refresh();
    const tick = () => { if (!document.hidden) refresh(); };
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [uid, mode, nonce, refresh]);

  const retry = useCallback(() => { setError(false); setLoading(true); setMode('listener'); setNonce((n) => n + 1); }, []);

  const create = useCallback(async (draft: NewMeetingDraft) => {
    const r = await createMeeting(toCreateBody(draft));
    if (mode === 'poll') {
      setMeetings((prev) => [...prev.filter((m) => m.id !== r.meeting.id), r.meeting]);
    }
    return r;
  }, [mode]);

  const cancel = useCallback(async (id: string) => {
    let before: Meeting | undefined;
    setMeetings((prev) => prev.map((m) => { if (m.id === id) { before = m; return { ...m, status: 'cancelled' as const }; } return m; }));
    try {
      await cancelMeeting(id);
    } catch (e) {
      const restore = before;
      if (restore) setMeetings((prev) => prev.map((m) => (m.id === id ? restore : m)));
      throw e;
    }
  }, []);

  return { meetings, loading, error, retry, refresh, create, cancel };
}
