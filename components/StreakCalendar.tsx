'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { StreakData, TaskWithUser, CalendarEvent } from '@/lib/types';
import { FaChevronLeft, FaChevronRight, FaTimes, FaArrowLeft, FaExclamationTriangle, FaEllipsisV } from 'react-icons/fa';
import { LuCheck, LuCalendarPlus, LuList, LuLayoutGrid } from 'react-icons/lu';
import { dateMatchesRecurrence } from '@/utils/recurrence';
import { shouldShowInTodayView, getTodayString, getDateString } from '@/utils/taskFilter';
import { formatEventTime, isEventPast, isEventOngoing, getEventTimeRange, getTaskMinutes } from '@/utils/calendarEvent';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useFriends } from '@/hooks/useFriends';
import { useAuth } from '@/contexts/AuthContext';
import CalendarEventForm from './CalendarEventForm';
import { getEventColor } from './CalendarEventForm';
import Avatar from './Avatar';
import GoogleCalendarSettings from './GoogleCalendarSettings';
import { canViewEvent, canViewTask } from '@/utils/visibility';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

type ViewMode = 'grid' | 'dayDetail' | 'eventForm';
type DayDetailViewMode = 'list' | 'timeline';

const DAY_DETAIL_VIEW_KEY = 'nudge_day_detail_view';

function loadDayDetailViewPreference(): DayDetailViewMode {
  if (typeof window === 'undefined') return 'list';
  try {
    const v = localStorage.getItem(DAY_DETAIL_VIEW_KEY);
    return v === 'timeline' ? 'timeline' : 'list';
  } catch {
    return 'list';
  }
}

interface StreakCalendarProps {
  streakData: StreakData;
  /** All tasks (yours + friends' visible tasks). Filtered internally by viewingUserId. */
  tasks: TaskWithUser[];
  currentUserId: string;
  onClose: () => void;
  onToggleComplete: (taskId: string, completed: boolean, dateStr?: string) => void;
  onTogglePrivacy: (taskId: string, isPrivate: boolean) => void;
  onUpdateVisibility?: (taskId: string, visibility: import('@/lib/types').TaskVisibility, visibilityList: string[]) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask?: (taskId: string, text: string) => Promise<void>;
  onUpdateDueDate?: (taskId: string, dueDate: number | null) => Promise<void>;
  onUpdateNotes?: (taskId: string, notes: string) => Promise<void>;
  onAddReaction: (taskId: string, emoji: string) => void;
  onOpenComments?: (taskId: string) => void;
  onDeferTask: (taskId: string, deferToDate: string | null) => void;
  onUpdateTaskRecurrence?: (taskId: string, recurrence: import('@/lib/types').Recurrence | null, completedDateStr?: string) => Promise<void>;
  onToast?: (type: 'success' | 'error', title: string, message?: string, duration?: number) => void;
  /** Open directly to day detail or event form */
  initialDate?: string;
  initialEvent?: CalendarEvent | null;
  /** When true with initialDate, open add-event form instead of day detail */
  initialAddEvent?: boolean;
}

const GOOGLE_CALENDAR_COLORS: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26',
  '6': '#f4511e', '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};

function getEventDotColor(event: CalendarEvent): string {
  return event.backgroundColor || GOOGLE_CALENDAR_COLORS[event.colorId || '1'] || '#4285f4';
}

/** Sort key for timeline ordering. Events/tasks with times sort first. */
function getEventSortKey(event: CalendarEvent): string {
  const d = event.start?.date || event.start?.dateTime?.slice(0, 10) || '';
  if (event.start?.date) return `${d}T00:00:00`; // all-day at start of day
  return event.start?.dateTime || `${d}T23:59:59`;
}

/** Returns [sortKey, timeLabel] for a task. timeLabel empty = unscheduled (goes to To do). */
function getTaskSortKeyAndTime(task: TaskWithUser, dateStr: string): { sortKey: string; timeLabel: string } {
  if (task.deferredTo?.includes('T')) {
    const dt = task.deferredTo;
    const datePart = dt.slice(0, 10);
    if (datePart === dateStr) {
      const timePart = dt.slice(11, 16) || '00:00';
      return { sortKey: `${datePart}T${timePart}:00`, timeLabel: new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) };
    }
  }
  if (task.dueDate) {
    const d = new Date(task.dueDate);
    const taskDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (taskDateStr === dateStr) {
      return { sortKey: d.toISOString(), timeLabel: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) };
    }
  }
  return { sortKey: 'zzzz', timeLabel: '' }; // unscheduled
}

