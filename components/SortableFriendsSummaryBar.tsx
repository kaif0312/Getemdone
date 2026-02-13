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

  const hasActivity = friend.pendingCount > 0 || friend.completedToday > 0;

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
        className={`
          flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors touch-manipulation cursor-grab active:cursor-grabbing
          ${isActive
            ? `bg-gradient-to-r ${friend.color.from} ${friend.color.to} text-white shadow-md scale-105`
            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }
        `}
        style={{ touchAction: 'pan-x' }}
        title="Tap to select, hold to reorder"
      >
        {friend.photoURL ? (
          <Avatar
            photoURL={friend.photoURL}
            displayName={friend.name}
            size="md"
            className={isActive ? 'border-2 border-white' : ''}
          />
        ) : (
          <div
            className={`
              w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
              ${isActive
                ? 'bg-white text-gray-700'
                : `bg-gradient-to-r ${friend.color.from} ${friend.color.to} text-white`
              }
            `}
          >
            {friend.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-xs font-medium truncate max-w-[60px]">
          {friend.name}
        </div>
        {hasActivity && (
          <div
            className={`
              text-[10px] font-semibold px-1.5 py-0.5 rounded-full
              ${isActive
                ? 'bg-white/20 text-white'
                : 'bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300'
              }
            `}
          >
            {friend.pendingCount > 0 && (
              <span>{friend.pendingCount} pending</span>
            )}
            {friend.completedToday > 0 && friend.pendingCount === 0 && (
              <span>{friend.completedToday}✓</span>
            )}
          </div>
        )}
        {friend.privateTotal > 0 && (
          <div
            className={`
              text-[10px] flex items-center gap-0.5
              ${isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}
            `}
          >
            <FaLock size={8} />
            <span>{friend.privateTotal}</span>
            {friend.privateCompleted > 0 && (
              <span className="opacity-75">({friend.privateCompleted}✓)</span>
            )}
          </div>
        )}
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
    <div className="sticky top-[73px] md:top-[81px] z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="max-w-3xl mx-auto px-4 py-2">
        <div
          ref={scrollContainerRef}
          className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2"
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
              <div className="flex items-center gap-2 min-w-max">
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
