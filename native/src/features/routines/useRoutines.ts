/** State + actions for Me > Routines. Screen-local: reads on mount and on foreground, re-reads after every write. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { createRoutine, deleteRoutine, editRoutine, listRoutines, markRoutine, routineErrorText, type Routine } from './api';

export interface RoutineInput {
  title: string;
  time: string;
  days: number[];
}

export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const rows = await listRoutines();
      if (alive.current) {
        setRoutines(rows);
        setLoadError(false);
      }
    } catch {
      if (alive.current) setLoadError(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => {
      alive.current = false;
      sub.remove();
    };
  }, [refresh]);

  /** Run a write; resolves to an error text, or null when it worked (the list is re-read either way). */
  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>): Promise<string | null> => {
      setBusy(key);
      try {
        await fn();
        await refresh();
        return null;
      } catch (e) {
        void refresh();
        return routineErrorText(e);
      } finally {
        if (alive.current) setBusy(null);
      }
    },
    [refresh],
  );

  return {
    routines,
    loading,
    loadError,
    busy,
    refresh,
    create: (b: RoutineInput) => run('save', () => createRoutine({ ...b, title: b.title.trim() })),
    edit: (id: string, b: RoutineInput) => run('save', () => editRoutine({ id, ...b, title: b.title.trim() })),
    markDone: (id: string) => run(`done:${id}`, () => markRoutine(id, 'done')),
    remove: (id: string) => run(`del:${id}`, () => deleteRoutine(id)),
  };
}
