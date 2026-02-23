'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { doc, updateDoc, getDoc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useEncryption } from '@/hooks/useEncryption';
import {
  loadGoogleScript,
  requestCalendarAccessToken,
  fetchCalendarList,
  fetchEvents,
  createEvent as apiCreateEvent,
  updateEvent as apiUpdateEvent,
  deleteEvent as apiDeleteEvent,
} from '@/lib/googleCalendar';
import type {
  CalendarEvent,
  GoogleCalendarListItem,
  TaskVisibility,
} from '@/lib/types';

interface StoredTokens {
  accessToken: string;
  expiresAt: number;
}

const TOKEN_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry
const NATIVE_CALENDAR_ID = 'nudge';

export function useGoogleCalendar() {
  const { user, userData } = useAuth();
  const { encryptForSelf, decryptForSelf } = useEncryption();
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [calendars, setCalendars] = useState<GoogleCalendarListItem[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastFetchedMonth, setLastFetchedMonth] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const clientId = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID : undefined;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!user?.uid || !userData?.googleCalendarTokens) return null;
    try {
      const decrypted = await decryptForSelf(userData.googleCalendarTokens);
      const parsed: StoredTokens = JSON.parse(decrypted);
      if (parsed.expiresAt > Date.now() + TOKEN_BUFFER_MS) {
        tokenRef.current = parsed.accessToken;
        return parsed.accessToken;
      }
    } catch {
      // Token expired or invalid
    }
    return null;
  }, [user?.uid, userData?.googleCalendarTokens, decryptForSelf]);

  const connect = useCallback(async (onConnectSuccess?: () => void) => {
    if (!user?.uid || !clientId) return;
    setConnecting(true);
    try {
      await loadGoogleScript();
      requestCalendarAccessToken({
        clientId,
        onToken: async (accessToken, expiresIn = 3600) => {
          try {
            const expiresAt = Date.now() + expiresIn * 1000;
            const toStore: StoredTokens = { accessToken, expiresAt };
            const encrypted = await encryptForSelf(JSON.stringify(toStore));
            await updateDoc(doc(db, 'users', user.uid), {
              googleCalendarTokens: encrypted,
            });
            tokenRef.current = accessToken;
            setIsConnected(true);
            setSyncError(null);
            onConnectSuccess?.();
            // Fetch calendar list for selection
            const list = await fetchCalendarList(accessToken);
            const items: GoogleCalendarListItem[] = (list.items || []).map((c) => ({
              id: c.id,
              summary: c.summary || 'Unnamed',
              primary: c.primary,
              backgroundColor: c.backgroundColor,
              foregroundColor: c.foregroundColor,
            } as GoogleCalendarListItem));
            setCalendars(items);
            const primaryId = items.find((c) => c.primary)?.id || items[0]?.id;
            if (primaryId) {
              const current = userData?.googleCalendarSelectedIds;
              const ids = current?.length ? current : [primaryId];
              setSelectedCalendarIds(ids);
              await updateDoc(doc(db, 'users', user.uid), {
                googleCalendarSelectedIds: ids,
              });
            }
          } catch (e) {
            console.error('Failed to store tokens:', e);
            setSyncError('Failed to save connection');
          } finally {
            setConnecting(false);
          }
        },
      });
    } catch (e) {
      console.error('Failed to connect Google Calendar:', e);
      setSyncError('Failed to connect');
      setConnecting(false);
    }
  }, [user?.uid, userData?.googleCalendarSelectedIds, clientId, encryptForSelf]);

  const disconnect = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        googleCalendarTokens: deleteField(),
        googleCalendarSelectedIds: deleteField(),
      });
      tokenRef.current = null;
      setIsConnected(false);
      setCalendars([]);
      setSelectedCalendarIds([]);
      setEvents([]);
      setSyncError(null);
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  const saveSelectedCalendars = useCallback(
    async (ids: string[]) => {
      if (!user?.uid) return;
      setSelectedCalendarIds(ids);
      await updateDoc(doc(db, 'users', user.uid), {
        googleCalendarSelectedIds: ids,
      });
      setLastFetchedMonth(null);
    },
    [user?.uid]
  );

  const loadCalendars = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) return;
    try {
      const list = await fetchCalendarList(token);
      const items: GoogleCalendarListItem[] = (list.items || []).map((c) => ({
        id: c.id,
        summary: c.summary || 'Unnamed',
        primary: c.primary,
        backgroundColor: c.backgroundColor,
        foregroundColor: c.foregroundColor,
      }));
      setCalendars(items);
    } catch (e) {
      setSyncError('Could not load calendars');
    }
  }, [getAccessToken]);

  const loadEventsForMonth = useCallback(
    async (year: number, month: number) => {
      if (!user?.uid) return;
      // month is 0-indexed (JS Date); Firestore key uses 1-indexed (e.g. "2025-2" for Feb)
      const monthKey = `${year}-${month + 1}`;
      if (lastFetchedMonth === monthKey) return;

      if (!mountedRef.current) return;
      setEventsLoading(true);
      setSyncError(null);
      try {
        const token = await getAccessToken();
        if (!mountedRef.current) return;
        if (token) {
          // Google Calendar connected: fetch from API
          const ids = userData?.googleCalendarSelectedIds || selectedCalendarIds;
          if (ids.length > 0) {
            const start = new Date(year, month, 1);
            const end = new Date(year, month + 1, 0, 23, 59, 59);
            const timeMin = start.toISOString();
            const timeMax = end.toISOString();
            const items = await fetchEvents(token, ids, timeMin, timeMax);
            const calMap = new Map(calendars.map((c) => [c.id, c]));
            let visibilityMap: Record<string, { visibility: TaskVisibility; visibilityList?: string[] }> = {};
            if (items.length > 0) {
              try {
                const visSnap = await getDoc(doc(db, 'calendarEventVisibility', user.uid));
                visibilityMap = (visSnap.data()?.events as Record<string, { visibility: TaskVisibility; visibilityList?: string[] }>) || {};
              } catch {
                /* ignore */
              }
            }
            const withVisibility = items.map((item) => {
              const vis = visibilityMap[item.id];
              const cal = calMap.get(item.calendarId || '');
              return {
                ...item,
                backgroundColor: cal?.backgroundColor,
                visibility: vis?.visibility ?? 'private',
                visibilityList: vis?.visibilityList ?? [],
              } as CalendarEvent;
            });
            if (mountedRef.current) setEvents(withVisibility);
          } else {
            if (mountedRef.current) setEvents([]);
          }
        } else {
          // Not connected: load native events from Firestore
          const snap = await getDoc(doc(db, 'calendarEvents', user.uid, 'months', monthKey));
          const data = snap.data();
          const items = (data?.events as CalendarEvent[]) || [];
          if (mountedRef.current) setEvents(items.filter((e) => e.calendarId === NATIVE_CALENDAR_ID));
        }
        // When connected: merge native events from Firestore (best-effort, don't fail main load)
        if (token) {
          try {
            const nativeSnap = await getDoc(doc(db, 'calendarEvents', user.uid, 'months', monthKey));
            const nativeData = nativeSnap.data();
            const nativeItems = ((nativeData?.events as CalendarEvent[]) || []).filter((e) => e.calendarId === NATIVE_CALENDAR_ID);
            if (nativeItems.length > 0 && mountedRef.current) {
              setEvents((prev) => {
                const merged = [...prev];
                for (const n of nativeItems) {
                  if (!merged.some((e) => e.id === n.id)) merged.push(n);
                }
                return merged.sort((a, b) => {
                  const aStart = a.start?.dateTime || a.start?.date || '';
                  const bStart = b.start?.dateTime || b.start?.date || '';
                  return aStart.localeCompare(bStart);
                });
              });
            }
          } catch {
            /* ignore - native merge is best-effort */
          }
        }
        if (mountedRef.current) setLastFetchedMonth(monthKey);
      } catch (e) {
        if (mountedRef.current) {
          setSyncError('Could not load events');
          // Don't clear events on error - preserve last good state to avoid blink-then-disappear
        }
      } finally {
        if (mountedRef.current) setEventsLoading(false);
      }
    },
    [
      getAccessToken,
      user?.uid,
      userData?.googleCalendarSelectedIds,
      selectedCalendarIds,
      lastFetchedMonth,
      calendars,
    ]
  );

  const getEventVisibility = useCallback(
    async (eventId: string): Promise<{ visibility: TaskVisibility; visibilityList?: string[] } | null> => {
      if (!user?.uid) return null;
      try {
        const visDoc = await getDoc(doc(db, 'calendarEventVisibility', user.uid));
        const data = visDoc.data();
        const map = data?.events as Record<string, { visibility: TaskVisibility; visibilityList?: string[] }> | undefined;
        return map?.[eventId] ?? null;
      } catch {
        return null;
      }
    },
    [user?.uid]
  );

  const saveEventVisibility = useCallback(
    async (eventId: string, visibility: TaskVisibility, visibilityList: string[]) => {
      if (!user?.uid) return;
      const visRef = doc(db, 'calendarEventVisibility', user.uid);
      const snap = await getDoc(visRef);
      const current = (snap.data()?.events as Record<string, unknown>) || {};
      const next = { ...current, [eventId]: { visibility, visibilityList } };
      await setDoc(visRef, { events: next }, { merge: true });
    },
    [user?.uid]
  );

  const removeEventVisibility = useCallback(
    async (eventId: string) => {
      if (!user?.uid) return;
      const visRef = doc(db, 'calendarEventVisibility', user.uid);
      const snap = await getDoc(visRef);
      const current = (snap.data()?.events as Record<string, unknown>) || {};
      const next = { ...current };
      delete next[eventId];
      await setDoc(visRef, { events: next }, { merge: true });
    },
    [user?.uid]
  );

  const createEvent = useCallback(
    async (
      calendarId: string,
      event: {
        summary: string;
        description?: string;
        location?: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
      },
      visibility?: TaskVisibility,
      visibilityList?: string[]
    ): Promise<CalendarEvent> => {
      const token = await getAccessToken();
      const isNative = calendarId === NATIVE_CALENDAR_ID || !token;

      if (isNative) {
        if (!user?.uid) throw new Error('Not signed in');
        const id = crypto.randomUUID();
        const newEvent: CalendarEvent = {
          id,
          calendarId: NATIVE_CALENDAR_ID,
          summary: event.summary || 'Untitled',
          description: event.description,
          location: event.location,
          start: event.start,
          end: event.end,
          visibility: visibility ?? 'private',
          visibilityList: visibilityList ?? [],
        };
        if (visibility && visibility !== 'everyone') {
          try {
            await saveEventVisibility(id, visibility, visibilityList || []);
          } catch {
            /* ignore */
          }
        }
        setLastFetchedMonth(null);
        setEvents((prev) => {
          const next = [...prev, newEvent].sort((a, b) => {
            const aStart = a.start?.dateTime || a.start?.date || '';
            const bStart = b.start?.dateTime || b.start?.date || '';
            return aStart.localeCompare(bStart);
          });
          const dateStr = newEvent.start?.date || newEvent.start?.dateTime?.slice(0, 10) || '';
          if (dateStr) {
            const [y, m] = dateStr.split('-').map(Number);
            if (y && m) {
              const monthKey = `${y}-${m}`;
              const monthEvents = next.filter((e) => {
                if (e.calendarId !== NATIVE_CALENDAR_ID) return false;
                const d = e.start?.date || e.start?.dateTime?.slice(0, 10) || '';
                const [ey, em] = d.split('-').map(Number);
                return ey === y && em === m;
              });
              setTimeout(() => {
                setDoc(doc(db, 'calendarEvents', user.uid, 'months', monthKey), { events: monthEvents, updatedAt: Date.now() }, { merge: true }).catch(() => {});
              }, 100);
            }
          }
          return next;
        });
        return newEvent;
      }

      if (!token) throw new Error('Please reconnect Google Calendar');
      const created = await apiCreateEvent(token, calendarId, event);
      if (visibility && visibility !== 'everyone') {
        try {
          await saveEventVisibility(created.id, visibility, visibilityList || []);
        } catch {
          /* ignore */
        }
      }
      const newEvent: CalendarEvent = {
        ...created,
        summary: created.summary ?? 'Untitled',
        calendarId,
        visibility: visibility ?? 'private',
        visibilityList: visibilityList ?? [],
      };
      setLastFetchedMonth(null);
      setEvents((prev) => {
        const next = [...prev, newEvent].sort((a, b) => {
          const aStart = a.start?.dateTime || a.start?.date || '';
          const bStart = b.start?.dateTime || b.start?.date || '';
          return aStart.localeCompare(bStart);
        });
        const dateStr = newEvent.start?.date || newEvent.start?.dateTime?.slice(0, 10) || '';
        if (user?.uid && dateStr) {
          const [y, m] = dateStr.split('-').map(Number);
          if (y && m) {
            const monthKey = `${y}-${m}`;
            setTimeout(() => {
              setDoc(doc(db, 'calendarEvents', user.uid, 'months', monthKey), { events: next, updatedAt: Date.now() }, { merge: true }).catch(() => {});
            }, 100);
          }
        }
        return next;
      });
      return newEvent;
    },
    [getAccessToken, user?.uid, saveEventVisibility]
  );

  const updateEvent = useCallback(
    async (
      calendarId: string,
      eventId: string,
      updates: Partial<{
        summary: string;
        description: string;
        location: string;
        start: { dateTime?: string; date?: string };
        end: { dateTime?: string; date?: string };
      }>,
      visibility?: TaskVisibility,
      visibilityList?: string[]
    ): Promise<CalendarEvent> => {
      const token = await getAccessToken();
      const isNative = calendarId === NATIVE_CALENDAR_ID || !token;

      if (isNative) {
        if (!user?.uid) throw new Error('Not signed in');
        const existing = events.find((e) => e.id === eventId);
        if (!existing) throw new Error('Event not found');
        const updatedEvent: CalendarEvent = {
          ...existing,
          ...updates,
          summary: updates.summary ?? existing.summary,
          id: eventId,
          calendarId: NATIVE_CALENDAR_ID,
          visibility: visibility ?? existing.visibility ?? 'private',
          visibilityList: visibilityList ?? existing.visibilityList ?? [],
        };
        if (visibility !== undefined) {
          try {
            await saveEventVisibility(eventId, visibility, visibilityList || []);
          } catch {
            /* ignore */
          }
        }
        setLastFetchedMonth(null);
        setEvents((prev) => {
          const next = prev.map((e) => (e.id === eventId ? updatedEvent : e));
          const newDateStr = updatedEvent.start?.date || updatedEvent.start?.dateTime?.slice(0, 10) || '';
          const oldDateStr = existing.start?.date || existing.start?.dateTime?.slice(0, 10) || '';
          const monthsToWrite = new Set<string>();
          if (newDateStr) {
            const [ny, nm] = newDateStr.split('-').map(Number);
            if (ny && nm) monthsToWrite.add(`${ny}-${nm}`);
          }
          if (oldDateStr && oldDateStr !== newDateStr) {
            const [oy, om] = oldDateStr.split('-').map(Number);
            if (oy && om) monthsToWrite.add(`${oy}-${om}`);
          }
          if (user?.uid && monthsToWrite.size > 0) {
            setTimeout(() => {
              for (const monthKey of monthsToWrite) {
                const [y, m] = monthKey.split('-').map(Number);
                const monthEvents = next.filter((e) => {
                  if (e.calendarId !== NATIVE_CALENDAR_ID) return false;
                  const d = e.start?.date || e.start?.dateTime?.slice(0, 10) || '';
                  const [ey, em] = d.split('-').map(Number);
                  return ey === y && em === m;
                });
                setDoc(doc(db, 'calendarEvents', user.uid, 'months', monthKey), { events: monthEvents, updatedAt: Date.now() }, { merge: true }).catch(() => {});
              }
            }, 100);
          }
          return next;
        });
        return updatedEvent;
      }

      if (!token) throw new Error('Please reconnect Google Calendar');
      const updated = await apiUpdateEvent(token, calendarId, eventId, updates);
      if (visibility !== undefined) {
        try {
          await saveEventVisibility(eventId, visibility, visibilityList || []);
        } catch {
          /* ignore */
        }
      }
      const updatedEvent: CalendarEvent = {
        ...updated,
        summary: updated.summary ?? 'Untitled',
        calendarId,
        visibility: visibility ?? (updated as CalendarEvent).visibility ?? 'private',
        visibilityList: visibilityList ?? (updated as CalendarEvent).visibilityList ?? [],
      };
      setLastFetchedMonth(null);
      setEvents((prev) => {
        const next = prev.map((e) => (e.id === eventId ? updatedEvent : e));
        const dateStr = updatedEvent.start?.date || updatedEvent.start?.dateTime?.slice(0, 10) || '';
        if (user?.uid && dateStr) {
          const [y, m] = dateStr.split('-').map(Number);
          if (y && m) {
            const monthKey = `${y}-${m}`;
            setTimeout(() => {
              setDoc(doc(db, 'calendarEvents', user.uid, 'months', monthKey), { events: next, updatedAt: Date.now() }, { merge: true }).catch(() => {});
            }, 100);
          }
        }
        return next;
      });
      return updatedEvent;
    },
    [getAccessToken, user?.uid, events, saveEventVisibility]
  );

  const deleteEvent = useCallback(
    async (calendarId: string, eventId: string): Promise<void> => {
      const token = await getAccessToken();
      const isNative = calendarId === NATIVE_CALENDAR_ID || !token;

      if (isNative) {
        if (!user?.uid) return;
        const existing = events.find((e) => e.id === eventId);
        const dateStr = existing?.start?.date || existing?.start?.dateTime?.slice(0, 10) || '';
        try {
          await removeEventVisibility(eventId);
        } catch {
          /* ignore */
        }
        setLastFetchedMonth(null);
        setEvents((prev) => {
          const next = prev.filter((e) => e.id !== eventId);
          if (dateStr) {
            const [y, m] = dateStr.split('-').map(Number);
            if (y && m) {
              const monthKey = `${y}-${m}`;
              const monthEvents = next.filter((e) => {
                if (e.calendarId !== NATIVE_CALENDAR_ID) return false;
                const d = e.start?.date || e.start?.dateTime?.slice(0, 10) || '';
                const [ey, em] = d.split('-').map(Number);
                return ey === y && em === m;
              });
              setTimeout(() => {
                setDoc(doc(db, 'calendarEvents', user.uid, 'months', monthKey), { events: monthEvents, updatedAt: Date.now() }, { merge: true }).catch(() => {});
              }, 100);
            }
          }
          return next;
        });
        return;
      }

      if (!token) throw new Error('Please reconnect Google Calendar');
      await apiDeleteEvent(token, calendarId, eventId);
      try {
        await removeEventVisibility(eventId);
      } catch {
        /* ignore */
      }
      setLastFetchedMonth(null);
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
    },
    [getAccessToken, removeEventVisibility, user?.uid, events]
  );

  useEffect(() => {
    if (!user?.uid) return;
    const hasTokens = !!userData?.googleCalendarTokens;
    setIsConnected(hasTokens);
    if (hasTokens) {
      setSelectedCalendarIds(userData?.googleCalendarSelectedIds || []);
      if (calendars.length === 0) loadCalendars();
    }
  }, [user?.uid, userData?.googleCalendarTokens, userData?.googleCalendarSelectedIds, calendars.length, loadCalendars]);

  const getFriendEvents = useCallback(async (friendId: string, year: number, month: number): Promise<CalendarEvent[]> => {
    const monthKey = `${year}-${month}`;
    try {
      const snap = await getDoc(doc(db, 'calendarEvents', friendId, 'months', monthKey));
      const data = snap.data();
      return (data?.events as CalendarEvent[]) || [];
    } catch {
      return [];
    }
  }, []);

  return {
    isConnected,
    loading,
    connecting,
    calendars,
    selectedCalendarIds,
    saveSelectedCalendars,
    events,
    eventsLoading,
    syncError,
    setSyncError,
    connect,
    disconnect,
    loadEventsForMonth,
    getAccessToken,
    createEvent,
    updateEvent,
    deleteEvent,
    getEventVisibility,
    getFriendEvents,
    loadCalendars,
  };
}
