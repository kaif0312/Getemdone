/**
 * My meetings (owned): live Firestore listener on `meetings` where ownerUid == uid (single field, no composite index).
 * If the listener errors (rules not deployed -> permission-denied) it falls back to GET /api/meetings, re-run when the app
 * returns to the foreground and every 60 s while active. Writes only go through the API (the client never writes `meetings`).
 *
 *   const { meetings, loading, error, retry, refresh, create, cancel } = useMeetings();
 *
 * `meetings` is raw (cancelled and ended included): filter with upcoming()/groupMeetings() from features/meetings/view.
 * Events (doc kind 'event', 2026-11-07) arrive on the same listener and are split off into `events` (raw too; expand repeats with
 * features/events/view). They are never in `meetings`, so the Meetings screens stay meetings only.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cancelMeetingApi, createMeeting, listMeetings, MeetingsApiError } from '@/lib/meetingsApi';
import { cancelEventApi, createEventApi, listEventsApi, updateEventApi } from '@/lib/eventsApi';
import { toEventBody, toEventPatch, type EventDraft } from '@/features/events/view';
import { toCreateBody, type NewMeetingDraft } from '@/features/meetings/view';
import type { CalendarStatus, Meeting, UpdateEventRequest } from '@/lib/meetingsTypes';
import { useAuth } from './useAuth';

interface MeetingsApi {
  meetings: Meeting[];
  /** Events (kind 'event'), raw: cancelled ones included. */
  events: Meeting[];
  loading: boolean;
  error: boolean;
  retry: () => void;
  refresh: () => Promise<void>;
  create: (draft: NewMeetingDraft) => Promise<{ meeting: Meeting; calendar: CalendarStatus }>;
  cancel: (id: string) => Promise<void>;
  createEvent: (draft: EventDraft) => Promise<Meeting>;
  updateEvent: (id: string, patch: UpdateEventRequest) => Promise<Meeting>;
  /** `date` (YYYY-MM-DD) cancels one day of a repeating event; omitted cancels the event / the whole series. */
  cancelEvent: (id: string, date?: string) => Promise<void>;
}

const Ctx = createContext<MeetingsApi | null>(null);

function useMeetingsState(): MeetingsApi {
  const { uid } = useAuth();
  const [live, setLive] = useState<Meeting[] | null>(null);
  const [fallback, setFallback] = useState<Meeting[] | null>(null);
  const [listenerFailed, setListenerFailed] = useState(false);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [cancelled, setCancelled] = useState<Record<string, true>>({});
  const [attempt, setAttempt] = useState(0);
  const failedRef = useRef(false);
  failedRef.current = listenerFailed;

  useEffect(() => {
    setLive(null);
    setFallback(null);
    setListenerFailed(false);
    setFetchFailed(false);
    setCancelled({});
    if (!uid) return;
    return onSnapshot(
      query(collection(db, 'meetings'), where('ownerUid', '==', uid)),
      (snap) => {
        setLive(snap.docs.map((d) => ({ ...(d.data() as Meeting), id: d.id })));
        setListenerFailed(false);
        setCancelled({});
      },
      (e) => {
        console.warn('[meetings] listener', e?.code ?? e);
        setListenerFailed(true);
      },
    );
  }, [uid, attempt]);

  const fetchList = useCallback(async () => {
    try {
      const [ms, es] = await Promise.all([listMeetings(), listEventsApi()]);
      setFallback([...ms, ...es]);
      setFetchFailed(false);
    } catch (e) {
      console.warn('[meetings] fallback', e instanceof MeetingsApiError ? e.code : e);
      setFetchFailed(true);
    }
  }, []);

  // Fallback polling: only while the listener is not working.
  useEffect(() => {
    if (!uid || !listenerFailed) return;
    void fetchList();
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(() => void fetchList(), 60_000); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') { void fetchList(); start(); } else stop();
    });
    return () => { stop(); sub.remove(); };
  }, [uid, listenerFailed, fetchList, attempt]);

  const all = useMemo(() => {
    const base = (listenerFailed ? fallback : live) ?? [];
    return base.map((m) => (cancelled[m.id] ? { ...m, status: 'cancelled' as const } : m));
  }, [listenerFailed, fallback, live, cancelled]);
  const meetings = useMemo(() => all.filter((m) => m.kind !== 'event'), [all]);
  const events = useMemo(() => all.filter((m) => m.kind === 'event'), [all]);

  const loading = !!uid && (listenerFailed ? fallback === null && !fetchFailed : live === null);
  const error = listenerFailed && fetchFailed && fallback === null;

  const refresh = useCallback(async () => {
    if (failedRef.current) await fetchList();
  }, [fetchList]);

  const retry = useCallback(() => {
    setFetchFailed(false);
    setAttempt((a) => a + 1);
  }, []);

  const create = useCallback(async (draft: NewMeetingDraft) => {
    const r = await createMeeting(toCreateBody(draft));
    if (failedRef.current) void fetchList();
    return r;
  }, [fetchList]);

  const cancel = useCallback(async (id: string) => {
    setCancelled((c) => ({ ...c, [id]: true }));
    try {
      await cancelMeetingApi(id);
      if (failedRef.current) void fetchList();
    } catch (e) {
      setCancelled((c) => { const n = { ...c }; delete n[id]; return n; });
      throw e;
    }
  }, [fetchList]);

  const createEvent = useCallback(async (draft: EventDraft) => {
    const r = await createEventApi(toEventBody(draft));
    if (failedRef.current) void fetchList();
    return r;
  }, [fetchList]);

  const updateEvent = useCallback(async (id: string, patch: UpdateEventRequest) => {
    const r = await updateEventApi(id, patch);
    if (failedRef.current) void fetchList();
    return r;
  }, [fetchList]);

  const cancelEvent = useCallback(async (id: string, date?: string) => {
    if (!date) setCancelled((c) => ({ ...c, [id]: true }));
    try {
      await cancelEventApi(id, date);
      if (failedRef.current) void fetchList();
    } catch (e) {
      setCancelled((c) => { const n = { ...c }; delete n[id]; return n; });
      throw e;
    }
  }, [fetchList]);

  return { meetings, events, loading, error, retry, refresh, create, cancel, createEvent, updateEvent, cancelEvent };
}

export function MeetingsProvider({ children }: { children: React.ReactNode }) {
  const value = useMeetingsState();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMeetings(): MeetingsApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMeetings must be used inside <MeetingsProvider>');
  return v;
}
