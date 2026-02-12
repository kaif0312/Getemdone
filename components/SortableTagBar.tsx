'use client';

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
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';

interface SortableTagBarProps {
  emojis: string[];
  activeTagFilters: string[];
  onTagClick: (emoji: string) => void;
  onAllClick: () => void;
  onReorder: (newOrder: string[]) => void;
}

function SortableEmojiButton({
  emoji,
  isActive,
  onClick,
}: {
  emoji: string;
  isActive: boolean;
  onClick: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: emoji });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0">
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        className={`flex-shrink-0 h-9 w-9 min-w-[36px] min-h-[36px] rounded-full text-base transition-all duration-150 flex items-center justify-center touch-manipulation cursor-grab active:cursor-grabbing ${
          isActive
            ? 'bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500 dark:ring-blue-400'
            : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
        }`}
        style={{ touchAction: 'none' }}
        onPointerDown={() => {
          if ('vibrate' in navigator) navigator.vibrate(25);
        }}
      >
        {emoji}
      </button>
    </div>
  );
}

export default function SortableTagBar({
  emojis,
  activeTagFilters,
  onTagClick,
  onAllClick,
  onReorder,
}: SortableTagBarProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = emojis.indexOf(active.id as string);
    const newIndex = emojis.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(emojis, oldIndex, newIndex);
    onReorder(reordered);
  };

  return (
    <div className="overflow-x-auto scrollbar-hide -mx-1 px-1 py-1.5">
      <div className="flex items-center gap-2 min-w-max">
        <button
          onClick={onAllClick}
          className={`flex-shrink-0 h-9 px-3 rounded-full text-xs font-medium transition-all duration-150 flex items-center justify-center ${
            activeTagFilters.length === 0
              ? 'bg-blue-600 dark:bg-blue-500 text-white'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          All
        </button>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={emojis} strategy={horizontalListSortingStrategy}>
            <div className="flex items-center gap-2">
              {emojis.map((emoji) => (
                <SortableEmojiButton
                  key={emoji}
                  emoji={emoji}
                  isActive={activeTagFilters.includes(emoji)}
                  onClick={() => onTagClick(emoji)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
