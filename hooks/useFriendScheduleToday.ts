'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CalendarEvent } from '@/lib/types';

const CACHE_MS = 10 * 60 * 1000; // 10 minutes

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useFriendScheduleToday(
  friendId: string | null,
  getFriendEvents: (friendId: string, year: number, month: number) => Promise<CalendarEvent[]>
) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, { monthKey: string; events: CalendarEvent[]; ts: number }>>(new Map());

  const todayStr = getTodayString();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const fetchEvents = useCallback(async () => {
    if (!friendId) return;
    const monthKey = `${year}-${month}`;
    const cached = cacheRef.current.get(friendId);
    if (cached && cached.monthKey === monthKey && Date.now() - cached.ts < CACHE_MS) {
      const forToday = cached.events.filter((e) => {
        const d = e.start?.date || e.start?.dateTime?.slice(0, 10);
        return d === todayStr;
      });
      setEvents(forToday);
      return;
    }
    setLoading(true);
    try {
      const monthEvents = await getFriendEvents(friendId, year, month);
      cacheRef.current.set(friendId, { monthKey, events: monthEvents, ts: Date.now() });
      const forToday = monthEvents.filter((e) => {
        const d = e.start?.date || e.start?.dateTime?.slice(0, 10);
        return d === todayStr;
      });
      setEvents(forToday);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [friendId, year, month, todayStr, getFriendEvents]);

  useEffect(() => {
    if (!friendId) {
      setEvents([]);
      return;
    }
    fetchEvents();
  }, [friendId, fetchEvents]);

  return { events, loading, refetch: fetchEvents };
}
