'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CalendarEvent } from '@/lib/types';

const CACHE_MS = 10 * 60 * 1000; // 10 minutes

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface CacheEntry {
  monthKey: string;
  events: CalendarEvent[];
  ts: number;
}

/** Fetches today's events for multiple friends in parallel. Caches per friend for 10 min. */
export function useFriendSchedulesToday(
  friendIds: string[],
  getFriendEvents: (friendId: string, year: number, month: number) => Promise<CalendarEvent[]>
): Map<string, { events: CalendarEvent[]; loading: boolean }> {
  const [data, setData] = useState<Map<string, { events: CalendarEvent[]; loading: boolean }>>(new Map());
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  const todayStr = getTodayString();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthKey = `${year}-${month}`;

  const fetchForFriends = useCallback(async () => {
    if (friendIds.length === 0) return;

    const toFetch: string[] = [];
    const results = new Map<string, CalendarEvent[]>();

    for (const fid of friendIds) {
      const cached = cacheRef.current.get(fid);
      if (cached && cached.monthKey === monthKey && Date.now() - cached.ts < CACHE_MS) {
        const forToday = cached.events.filter((e) => {
          const d = e.start?.date || e.start?.dateTime?.slice(0, 10);
          return d === todayStr;
        });
        results.set(fid, forToday);
      } else {
        toFetch.push(fid);
      }
    }

    setData((prev) => {
      const next = new Map(prev);
      for (const fid of friendIds) {
        next.set(fid, {
          events: results.get(fid) ?? [],
          loading: toFetch.includes(fid),
        });
      }
      return next;
    });

    if (toFetch.length === 0) return;

    const promises = toFetch.map(async (fid) => {
      try {
        const monthEvents = await getFriendEvents(fid, year, month);
        cacheRef.current.set(fid, { monthKey, events: monthEvents, ts: Date.now() });
        const forToday = monthEvents.filter((e) => {
          const d = e.start?.date || e.start?.dateTime?.slice(0, 10);
          return d === todayStr;
        });
        return { fid, events: forToday };
      } catch {
        return { fid, events: [] as CalendarEvent[] };
      }
    });

    const settled = await Promise.all(promises);
    setData((prev) => {
      const next = new Map(prev);
      for (const { fid, events: evs } of settled) {
        next.set(fid, { events: evs, loading: false });
      }
      return next;
    });
  }, [friendIds.join(','), year, month, monthKey, todayStr, getFriendEvents]);

  useEffect(() => {
    if (friendIds.length === 0) {
      setData(new Map());
      return;
    }
    fetchForFriends();
  }, [friendIds.join(','), fetchForFriends]);

  return data;
}
