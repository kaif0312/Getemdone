'use client';

import { useRef, useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { LuCheck, LuZap } from 'react-icons/lu';
import Avatar from './Avatar';
import { FocusPresenceData } from '@/lib/types';
import { formatElapsed } from '@/hooks/useFocusPresence';
import { getPresenceElapsedSeconds } from '@/hooks/useFriendPresence';

const RING_CIRCUMFERENCE = 2 * Math.PI * 21; // r=21, viewBox 46×46

interface FriendSummary {
  id: string;
  name: string;
  photoURL?: string;
  pendingCount: number;
  completedToday: number;
  color: { from: string; to: string; text: string };
  /** Live focus presence for this friend — null/undefined = not focused */
  focusPresence?: FocusPresenceData | null;
}

interface SortableFriendsSummaryBarProps {
  /** The logged-in user's display name — shown as the "Me" pill */
  selfName: string;
  selfPhotoURL?: string;
  selfPendingCount: number;
  selfCompletedToday: number;
  /** Whether the logged-in user is currently in focus mode */
  selfFocusActive?: boolean;
  /** Elapsed seconds of the self focus session (for display) */
  selfFocusElapsed?: number;
  friends: FriendSummary[];
  /** 0 = Me, 1..n = friend[i-1] */
  activePageIndex: number;
  onPageChange: (index: number) => void;
  onReorder: (newOrder: string[]) => void;
}

/** Pulsing green dot shown on avatar corner when friend is in focus */
function FocusDot() {
  return (
    <span
      className="absolute top-0 right-0 w-3 h-3 rounded-full bg-success border-2 border-surface flex items-center justify-center"
      aria-label="In focus mode"
    >
      <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-75" />
    </span>
  );
}

function SortableFriendCard({
  friend,
  isActive,
  tabRef,
  onPageChange,
}: {
  friend: FriendSummary;
  isActive: boolean;
  tabRef: (el: HTMLButtonElement | null) => void;
  onPageChange: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: friend.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
    ...(isDragging && { willChange: 'transform' as const }),
  };

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const totalTasks = friend.completedToday + friend.pendingCount;
  const progress = totalTasks > 0 ? friend.completedToday / totalTasks : 0;
  const isFocused = !!friend.focusPresence?.isActive;
  const focusElapsed = isFocused ? getPresenceElapsedSeconds(friend.focusPresence!) : 0;

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0">
      <button
        ref={(el) => {
          setActivatorNodeRef(el);
          tabRef(el);
        }}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          onPageChange();
        }}
        className="flex flex-col items-center gap-1 min-w-[56px] pb-3 touch-manipulation cursor-grab active:cursor-grabbing transition-colors"
        style={{ touchAction: 'pan-x' }}
        title={isFocused ? `${friend.name} is in focus · ${formatElapsed(focusElapsed)}` : 'Tap to view, hold to reorder'}
      >
        <div className={`relative flex-shrink-0 rounded-full transition-transform duration-150 ${isActive ? 'scale-105' : ''}`}>
          {friend.photoURL ? (
            <Avatar
              photoURL={friend.photoURL}
              displayName={friend.name}
              size="md"
              className="w-10 h-10 border border-border-subtle"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center font-medium text-sm text-fg-secondary border border-border-subtle">
              {friend.name.charAt(0).toUpperCase()}
            </div>
          )}

          {/* Focus presence indicator dot */}
          {isFocused && <FocusDot />}

          {/* Task progress ring — only shown when not in focus and has tasks */}
          {!isFocused && totalTasks > 0 && (
            <svg
              className="absolute pointer-events-none"
              style={{ inset: -3, width: 'calc(100% + 6px)', height: 'calc(100% + 6px)' }}
              viewBox="0 0 46 46"
              aria-hidden="true"
            >
              <circle cx="23" cy="23" r="21" fill="none"
                stroke="var(--color-fg-tertiary)" strokeWidth="2.5" opacity="0.2"
                strokeLinecap="round"
              />
              <circle cx="23" cy="23" r="21" fill="none"
                stroke={progress >= 1 ? 'var(--color-success)' : 'var(--color-primary)'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center',
                  transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 500ms ease, stroke 300ms ease',
                }}
              />
            </svg>
          )}

          {/* Focus ring — animated green ring when in focus */}
          {isFocused && (
            <svg
              className="absolute pointer-events-none"
              style={{ inset: -3, width: 'calc(100% + 6px)', height: 'calc(100% + 6px)' }}
              viewBox="0 0 46 46"
              aria-hidden="true"
            >
              <circle cx="23" cy="23" r="21" fill="none"
                stroke="var(--color-success)" strokeWidth="2.5" opacity="0.3"
                strokeLinecap="round"
              />
              <circle cx="23" cy="23" r="21" fill="none"
                stroke="var(--color-success)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="12 120"
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: 'center',
                  animation: prefersReducedMotion ? 'none' : 'focus-ring-spin 3s linear infinite',
                }}
              />
            </svg>
          )}
        </div>

        <div className={`text-sm font-medium truncate max-w-[72px] text-center transition-colors ${isActive ? 'text-primary' : 'text-fg-primary'}`}>
          {friend.name}
        </div>

        {/* Subtitle: focus elapsed OR task counts */}
        <div className="flex items-center justify-center gap-0.5 text-xs">
          {isFocused ? (
            <span className="text-success font-medium flex items-center gap-0.5">
              <LuZap size={9} />
              {formatElapsed(focusElapsed)}
            </span>
          ) : (
            <span className="text-fg-secondary">
              {friend.pendingCount > 0 && `${friend.pendingCount} pending`}
              {friend.completedToday > 0 && friend.pendingCount === 0 && (
                <span className="inline-flex items-center gap-0.5">{friend.completedToday}<LuCheck size={10} /></span>
              )}
              {friend.pendingCount === 0 && friend.completedToday === 0 && '—'}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

export default function SortableFriendsSummaryBar({
  selfName,
  selfPhotoURL,
  selfPendingCount,
  selfCompletedToday,
  selfFocusActive = false,
  selfFocusElapsed = 0,
  friends,
  activePageIndex,
  onPageChange,
  onReorder,
}: SortableFriendsSummaryBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // One ref per tab: index 0 = Me, 1..n = friends
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 20 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Update sliding indicator position when activePageIndex or tabs change
  useEffect(() => {
    const activeTab = tabRefs.current[activePageIndex];
    const container = scrollContainerRef.current;
    if (!activeTab || !container) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    const scrollLeft = container.scrollLeft;

    setIndicatorStyle({
      left: tabRect.left - containerRect.left + scrollLeft,
      width: tabRect.width,
    });
  }, [activePageIndex, friends.length]);

  // Auto-scroll active tab into view
  useEffect(() => {
    tabRefs.current[activePageIndex]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'nearest',
      block: 'nearest',
    });
  }, [activePageIndex]);

  const handleDragStart = (_event: DragStartEvent) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'hidden';
      scrollContainerRef.current.style.touchAction = 'none';
    }
  };

  const restoreScrollContainer = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.overflowX = 'auto';
      scrollContainerRef.current.style.touchAction = '';
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    restoreScrollContainer();
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const friendIds = friends.map((f) => f.id);
    const oldIndex = friendIds.indexOf(active.id as string);
    const newIndex = friendIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(friendIds, oldIndex, newIndex));
  };

  const handleDragCancel = () => restoreScrollContainer();

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const selfTotalTasks = selfCompletedToday + selfPendingCount;
  const selfProgress = selfTotalTasks > 0 ? selfCompletedToday / selfTotalTasks : 0;

  return (
    <div className="bg-surface border-b border-border-emphasized shadow-sm z-30">
      <div className="max-w-3xl mx-auto px-4 pt-3">
        <div className="relative">
          <div
            ref={scrollContainerRef}
            className="flex items-start gap-6 overflow-x-auto scrollbar-hide friends-bar-fade"
            style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
          >
            {/* Me pill — always page 0, not sortable */}
            <button
              ref={(el) => { tabRefs.current[0] = el; }}
              onClick={() => onPageChange(0)}
              className="flex flex-col items-center gap-1 min-w-[56px] pb-3 flex-shrink-0 touch-manipulation"
              title={selfFocusActive ? `You are in focus · ${formatElapsed(selfFocusElapsed)}` : undefined}
            >
              <div className={`relative flex-shrink-0 rounded-full transition-transform duration-150 ${activePageIndex === 0 ? 'scale-105' : ''}`}>
                {selfPhotoURL ? (
                  <Avatar
                    photoURL={selfPhotoURL}
                    displayName={selfName}
                    size="md"
                    className="w-10 h-10 border border-border-subtle"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center font-medium text-sm text-fg-secondary border border-border-subtle">
                    {selfName.charAt(0).toUpperCase()}
                  </div>
                )}

                {selfFocusActive && <FocusDot />}

                {!selfFocusActive && selfTotalTasks > 0 && (
                  <svg
                    className="absolute pointer-events-none"
                    style={{ inset: -3, width: 'calc(100% + 6px)', height: 'calc(100% + 6px)' }}
                    viewBox="0 0 46 46"
                    aria-hidden="true"
                  >
                    <circle cx="23" cy="23" r="21" fill="none"
                      stroke="var(--color-fg-tertiary)" strokeWidth="2.5" opacity="0.2"
                      strokeLinecap="round"
                    />
                    <circle cx="23" cy="23" r="21" fill="none"
                      stroke={selfProgress >= 1 ? 'var(--color-success)' : 'var(--color-primary)'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={RING_CIRCUMFERENCE}
                      strokeDashoffset={RING_CIRCUMFERENCE * (1 - selfProgress)}
                      style={{
                        transform: 'rotate(-90deg)',
                        transformOrigin: 'center',
                        transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 500ms ease, stroke 300ms ease',
                      }}
                    />
                  </svg>
                )}

                {selfFocusActive && (
                  <svg
                    className="absolute pointer-events-none"
                    style={{ inset: -3, width: 'calc(100% + 6px)', height: 'calc(100% + 6px)' }}
                    viewBox="0 0 46 46"
                    aria-hidden="true"
                  >
                    <circle cx="23" cy="23" r="21" fill="none"
                      stroke="var(--color-success)" strokeWidth="2.5" opacity="0.3"
                      strokeLinecap="round"
                    />
                    <circle cx="23" cy="23" r="21" fill="none"
                      stroke="var(--color-success)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray="12 120"
                      style={{
                        transform: 'rotate(-90deg)',
                        transformOrigin: 'center',
                        animation: prefersReducedMotion ? 'none' : 'focus-ring-spin 3s linear infinite',
                      }}
                    />
                  </svg>
                )}
              </div>

              <div className={`text-sm font-medium truncate max-w-[72px] text-center transition-colors ${activePageIndex === 0 ? 'text-primary' : 'text-fg-primary'}`}>
                Me
              </div>
              <div className="text-xs">
                {selfFocusActive ? (
                  <span className="text-success font-medium flex items-center gap-0.5">
                    <LuZap size={9} />
                    {formatElapsed(selfFocusElapsed)}
                  </span>
                ) : (
                  <span className="text-fg-secondary">
                    {selfPendingCount > 0
                      ? `${selfPendingCount} pending`
                      : selfCompletedToday > 0
                      ? <span className="inline-flex items-center gap-0.5">{selfCompletedToday}<LuCheck size={10} /></span>
                      : '—'}
                  </span>
                )}
              </div>
            </button>

            {/* Friend pills — sortable */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext items={friends.map((f) => f.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex items-start gap-6 min-w-max">
                  {friends.map((friend, i) => (
                    <SortableFriendCard
                      key={friend.id}
                      friend={friend}
                      isActive={activePageIndex === i + 1}
                      tabRef={(el) => { tabRefs.current[i + 1] = el; }}
                      onPageChange={() => onPageChange(i + 1)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Sliding active underline */}
          <div
            className="absolute bottom-0 h-[2px] bg-primary rounded-full"
            style={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              transition: prefersReducedMotion ? 'none' : 'left 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94), width 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