export default function StreakCalendar({
  streakData,
  tasks,
  currentUserId,
  onClose,
  onToggleComplete,
  onTogglePrivacy,
  onUpdateVisibility,
  onDelete,
  onUpdateTask,
  onUpdateDueDate,
  onUpdateNotes,
  onAddReaction,
  onOpenComments,
  onDeferTask,
  onUpdateTaskRecurrence,
  onToast,
  initialDate,
  initialEvent,
  initialAddEvent,
}: StreakCalendarProps) {
  const { userData } = useAuth();
  const { friends } = useFriends();
  const {
    isConnected: calendarConnected,
    events,
    eventsLoading,
    syncError,
    setSyncError,
    loadEventsForMonth,
    createEvent,
    updateEvent,
    deleteEvent,
    calendars,
    selectedCalendarIds,
    getFriendEvents,
  } = useGoogleCalendar();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate ?? null);
  const [viewMode, setViewMode] = useState<ViewMode>(
    initialDate && (initialEvent || initialAddEvent) ? 'eventForm' : initialDate ? 'dayDetail' : 'grid'
  );
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(initialEvent ?? null);
  /** Single-select: null = viewing self, string = friend id */
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [friendEvents, setFriendEvents] = useState<Record<string, CalendarEvent[]>>({});
  const [friendStreakData, setFriendStreakData] = useState<StreakData | null>(null);
  const [friendStreakLoading, setFriendStreakLoading] = useState(false);
  const [gridOpacity, setGridOpacity] = useState(1);
  const prevViewingUserIdRef = useRef<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showGoogleCalendarConnect, setShowGoogleCalendarConnect] = useState(false);
  const [dayDetailViewMode, setDayDetailViewMode] = useState<DayDetailViewMode>(loadDayDetailViewPreference);

  const setDayDetailView = useCallback((mode: DayDetailViewMode) => {
    setDayDetailViewMode(mode);
    try {
      localStorage.setItem(DAY_DETAIL_VIEW_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
  }, []);

  const viewingUserId = selectedUserId ?? currentUserId;
  const isViewingFriend = selectedUserId !== null;

  // Load our events only when viewing our own calendar
  useEffect(() => {
    if (!isViewingFriend) loadEventsForMonth(year, month);
  }, [isViewingFriend, year, month, loadEventsForMonth]);

  useEffect(() => {
    if (isViewingFriend) return;
    const interval = setInterval(() => loadEventsForMonth(year, month), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isViewingFriend, year, month, loadEventsForMonth]);

  // Fetch friend's streak when viewing a friend
  useEffect(() => {
    if (!selectedUserId) {
      setFriendStreakData(null);
      return;
    }
    setFriendStreakLoading(true);
    getDoc(doc(db, 'users', selectedUserId))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setFriendStreakData((data?.streakData as StreakData) ?? { currentStreak: 0, longestStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} });
        } else {
          setFriendStreakData({ currentStreak: 0, longestStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} });
        }
      })
      .catch(() => setFriendStreakData({ currentStreak: 0, longestStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} }))
      .finally(() => setFriendStreakLoading(false));
  }, [selectedUserId]);

  // Fetch friend's events when viewing a friend
  useEffect(() => {
    if (!selectedUserId) {
      setFriendEvents({});
      return;
    }
    const load = async () => {
      const evs = await getFriendEvents(selectedUserId, year, month);
      setFriendEvents({ [selectedUserId]: evs });
    };
    load();
  }, [selectedUserId, year, month, getFriendEvents]);


  const effectiveStreakData = isViewingFriend
    ? (friendStreakData ?? { currentStreak: 0, longestStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} })
    : streakData;
  const effectiveTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.userId !== viewingUserId) return false;
      if (viewingUserId === currentUserId) return true;
      return canViewTask(t, currentUserId, false);
    });
  }, [tasks, viewingUserId, currentUserId]);
  const effectiveEvents = isViewingFriend ? (friendEvents[selectedUserId!] ?? []) : events;

  // Crossfade grid when switching between users
  useEffect(() => {
    if (prevViewingUserIdRef.current === null) {
      prevViewingUserIdRef.current = viewingUserId;
      return;
    }
    if (prevViewingUserIdRef.current !== viewingUserId) {
      setGridOpacity(0);
      const t = setTimeout(() => {
        setGridOpacity(1);
        prevViewingUserIdRef.current = viewingUserId;
      }, 50);
      return () => clearTimeout(t);
    }
  }, [viewingUserId]);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

  const getTaskCount = (day: number): number => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return effectiveStreakData.completionHistory[dateStr] || 0;
  };
  const getMissedCommitmentCount = (day: number): number => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return effectiveStreakData.missedCommitments?.[dateStr] || 0;
  };
  const isToday = (day: number): boolean => {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const getEventsForDate = useCallback((dateStr: string): CalendarEvent[] => {
    return effectiveEvents.filter((e) => {
      const d = e.start?.date || e.start?.dateTime?.slice(0, 10);
      return d === dateStr;
    });
  }, [effectiveEvents]);

  const getTasksForDate = useCallback((dateStr: string): TaskWithUser[] => {
    const todayStr = getTodayString();
    return effectiveTasks.filter((task) => {
      if (task.deleted === true) return false;
      // When viewing today, use same logic as main page so tasks match
      if (dateStr === todayStr && shouldShowInTodayView(task, todayStr)) return true;
      if (task.recurrence) {
        if (task.recurrence.completedDates?.includes(dateStr)) return true;
        if (task.recurrence.skippedDates?.includes(dateStr)) return false;
        return dateMatchesRecurrence(task.recurrence, dateStr);
      }
      if (task.completed && task.completedAt) {
        const date = new Date(task.completedAt);
        const taskDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return taskDateStr === dateStr;
      }
      if (!task.completed) {
        if (task.dueDate) {
          const d = new Date(task.dueDate);
          const dueDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (dueDateStr === dateStr) return true;
        }
        if (task.deferredTo) {
          const deferredDate = task.deferredTo.includes('T') ? task.deferredTo.split('T')[0] : task.deferredTo;
          if (deferredDate === dateStr) return true;
        }
        const date = new Date(task.createdAt);
        const taskDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (taskDateStr === dateStr) return true;
      }
      return false;
    });
  }, [effectiveTasks]);

  const getDisplayTasksForDate = useCallback((dateStr: string): TaskWithUser[] => {
    return getTasksForDate(dateStr).map((task) => {
      if (task.recurrence?.completedDates?.includes(dateStr)) {
        return { ...task, completed: true, completedAt: new Date(dateStr + 'T12:00:00').getTime() };
      }
      return task;
    });
  }, [getTasksForDate]);

  const handleDateClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
    setViewMode('dayDetail');
    setEditingEvent(null);
  };

  const handleAddEvent = () => {
    setEditingEvent(null);
    setViewMode('eventForm');
  };

  const handleEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setViewMode('eventForm');
  };

  const handleBackFromForm = () => {
    setViewMode('dayDetail');
    setEditingEvent(null);
  };

  const handleBackFromDay = () => {
    setSelectedDate(null);
    setViewMode('grid');
    setEditingEvent(null);
  };

  const primaryCalendarId = calendarConnected
    ? (calendars.find((c) => c.primary)?.id || calendars[0]?.id || 'primary')
    : 'nudge';

  if (viewMode === 'eventForm' && selectedDate) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] flex items-center justify-center p-4 z-50">
        <div className={`bg-surface dark:bg-elevated dark:border dark:border-border-subtle rounded-2xl shadow-elevation-3 dark:shadow-none w-full flex flex-col ${isMobile ? 'max-h-[90vh]' : 'max-w-[480px] max-h-[85vh]'}`}>
          <CalendarEventForm
            dateStr={selectedDate}
            calendars={calendarConnected ? calendars : []}
            defaultCalendarId={primaryCalendarId}
            defaultVisibility={userData?.defaultEventVisibility ?? 'private'}
            defaultVisibilityList={userData?.defaultEventVisibilityList ?? []}
            event={editingEvent}
            onSave={async (ev) => {
              if (editingEvent) {
                await updateEvent(editingEvent.calendarId, editingEvent.id, {
                  summary: ev.summary,
                  description: ev.description,
                  location: ev.location,
                  start: ev.start,
                  end: ev.end,
                }, ev.visibility, ev.visibilityList);
              } else {
                await createEvent(ev.calendarId, ev, ev.visibility, ev.visibilityList);
              }
            }}
            onDelete={editingEvent ? () => deleteEvent(editingEvent.calendarId, editingEvent.id) : undefined}
            onBack={handleBackFromForm}
            onSuccess={(msg) => {
              onToast?.('success', msg, '', 2000);
            }}
            onError={(msg) => {
              onToast?.('error', msg, '', 5000);
            }}
          />
        </div>
      </div>
    );
  }

  if (selectedDate && viewMode === 'dayDetail') {
    const dateTasks = getDisplayTasksForDate(selectedDate);
    const dateEvents = getEventsForDate(selectedDate);
    const selectedDateObj = new Date(selectedDate + 'T12:00:00');
    const isSelectedToday = selectedDateObj.getDate() === new Date().getDate() &&
      selectedDateObj.getMonth() === new Date().getMonth() &&
      selectedDateObj.getFullYear() === new Date().getFullYear();

    // Build merged timeline: events + scheduled tasks (chronological), then unscheduled tasks (To do)
    type TimelineItem = { type: 'event'; sortKey: string; event: CalendarEvent; isFriend?: boolean; friendName?: string } | { type: 'task'; sortKey: string; task: TaskWithUser; timeLabel: string };
    const timelineItems: TimelineItem[] = [];
    dateEvents.forEach((event) => {
      const viewLevel = isViewingFriend ? canViewEvent(event, currentUserId, false) : 'full';
      if (viewLevel !== 'none') {
        timelineItems.push({ type: 'event', sortKey: getEventSortKey(event), event, isFriend: isViewingFriend, friendName: isViewingFriend ? friends.find((f) => f.id === selectedUserId)?.displayName : undefined });
      }
    });
    const scheduledTasks: { task: TaskWithUser; sortKey: string; timeLabel: string }[] = [];
    const todoTasks: TaskWithUser[] = [];
    dateTasks.forEach((task) => {
      const { sortKey, timeLabel } = getTaskSortKeyAndTime(task, selectedDate);
      if (timeLabel) {
        scheduledTasks.push({ task, sortKey, timeLabel });
      } else {
        todoTasks.push(task);
      }
    });
    scheduledTasks.forEach(({ task, sortKey, timeLabel }) => {
      timelineItems.push({ type: 'task', sortKey, task, timeLabel });
    });
    timelineItems.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    const isEmpty = timelineItems.length === 0 && todoTasks.length === 0;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] flex items-center justify-center p-4 z-50">
        <div className={`bg-surface dark:bg-elevated dark:border dark:border-border-subtle rounded-2xl shadow-elevation-3 dark:shadow-none w-full flex flex-col ${isMobile ? 'max-h-[90vh]' : 'max-w-[480px] max-h-[85vh]'}`}>
          <div className="flex items-center justify-between p-4 border-b border-border-subtle gap-2">
            <button onClick={handleBackFromDay} className="text-fg-tertiary hover:text-fg-primary flex-shrink-0">
              <FaArrowLeft size={18} />
            </button>
            <div className="flex-1 min-w-0 flex flex-col items-center">
              <h2 className="text-[14px] font-semibold text-fg-primary">
                {selectedDateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </h2>
              {isSelectedToday && <span className="text-xs text-primary">Today</span>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex rounded-lg border border-border-subtle p-0.5 h-8" role="group">
                <button
                  onClick={() => setDayDetailView('list')}
                  className={`p-1.5 rounded-md transition-colors ${dayDetailViewMode === 'list' ? 'bg-primary text-on-accent' : 'text-fg-tertiary hover:text-fg-secondary'}`}
                  aria-label="List view"
                  title="List view"
                >
                  <LuList size={18} />
                </button>
                <button
                  onClick={() => setDayDetailView('timeline')}
                  className={`p-1.5 rounded-md transition-colors ${dayDetailViewMode === 'timeline' ? 'bg-primary text-on-accent' : 'text-fg-tertiary hover:text-fg-secondary'}`}
                  aria-label="Block view"
                  title="Block view"
                >
                  <LuLayoutGrid size={18} />
                </button>
              </div>
              <button onClick={onClose} className="text-fg-tertiary hover:text-fg-primary p-1">
                <FaTimes size={20} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {isEmpty ? (
              <div className="text-center py-12 text-[13px] text-fg-tertiary">Nothing scheduled</div>
            ) : dayDetailViewMode === 'timeline' ? (
              <DayDetailTimelineView
                dateStr={selectedDate}
                dateEvents={dateEvents}
                scheduledTasks={scheduledTasks}
                todoTasks={todoTasks}
                friendEvents={{}}
                isSelectedToday={isSelectedToday}
                currentUserId={currentUserId}
                isReadOnly={isViewingFriend}
                onEditEvent={handleEditEvent}
                onDeleteEvent={deleteEvent}
                onToggleComplete={isViewingFriend ? () => {} : (taskId, completed) => onToggleComplete(taskId, completed, selectedDate)}
                onAddEvent={handleAddEvent}
                onTogglePrivacy={onTogglePrivacy}
                onUpdateVisibility={onUpdateVisibility}
                onUpdateTask={onUpdateTask}
                onUpdateDueDate={onUpdateDueDate}
                onUpdateNotes={onUpdateNotes}
                onDelete={onDelete}
                onAddReaction={onAddReaction}
                onOpenComments={onOpenComments}
                onDeferTask={onDeferTask}
                onUpdateTaskRecurrence={onUpdateTaskRecurrence}
                onNavigate={onClose}
              />
            ) : (
              <>
                {/* Merged chronological timeline */}
                {timelineItems.map((item) => {
                  if (item.type === 'event') {
                    if (item.isFriend) {
                      return (
                        <FriendEventRow
                          key={`f-${item.event.id}`}
                          event={item.event}
                          friendName={item.friendName || 'Friend'}
                          viewLevel={canViewEvent(item.event, currentUserId, false)}
                        />
                      );
                    }
                    return (
                      <EventRow
                        key={item.event.id}
                        event={item.event}
                        onEdit={() => handleEditEvent(item.event)}
                        onDelete={() => deleteEvent(item.event.calendarId, item.event.id)}
                        isOwn={!isViewingFriend}
                      />
                    );
                  }
                  return (
                    <TimelineTaskRow
                      key={item.task.id}
                      task={item.task}
                      timeLabel={item.timeLabel}
                      selectedDate={selectedDate}
                      onToggleComplete={isViewingFriend ? () => {} : (taskId, completed) => onToggleComplete(taskId, completed, selectedDate)}
                    />
                  );
                })}
                {!isViewingFriend && (
                  <button
                    onClick={handleAddEvent}
                    className="flex items-center gap-2 text-[13px] text-primary py-2 mt-2"
                  >
                    <LuCalendarPlus size={16} />
                    Add event
                  </button>
                )}
                {/* To do — unscheduled tasks */}
                {todoTasks.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-border-subtle">
                    <p className="text-[11px] text-fg-tertiary uppercase tracking-wider mb-3">To do</p>
                    <div className="space-y-1">
                      {todoTasks.map((task) => (
                        <CompactTaskRow
                          key={task.id}
                          task={task}
                          dateStr={selectedDate}
                          onToggleComplete={isViewingFriend ? () => {} : (taskId, completed) => onToggleComplete(taskId, completed, selectedDate)}
                          onDelete={isViewingFriend ? () => {} : onDelete}
                          onNavigate={onClose}
                          isReadOnly={isViewingFriend}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const getCellStyles = (count: number, isToday: boolean) => {
    const base = 'w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all cursor-pointer relative';
    const todayRing = isToday ? 'ring-[1.5px] ring-primary' : '';
    if (count === 0) return `${base} ${todayRing} hover:bg-surface-muted text-fg-secondary`;
    const opacityMap: Record<number, string> = { 1: 'bg-primary/15', 2: 'bg-primary/30', 3: 'bg-primary/50', 4: 'bg-primary/80' };
    const bg = count >= 4 ? 'bg-primary/80' : opacityMap[count] || 'bg-primary/80';
    const textColor = count >= 3 ? 'text-white' : 'text-fg-primary';
    return `${base} ${bg} ${todayRing} ${textColor}`;
  };

  const calendarDays = [];
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(<div key={`empty-${i}`} className="w-10 h-10" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const taskCount = getTaskCount(day);
    const dayEvents = getEventsForDate(dateStr);
    const today = isToday(day);
    const missedCount = getMissedCommitmentCount(day);

    calendarDays.push(
      <button
        key={day}
        onClick={() => handleDateClick(day)}
        className={getCellStyles(taskCount, today)}
      >
        {missedCount > 0 && (
          <FaExclamationTriangle size={10} className="absolute top-0.5 right-0.5 text-warning" />
        )}
        <span className="text-sm font-medium">{day}</span>
        {dayEvents.length > 0 && (
          <div className="flex items-center gap-0.5 mt-0.5">
            {dayEvents.slice(0, 3).map((ev, i) => (
              <div
                key={ev.id}
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: getEventDotColor(ev) }}
              />
            ))}
            {dayEvents.length > 3 && (
              <span className="text-[9px] text-fg-tertiary">+{dayEvents.length - 3}</span>
            )}
          </div>
        )}
        {taskCount > 0 && (
          <span className="text-xs font-medium mt-0.5 flex items-center gap-0.5"><LuCheck size={10} />{taskCount}</span>
        )}
      </button>
    );
  }

  const showFriendSelector = friends.length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] flex items-center justify-center p-4 z-50">
      <div className={`bg-surface dark:bg-elevated dark:border dark:border-border-subtle rounded-2xl shadow-elevation-3 dark:shadow-none w-full flex flex-col ${isMobile ? 'max-h-[90vh]' : 'max-w-[480px] max-h-[85vh]'}`}>
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <h2 className="text-xl font-semibold text-fg-primary">Task Calendar</h2>
          <div className="flex items-center gap-2">
            {eventsLoading && (
              <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            )}
            <button onClick={onClose} className="text-fg-tertiary hover:text-fg-primary">
              <FaTimes size={20} />
            </button>
          </div>
        </div>
        {syncError && !isViewingFriend && (
          <div className="px-4 py-2 bg-warning-bg border-b border-warning-border flex items-center justify-between">
            <span className="text-[12px] text-warning-text">{syncError}</span>
            <button onClick={() => setSyncError(null)} className="text-warning-text text-xs">Dismiss</button>
          </div>
        )}
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-surface-muted rounded-xl px-4 py-3">
              <div className="text-2xl font-semibold text-primary">
                {isViewingFriend && friendStreakLoading ? '—' : effectiveStreakData.currentStreak}
              </div>
              <div className="text-xs text-fg-secondary uppercase tracking-wider mt-0.5">Current Streak</div>
            </div>
            <div className="bg-surface-muted rounded-xl px-4 py-3">
              <div className="text-2xl font-semibold text-primary">
                {isViewingFriend && friendStreakLoading ? '—' : effectiveStreakData.longestStreak}
              </div>
              <div className="text-xs text-fg-secondary uppercase tracking-wider mt-0.5">Longest Streak</div>
            </div>
          </div>
          {showFriendSelector && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide">
              <button
                onClick={() => selectedUserId !== null && setSelectedUserId(null)}
                className={`flex-shrink-0 rounded-full p-0.5 transition-all duration-150 ${
                  selectedUserId === null ? 'ring-2 ring-primary scale-110' : 'opacity-70 hover:opacity-90'
                }`}
              >
                <Avatar
                  photoURL={userData?.photoURL}
                  displayName={userData?.displayName || 'You'}
                  size="sm"
                />
              </button>
              {friends.map((f) => {
                const isSelected = selectedUserId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => !isSelected && setSelectedUserId(f.id)}
                    className={`flex-shrink-0 rounded-full p-0.5 transition-all duration-150 ${
                      isSelected ? 'ring-2 ring-primary scale-110' : 'opacity-70 hover:opacity-90'
                    }`}
                  >
                    <Avatar photoURL={f.photoURL} displayName={f.displayName || '?'} size="sm" />
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-2 hover:bg-surface-muted rounded-lg text-fg-secondary">
              <FaChevronLeft size={16} />
            </button>
            <div className="flex flex-col items-center">
              <h3 className="text-base font-semibold text-fg-primary text-center">
                {monthNames[month]} {year}
                {isViewingFriend && (() => {
                  const friend = friends.find((f) => f.id === selectedUserId);
                  return friend ? (
                    <span className="text-[12px] text-fg-secondary font-normal"> · {friend.displayName}'s calendar</span>
                  ) : null;
                })()}
              </h3>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-surface-muted rounded-lg text-fg-secondary">
              <FaChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="w-10 text-center text-xs font-medium text-fg-tertiary">{d}</div>
            ))}
          </div>
          <div
            key={viewingUserId}
            className="grid grid-cols-7 gap-1 transition-opacity duration-150"
            style={{ opacity: gridOpacity }}
          >
            {calendarDays}
          </div>
          {!isViewingFriend && !calendarConnected && events.length === 0 && !eventsLoading && (
            <p className="mt-4 text-[13px] text-fg-tertiary text-center">
              Connect Google Calendar to see your schedule here{' '}
              <button
                type="button"
                onClick={() => setShowGoogleCalendarConnect(true)}
                className="text-primary hover:underline"
              >
                Connect
              </button>
            </p>
          )}
          <div className="mt-4 flex items-center justify-center gap-4 text-xs text-fg-tertiary">
            {[0, 1, 2, 3, 4].map((n) => (
              <div key={n} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${n === 0 ? 'bg-transparent border border-border-subtle' : n === 1 ? 'bg-primary/15' : n === 2 ? 'bg-primary/30' : n === 3 ? 'bg-primary/50' : 'bg-primary/80'}`} />
                <span>{n === 4 ? '4+' : n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <GoogleCalendarSettings
        isOpen={showGoogleCalendarConnect}
        onClose={() => setShowGoogleCalendarConnect(false)}
        onSuccess={() => {
          setShowGoogleCalendarConnect(false);
          loadEventsForMonth(year, month);
        }}
      />
    </div>
  );
}

const TIME_COLUMN_WIDTH = 'min-w-[110px]';

const PX_PER_HOUR = 60;
const HOUR_LABEL_WIDTH = 48;
const TASK_MARKER_HEIGHT = 24;
const MIN_BLOCK_HEIGHT = 30;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function DayDetailTimelineView({
  dateStr,
  dateEvents,
  scheduledTasks,
  todoTasks,
  friendEvents,
  isSelectedToday,
  currentUserId,
  onEditEvent,
  onDeleteEvent,
  onToggleComplete,
  onAddEvent,
  onTogglePrivacy,
  onUpdateVisibility,
  onUpdateTask,
  onUpdateDueDate,
  onUpdateNotes,
  onDelete,
  onAddReaction,
  onOpenComments,
  onDeferTask,
  onUpdateTaskRecurrence,
  onNavigate,
  isReadOnly = false,
}: {
  dateStr: string;
  dateEvents: CalendarEvent[];
  scheduledTasks: { task: TaskWithUser; sortKey: string; timeLabel: string }[];
  todoTasks: TaskWithUser[];
  friendEvents: Record<string, CalendarEvent[]>;
  isSelectedToday: boolean;
  currentUserId: string;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (calendarId: string, eventId: string) => void;
  onToggleComplete: (taskId: string, completed: boolean, dateStr?: string) => void;
  onAddEvent: () => void;
  onTogglePrivacy: (taskId: string, isPrivate: boolean) => void;
  onUpdateVisibility?: (taskId: string, visibility: import('@/lib/types').TaskVisibility, visibilityList: string[]) => void;
  onUpdateTask?: (taskId: string, text: string) => Promise<void>;
  onUpdateDueDate?: (taskId: string, dueDate: number | null) => Promise<void>;
  onUpdateNotes?: (taskId: string, notes: string) => Promise<void>;
  onDelete: (taskId: string) => void;
  onAddReaction: (taskId: string, emoji: string) => void;
  onOpenComments?: (taskId: string) => void;
  onDeferTask: (taskId: string, deferToDate: string | null) => void;
  onUpdateTaskRecurrence?: (taskId: string, recurrence: import('@/lib/types').Recurrence | null, completedDateStr?: string) => Promise<void>;
  onNavigate: () => void;
  isReadOnly?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLDivElement>(null);

  const allEvents = [
    ...dateEvents.map((e) => ({ event: e, isFriend: false, friendId: null as string | null })),
    ...Object.entries(friendEvents).flatMap(([fid, evs]) =>
      evs.map((e) => ({ event: e, isFriend: true, friendId: fid }))
    ),
  ].filter(({ event }) => canViewEvent(event, currentUserId, false) !== 'none');

  const timedEvents = allEvents
    .map(({ event, isFriend, friendId }) => {
      const range = getEventTimeRange(event, dateStr);
      if (!range) return null;
      return { event, isFriend, friendId, ...range };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const timedTasks = scheduledTasks
    .map(({ task, timeLabel }) => {
      const mins = getTaskMinutes(task, dateStr);
      if (mins === null) return null;
      return { task, timeLabel, mins };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const allTimes = [
    ...timedEvents.flatMap((e) => [e.start, e.end]),
    ...timedTasks.map((t) => t.mins),
  ];
  const hasTimedItems = allTimes.length > 0;
  const minMins = hasTimedItems ? Math.floor(Math.min(...allTimes) / 60) * 60 : 8 * 60;
  const maxMins = hasTimedItems ? Math.ceil(Math.max(...allTimes) / 60) * 60 + 60 : 18 * 60;
  const totalMins = Math.max(maxMins - minMins, 2 * 60);
  const totalHeight = totalMins * (PX_PER_HOUR / 60);

  const nowMins = isSelectedToday
    ? new Date().getHours() * 60 + new Date().getMinutes()
    : null;
  const nowOffset = nowMins !== null && nowMins >= minMins && nowMins <= maxMins
    ? (nowMins - minMins) * (PX_PER_HOUR / 60)
    : null;

  const hours: number[] = [];
  for (let h = Math.floor(minMins / 60); h <= Math.ceil(maxMins / 60); h++) {
    hours.push(h);
  }

  const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
    a.start < b.end && b.start < a.end;

  const assignColumns = (items: { start: number; end: number; id: string }[]) => {
    const result: { id: string; col: number; totalInGroup: number }[] = [];
    for (const item of items) {
      const overlapping = items.filter((o) => o.id !== item.id && overlaps(item, o));
      const group = [item, ...overlapping].sort((a, b) => a.start - b.start);
      const myIdx = group.findIndex((g) => g.id === item.id);
      result.push({ id: item.id, col: myIdx < 2 ? myIdx : 2, totalInGroup: group.length });
    }
    return result;
  };

  const eventCols = assignColumns(
    timedEvents.map((e) => ({ id: e.event.id, start: e.start, end: e.end }))
  );
  const colMap = new Map(eventCols.map((c) => [c.id, c]));

  useEffect(() => {
    if (nowRef.current && isSelectedToday && nowOffset !== null) {
      nowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [dateStr, isSelectedToday, nowOffset]);

  return (
    <div className="space-y-4">
      {hasTimedItems ? (
      <div
        ref={scrollRef}
        className="relative max-h-[300px] overflow-y-auto overflow-x-hidden scroll-smooth rounded-lg border border-border-subtle subtask-scrollbar"
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, black 16px, black calc(100% - 16px), transparent 100%)',
        }}
      >
        <div className="relative flex min-h-[120px]" style={{ height: totalHeight }}>
          <div className="w-[48px] flex-shrink-0">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 text-[12px] text-fg-tertiary"
                style={{ top: (h * 60 - minMins) * (PX_PER_HOUR / 60) }}
              >
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </div>
            ))}
          </div>
          <div className="flex-1 ml-2 relative" style={{ marginLeft: HOUR_LABEL_WIDTH - 48 + 8 }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 border-t border-border-subtle opacity-50"
                style={{ top: (h * 60 - minMins) * (PX_PER_HOUR / 60) }}
              />
            ))}
            {timedEvents.map((e) => {
              const col = colMap.get(e.event.id);
              const colIdx = col?.col ?? 0;
              const totalInGroup = col?.totalInGroup ?? 1;
              const widthPct = colIdx < 2 ? (totalInGroup >= 2 ? 50 : 100) : 50;
              const colorRaw = e.event.calendarId === 'nudge'
                ? '#6366f1'
                : getEventColor(e.event.colorId, e.event.backgroundColor);
              const color = colorRaw.startsWith('var') ? '#6366f1' : colorRaw;
              const top = (e.start - minMins) * (PX_PER_HOUR / 60);
              const height = Math.max((e.end - e.start) * (PX_PER_HOUR / 60), 4);
              const isSmall = height < MIN_BLOCK_HEIGHT;
              const timeRange = formatEventTime(e.event);
              if (colIdx === 2) {
                return (
                  <button
                    key={e.event.id}
                    type="button"
                    onClick={() => !e.isFriend && !isReadOnly && onEditEvent(e.event)}
                    className="absolute left-0 rounded-md text-left overflow-hidden border-l-[3px] hover:opacity-90 transition-opacity flex items-center justify-center"
                    style={{
                      top,
                      height,
                      width: 'calc(50% - 4px)',
                      marginLeft: 'calc(50% + 4px)',
                      backgroundColor: hexToRgba(color, 0.2),
                      borderLeftColor: color,
                    }}
                  >
                    <span className="text-[11px] text-fg-tertiary">+1 more</span>
                  </button>
                );
              }
              return (
                <button
                  key={e.event.id}
                  type="button"
                  onClick={() => !e.isFriend && !isReadOnly && onEditEvent(e.event)}
                  className="absolute left-0 rounded-md text-left overflow-hidden border-l-[3px] hover:opacity-90 transition-opacity"
                  style={{
                    top,
                    height,
                    width: colIdx === 0 ? `${widthPct}%` : `calc(${widthPct}% - 4px)`,
                    marginLeft: colIdx === 1 ? 'calc(50% + 4px)' : 0,
                    backgroundColor: hexToRgba(color, 0.2),
                    borderLeftColor: color,
                  }}
                >
                  {isSmall ? (
                    <span className="block text-[13px] text-fg-primary truncate px-2 py-0.5">
                      {e.event.summary || 'Untitled'}
                    </span>
                  ) : (
                    <>
                      <span className="block text-[13px] text-fg-primary font-medium truncate px-2 pt-1">
                        {e.event.summary || 'Untitled'}
                      </span>
                      <span className="block text-[11px] text-fg-secondary truncate px-2">
                        {timeRange}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
            {timedTasks.map(({ task, timeLabel, mins }) => (
              <div
                key={task.id}
                className="absolute left-0 right-0 flex items-center gap-2 h-6 z-[1]"
                style={{ top: (mins - minMins) * (PX_PER_HOUR / 60) - 12 }}
              >
                <div className="w-0 h-4 flex-shrink-0 border-l-2 border-dashed border-fg-tertiary/60" aria-hidden />
                {!isReadOnly ? (
                <button
                  type="button"
                  onClick={() => onToggleComplete(task.id, !task.completed, dateStr)}
                  className="flex-shrink-0 w-4 h-4 rounded border border-fg-tertiary flex items-center justify-center bg-surface hover:border-primary transition-colors"
                >
                  {task.completed && <LuCheck size={10} className="text-primary" strokeWidth={3} />}
                </button>
                ) : (
                <div className="flex-shrink-0 w-4 h-4 rounded border border-fg-tertiary flex items-center justify-center bg-surface">
                  {task.completed && <LuCheck size={10} className="text-primary" strokeWidth={3} />}
                </div>
                )}
                <span className="text-[13px] text-fg-primary truncate">{task.text}</span>
              </div>
            ))}
            {nowOffset !== null && (
              <div
                ref={nowRef}
                className="absolute left-0 right-0 flex items-center gap-2 z-10"
                style={{ top: nowOffset - 1 }}
              >
                <span className="text-[10px] text-primary font-medium flex-shrink-0 w-[48px]">NOW</span>
                <div className="flex-1 h-0.5 bg-primary" />
              </div>
            )}
          </div>
        </div>
      </div>
      ) : (
        <p className="text-[13px] text-fg-tertiary text-center py-6">No scheduled events or tasks</p>
      )}
      {!isReadOnly && (
        <button
          onClick={onAddEvent}
          className="flex items-center gap-2 text-[13px] text-primary py-2"
        >
          <LuCalendarPlus size={16} />
          Add event
        </button>
      )}
      {todoTasks.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <p className="text-[11px] text-fg-tertiary uppercase tracking-wider mb-3">To do</p>
          <div className="space-y-1">
            {todoTasks.map((task) => (
              <CompactTaskRow
                key={task.id}
                task={task}
                dateStr={dateStr}
                onToggleComplete={(taskId, completed) => onToggleComplete(taskId, completed, dateStr)}
                onDelete={onDelete}
                onNavigate={onNavigate}
                isReadOnly={isReadOnly}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineTaskRow({
  task,
  timeLabel,
  selectedDate,
  onToggleComplete,
}: {
  task: TaskWithUser;
  timeLabel: string;
  selectedDate: string;
  onToggleComplete: (taskId: string, completed: boolean, dateStr?: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 min-h-[44px]">
      <span className={`${TIME_COLUMN_WIDTH} text-[12px] text-fg-secondary shrink-0`}>{timeLabel}</span>
      <div className="w-0.5 h-8 flex-shrink-0 border-l-2 border-dashed border-fg-tertiary/50" />
      <button
        type="button"
        onClick={() => onToggleComplete(task.id, !task.completed, selectedDate)}
        className="flex-shrink-0 w-5 h-5 rounded border-2 border-fg-tertiary flex items-center justify-center hover:border-primary transition-colors"
      >
        {task.completed && <LuCheck size={12} className="text-primary" strokeWidth={3} />}
      </button>
      <p className={`text-[14px] font-medium truncate flex-1 min-w-0 ${task.completed ? 'line-through text-fg-tertiary' : 'text-fg-primary'}`}>
        {task.text}
      </p>
    </div>
  );
}

function CompactTaskRow({
  task,
  dateStr,
  onToggleComplete,
  onDelete,
  onNavigate,
  isReadOnly = false,
}: {
  task: TaskWithUser;
  dateStr: string;
  onToggleComplete: (taskId: string, completed: boolean, dateStr?: string) => void;
  onDelete: (taskId: string) => void;
  onNavigate: () => void;
  isReadOnly?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isOverdue = task.dueDate && !task.completed && task.dueDate < Date.now();
  const dueDateStr = task.dueDate ? getDateString(task.dueDate) : null;
  const isDueToday = dueDateStr === dateStr;
  const showDueBadge = !task.completed && (isOverdue || isDueToday) && task.dueDate;

  const formatDue = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const today = getTodayString();
    const taskDay = getDateString(ts);
    if (taskDay < today) return 'Overdue';
    if (taskDay === today) return 'Today';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          onNavigate();
        }}
        onKeyDown={(e) => e.key === 'Enter' && onNavigate()}
        className="flex items-center gap-3 h-11 min-h-[44px] rounded-lg hover:bg-surface-muted transition-colors cursor-pointer group"
      >
        {!isReadOnly ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id, !task.completed, dateStr); }}
            className="flex-shrink-0 w-5 h-5 rounded border-2 border-fg-tertiary flex items-center justify-center hover:border-primary transition-colors"
          >
            {task.completed && <LuCheck size={12} className="text-primary" strokeWidth={3} />}
          </button>
        ) : (
          <div className="flex-shrink-0 w-5 h-5 rounded border-2 border-fg-tertiary flex items-center justify-center">
            {task.completed && <LuCheck size={12} className="text-primary" strokeWidth={3} />}
          </div>
        )}
        <p className={`text-[14px] font-medium truncate flex-1 min-w-0 ${task.completed ? 'line-through text-fg-tertiary' : 'text-fg-primary'}`}>
          {task.text}
        </p>
        {showDueBadge && (
          <span className={`flex-shrink-0 px-2 py-0.5 text-[11px] font-medium rounded ${isOverdue ? 'bg-error/12 text-error' : 'bg-primary/10 text-primary'}`}>
            {formatDue(task.dueDate!)}
          </span>
        )}
        {!isReadOnly && (
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-2 text-fg-tertiary hover:text-fg-primary rounded-lg"
          >
            <FaEllipsisV size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 py-1 bg-elevated rounded-lg shadow-elevation-2 border border-border-subtle z-20 min-w-[120px]">
                <button
                  onClick={() => { setShowDeleteConfirm(true); setMenuOpen(false); }}
                  className="w-full px-4 py-2 text-left text-[13px] text-error hover:bg-surface-muted"
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
        )}
      </div>
      {!isReadOnly && showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-surface rounded-2xl p-6 max-w-sm w-full">
            <p className="text-[16px] font-medium text-fg-primary mb-4">Delete this task?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-fg-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(task.id); setShowDeleteConfirm(false); }}
                className="flex-1 py-2.5 rounded-xl bg-error text-white font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FriendEventRow({
  event,
  friendName,
  viewLevel,
}: {
  event: CalendarEvent;
  friendName: string;
  viewLevel: 'full' | 'busy' | 'none';
}) {
  const color = getEventColor(event.colorId, event.backgroundColor);
  const past = isEventPast(event);
  if (viewLevel === 'none') return null;
  return (
    <div className={`flex items-center gap-3 py-3 min-h-[44px] ${past ? 'opacity-50' : 'opacity-70'}`}>
      <span className={`${TIME_COLUMN_WIDTH} text-[12px] text-fg-tertiary shrink-0`}>{formatEventTime(event)}</span>
      <div className="w-0.5 h-8 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <p className="text-[14px] font-medium text-fg-primary truncate">
          {viewLevel === 'full' ? (event.summary || 'Untitled') : 'Busy'}
        </p>
        {event.calendarId !== 'nudge' && (
          <span className="text-[8px] text-fg-tertiary font-medium shrink-0">G</span>
        )}
      </div>
    </div>
  );
}

function EventRow({
  event,
  onEdit,
  onDelete,
  isOwn,
}: {
  event: CalendarEvent;
  onEdit: () => void;
  onDelete: () => void;
  isOwn: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const color = getEventColor(event.colorId, event.backgroundColor);
  const past = isEventPast(event);
  const ongoing = isEventOngoing(event);

  const handleDelete = () => {
    setMenuOpen(false);
    setShowDeleteConfirm(true);
  };

  return (
    <>
      <div className={`flex items-center gap-3 py-3 min-h-[44px] group ${past ? 'opacity-50' : ''}`}>
        <span className={`${TIME_COLUMN_WIDTH} text-[12px] text-fg-tertiary shrink-0`}>{formatEventTime(event)}</span>
        <div className="w-0.5 h-8 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[14px] font-medium text-fg-primary truncate flex-1 min-w-0">{event.summary || 'Untitled'}</p>
            {event.calendarId !== 'nudge' && (
              <span className="text-[8px] text-fg-tertiary font-medium shrink-0">G</span>
            )}
            {ongoing && (
              <span className="flex-shrink-0 px-2 py-0.5 text-[8px] font-medium text-white bg-primary rounded-full animate-now-pulse">
                NOW
              </span>
            )}
          </div>
          {event.location && (
            <p className="text-[12px] text-fg-tertiary truncate mt-0.5">{event.location}</p>
          )}
        </div>
        {isOwn && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 text-fg-tertiary hover:text-fg-primary rounded-lg"
            >
              <FaEllipsisV size={14} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 py-1 bg-elevated rounded-lg shadow-elevation-2 border border-border-subtle z-20 min-w-[120px]">
                  <button onClick={() => { onEdit(); setMenuOpen(false); }} className="w-full px-4 py-2 text-left text-[13px] text-fg-primary hover:bg-surface-muted">
                    Edit
                  </button>
                  {event.htmlLink && (
                    <a
                      href={event.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full px-4 py-2 text-left text-[13px] text-primary hover:bg-surface-muted"
                      onClick={() => setMenuOpen(false)}
                    >
                      Open in Google Calendar
                    </a>
                  )}
                  <button onClick={handleDelete} className="w-full px-4 py-2 text-left text-[13px] text-error hover:bg-surface-muted">
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-surface rounded-2xl p-6 max-w-sm w-full">
            <p className="text-[16px] font-medium text-fg-primary mb-4">Delete this event?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-border-subtle text-fg-primary"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(); setShowDeleteConfirm(false); }}
                className="flex-1 py-2.5 rounded-xl bg-error text-white font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
