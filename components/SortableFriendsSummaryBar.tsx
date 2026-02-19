'use client';

import { useRef } from 'react';
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
import { FaLock } from 'react-icons/fa';
import { LuCheck } from 'react-icons/lu';
import Avatar from './Avatar';

interface FriendSummary {
  id: string;
  name: string;
  photoURL?: string;
  pendingCount: number;
  completedToday: number;
  privateTotal: number;
  privateCompleted: number;
  color: { from: string; to: string; text: string };
}

interface SortableFriendsSummaryBarProps {
  friends: FriendSummary[];
  activeFriendId: string | null;
  onFriendClick: (friendId: string) => void;
  onReorder: (newOrder: string[]) => void;
}

function SortableFriendCard({
  friend,
  isActive,
  onFriendClick,
}: {
  friend: FriendSummary;
  isActive: boolean;
  onFriendClick: (friendId: string) => void;
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

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0">
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          onFriendClick(friend.id);
        }}
        className="flex flex-col items-center gap-1 min-w-[56px] touch-manipulation cursor-grab active:cursor-grabbing transition-colors"
        style={{ touchAction: 'pan-x' }}
        title="Tap to select, hold to reorder"
      >
        {/* Avatar: 40px, surface-elevated for letter fallback, 1px border for photo. Active: subtle ring primary 40% */}
        <div className={`relative flex-shrink-0 rounded-full ${isActive ? 'ring-2 ring-primary/40' : ''}`}>
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
          {/* Active indicator: small primary dot below */}
        </div>
        {/* Name: 13px medium, primary, single line ellipsis */}
        <div className="text-sm font-medium text-fg-primary truncate max-w-[72px] text-center">
          {friend.name}
        </div>
        {/* Pending count: 12px secondary. Lock icon 12px tertiary next to it */}
        <div className="flex items-center justify-center gap-1 text-xs text-fg-secondary">
          <span>
            {friend.pendingCount > 0 && `${friend.pendingCount} pending`}
            {friend.completedToday > 0 && friend.pendingCount === 0 && <span className="inline-flex items-center gap-0.5">{friend.completedToday}<LuCheck size={10} /></span>}
            {friend.pendingCount === 0 && friend.completedToday === 0 && '—'}
          </span>
          {friend.privateTotal > 0 && (
            <FaLock size={12} className="text-fg-tertiary shrink-0" title={`${friend.privateTotal} private`} />
          )}
        </div>
      </button>
    </div>
  );
}

export default function SortableFriendsSummaryBar({
  friends,
  activeFriendId,
  onFriendClick,
  onReorder,
}: SortableFriendsSummaryBarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 400, tolerance: 20 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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

    const reordered = arrayMove(friendIds, oldIndex, newIndex);
    onReorder(reordered);
  };

  const handleDragCancel = () => {
    restoreScrollContainer();
  };

  if (friends.length === 0) return null;

  return (
    <div className="sticky top-[73px] md:top-[81px] z-30 bg-surface border-b border-border-emphasized shadow-sm">
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div
          ref={scrollContainerRef}
          className="flex items-center gap-6 overflow-x-auto scrollbar-hide pb-2 friends-bar-fade"
          style={{
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorX: 'contain',
          }}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext items={friends.map((f) => f.id)} strategy={horizontalListSortingStrategy}>
              <div className="flex items-center gap-6 min-w-max">
                {friends.map((friend) => (
                  <SortableFriendCard
                    key={friend.id}
                    friend={friend}
                    isActive={activeFriendId === friend.id}
                    onFriendClick={onFriendClick}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
