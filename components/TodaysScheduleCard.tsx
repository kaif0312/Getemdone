'use client';

import { useState, useEffect } from 'react';
import { LuCalendar, LuChevronDown, LuChevronUp, LuLock, LuCalendarPlus } from 'react-icons/lu';
import type { CalendarEvent } from '@/lib/types';
import { canViewEvent } from '@/utils/visibility';
import { getEventColor } from './CalendarEventForm';
import { formatEventTime, isEventPast, isEventOngoing } from '@/utils/calendarEvent';

function getEventColorForEvent(event: CalendarEvent): string {
  return getEventColor(event.colorId, event.backgroundColor);
}

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateShort(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export interface TodaysScheduleCardProps {
  /** Events for today (already filtered). Empty = loading or no events. */
  events: CalendarEvent[];
  /** Current user ID (viewer) - for visibility checks */
  currentUserId: string;
  /** Owner of the schedule (whose events these are) */
  ownerId: string;
  /** Is this the current user's own schedule? */
  isOwn: boolean;
  /** Loading state - show skeleton */
  loading?: boolean;
  /** Friend has no calendar connected - hide section entirely */
  hideSection?: boolean;
  /** Callback when user taps an event (own schedule only) */
  onEventTap?: (event: CalendarEvent) => void;
  /** Callback when user taps Add event (own schedule only) */
  onAddEvent?: () => void;
  /** Pending task count (for nudge prompt when free all day) */
  pendingTaskCount?: number;
  /** Callback to send nudge (friend schedule only) */
  onNudge?: () => void;
  /** Can show nudge (friend free + has pending tasks + not rate limited) */
  canNudge?: boolean;
}

const MAX_EVENTS_DEFAULT = 5;

export default function TodaysScheduleCard({
  events,
  currentUserId,
  ownerId,
  isOwn,
  loading = false,
  hideSection = false,
  onEventTap,
  onAddEvent,
  pendingTaskCount = 0,
  onNudge,
  canNudge = false,
}: TodaysScheduleCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [showAllEvents, setShowAllEvents] = useState(false);

  const todayStr = getTodayString();
  const isOwner = ownerId === currentUserId;

  // Filter events for today and apply visibility
  const visibleEvents = events
    .filter((e) => {
      const d = e.start?.date || e.start?.dateTime?.slice(0, 10);
      if (d !== todayStr) return false;
      const view = canViewEvent(e, currentUserId, isOwner);
      return view !== 'none';
    })
    .sort((a, b) => {
      const aAllDay = !!a.start?.date;
      const bAllDay = !!b.start?.date;
      if (aAllDay && !bAllDay) return -1;
      if (!aAllDay && bAllDay) return 1;
      if (aAllDay && bAllDay) return 0;
      const aStart = a.start?.dateTime || '';
      const bStart = b.start?.dateTime || '';
      return aStart.localeCompare(bStart);
    });

  const eventsToShow = showAllEvents ? visibleEvents : visibleEvents.slice(0, MAX_EVENTS_DEFAULT);
  const hasMore = visibleEvents.length > MAX_EVENTS_DEFAULT;
  const moreCount = visibleEvents.length - MAX_EVENTS_DEFAULT;

  if (hideSection) return null;

  if (loading) {
    return (
      <div className="bg-surface rounded-lg shadow-elevation-2 border border-border-subtle p-4 mb-4 animate-in fade-in duration-200">
        <div className="h-[60px] bg-surface-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  const hasAnyEvents = visibleEvents.length > 0;
  const freeAllDay = !hasAnyEvents;
  const schedulePrivate = events.length > 0 && visibleEvents.length === 0; // They have events but none shared

  // No events and not "schedule private" - could be free all day or no data
  const headerText = freeAllDay
    ? "Today's Schedule · Free all day"
    : schedulePrivate
      ? "Today's Schedule"
      : "Today's Schedule";

  const needsExpand = hasAnyEvents || schedulePrivate;

  return (
    <div className="bg-surface rounded-lg shadow-elevation-2 border border-border-subtle p-4 mb-4 animate-in slide-in-from-top-2 fade-in duration-200">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <LuCalendar size={14} className="text-fg-secondary flex-shrink-0" />
          <span
            className={`text-[13px] font-semibold truncate ${
              freeAllDay || schedulePrivate ? 'text-fg-secondary' : 'text-fg-primary'
            }`}
          >
            {headerText}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[12px] text-fg-tertiary">{formatDateShort()}</span>
          {needsExpand && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-fg-tertiary hover:text-fg-secondary transition-colors"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <LuChevronUp size={14} /> : <LuChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="mt-3 transition-all duration-200">
          {schedulePrivate && (
            <p className="flex items-center gap-2 text-[13px] text-fg-tertiary italic">
              <LuLock size={12} />
              Schedule is private
            </p>
          )}

          {freeAllDay && !schedulePrivate && (
            <p className="text-[13px] text-fg-tertiary">Free all day</p>
          )}

          {hasAnyEvents && (
            <div className="space-y-1">
              {eventsToShow.map((event, idx) => {
                const isAllDay = !!event.start?.date;
                const prevAllDay = idx > 0 && !!visibleEvents[idx - 1]?.start?.date;
                const showDivider = isAllDay && !prevAllDay && idx > 0;
                return (
                  <div key={event.id}>
                    {showDivider && <div className="border-t border-border-subtle my-2" />}
                    <ScheduleEventRow
                      event={event}
                      viewLevel={canViewEvent(event, currentUserId, isOwner)}
                      isOwn={isOwn}
                      onTap={onEventTap}
                      currentUserId={currentUserId}
                      ownerId={ownerId}
                    />
                  </div>
                );
              })}
              {hasMore && !showAllEvents && (
                <button
                  onClick={() => setShowAllEvents(true)}
                  className="text-[12px] text-primary hover:underline mt-1"
                >
                  and {moreCount} more event{moreCount !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          )}

          {isOwn && onAddEvent && (
            <button
              onClick={onAddEvent}
              className="flex items-center gap-1.5 text-[12px] text-primary hover:underline mt-3"
            >
              <LuCalendarPlus size={12} />
              Add event
            </button>
          )}

          {!isOwn && canNudge && onNudge && freeAllDay && pendingTaskCount > 0 && (
            <div className="mt-3 pt-3 border-t border-border-subtle">
              <p className="text-[13px] text-fg-secondary mb-2">
                Free all day with {pendingTaskCount} task{pendingTaskCount !== 1 ? 's' : ''} pending — send a nudge?
              </p>
              <button
                onClick={onNudge}
                className="px-3 py-1.5 text-[13px] font-medium text-white bg-primary rounded-full hover:opacity-90 transition-opacity"
              >
                Nudge
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleEventRow({
  event,
  viewLevel,
  isOwn,
  onTap,
  currentUserId,
  ownerId,
}: {
  event: CalendarEvent;
  viewLevel: 'full' | 'busy' | 'none';
  isOwn: boolean;
  onTap?: (event: CalendarEvent) => void;
  currentUserId: string;
  ownerId: string;
}) {
  const timeStr = formatEventTime(event);
  const isPast = isEventPast(event);
  const isOngoing = isEventOngoing(event);
  const title = viewLevel === 'full' ? (event.summary || 'Untitled') : 'Busy';
  const color = viewLevel === 'busy' ? 'rgba(128,128,128,0.3)' : getEventColorForEvent(event);

  const content = (
    <div
      className={`flex items-center gap-2 h-9 min-h-[36px] ${
        isOwn && onTap ? 'cursor-pointer hover:bg-surface-muted rounded-lg px-2 -mx-2' : ''
      } ${isPast ? 'opacity-50' : ''}`}
      onClick={isOwn && onTap ? () => onTap(event) : undefined}
    >
      <span className="w-[110px] text-right text-[12px] text-fg-tertiary flex-shrink-0">
        {timeStr}
      </span>
      <div
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 ml-2"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span
          className={`text-[14px] truncate ${
            viewLevel === 'busy' ? 'text-fg-tertiary italic' : 'text-fg-primary'
          }`}
        >
          {title}
        </span>
        {event.calendarId !== 'nudge' && (
          <span className="text-[8px] text-fg-tertiary font-medium shrink-0">G</span>
        )}
        {isOngoing && !isPast && (
          <span className="flex-shrink-0 px-2 py-0.5 text-[8px] font-medium text-white bg-primary rounded-full animate-now-pulse">
            NOW
          </span>
        )}
      </div>
    </div>
  );

  return content;
}
