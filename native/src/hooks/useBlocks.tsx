/**
 * Who I blocked: live `blocks/{uid}` doc ({ uids }), readable only by me, written only by the server
 * (POST /api/app/block, lib/server/moderation.ts). One listener, mounted in app/_layout.tsx ABOVE Tasks/Friends/Inbox, which
 * use `blockedSet` to hide blocked people's comments, reactions and notifications.
 *
 *   const { blocked, blockedSet, isBlocked, block, unblock } = useBlocks();
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { setBlockedApi, type SafetyError } from '@/lib/safetyApi';
import { useAuth } from './useAuth';

function useBlocksState() {
  const { uid } = useAuth();
  const [blocked, setBlocked] = useState<string[]>([]);
  // Optimistic overlay so the UI reacts at once, before the server write echoes back through the listener.
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setPending({});
    if (!uid) {
      setBlocked([]);
      return;
    }
    return onSnapshot(
      doc(db, 'blocks', uid),
      (snap) => {
        const u = snap.data()?.uids;
        setBlocked(Array.isArray(u) ? u.filter((x): x is string => typeof x === 'string') : []);
        setPending({});
      },
      // Missing rules (not deployed yet) or offline: nothing blocked is the safe default for reading.
      () => setBlocked([]),
    );
  }, [uid]);

  const effective = useMemo(() => {
    const s = new Set(blocked);
    for (const [id, on] of Object.entries(pending)) {
      if (on) s.add(id);
      else s.delete(id);
    }
    return s;
  }, [blocked, pending]);
  const key = useMemo(() => [...effective].sort().join(','), [effective]);
  // Stable identity while the contents are the same, so the consumers' memos do not recompute.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const blockedSet = useMemo<ReadonlySet<string>>(() => effective, [key]);

  const change = useCallback(async (id: string, on: boolean): Promise<{ ok: true } | { ok: false; error: SafetyError }> => {
    setPending((p) => ({ ...p, [id]: on }));
    const r = await setBlockedApi(id, on);
    if (!r.ok) {
      setPending((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
    }
    return r;
  }, []);
  const block = useCallback((id: string) => change(id, true), [change]);
  const unblock = useCallback((id: string) => change(id, false), [change]);
  const isBlocked = useCallback((id: string | undefined | null) => !!id && blockedSet.has(id), [blockedSet]);

  return useMemo(() => ({ blocked: [...blockedSet], blockedSet, isBlocked, block, unblock }), [blockedSet, isBlocked, block, unblock]);
}

export type UseBlocks = ReturnType<typeof useBlocksState>;
const BlocksContext = createContext<UseBlocks | null>(null);

export function BlocksProvider({ children }: { children: React.ReactNode }) {
  const value = useBlocksState();
  return <BlocksContext.Provider value={value}>{children}</BlocksContext.Provider>;
}

export function useBlocks(): UseBlocks {
  const v = useContext(BlocksContext);
  if (!v) throw new Error('useBlocks must be used inside <BlocksProvider>');
  return v;
}
