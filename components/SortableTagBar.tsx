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
import { LuLayoutGrid } from 'react-icons/lu';
import { getIconForTag, getLabelForTag } from '@/lib/tagIcons';

interface SortableTagBarProps {
  tagIds: string[];
  activeTagFilters: string[];
  onTagClick: (tagId: string) => void;
  onAllClick: () => void;
  onReorder: (newOrder: string[]) => void;
}

function SortableTagButton({
  tagId,
  isActive,
  onClick,
}: {
  tagId: string;
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
  } = useSortable({ id: tagId });

  const Icon = getIconForTag(tagId);
  const label = getLabelForTag(tagId);

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
        className={`
          relative flex flex-col items-center justify-end flex-shrink-0 w-8 min-w-[32px] h-10 md:w-12 md:h-12 touch-manipulation cursor-grab active:cursor-grabbing
          transition-all duration-150
          ${isActive
            ? 'text-primary'
            : 'text-fg-secondary hover:text-fg-primary'
          }
        `}
        style={{ touchAction: 'pan-x' }}
        onPointerDown={() => {
          if ('vibrate' in navigator) navigator.vibrate(25);
        }}
      >
        <span
          className={`
            flex items-center justify-center w-8 h-8 rounded-full transition-colors
            ${isActive
              ? 'bg-primary/[0.08] dark:bg-primary/[0.10]'
              : ''
            }
          `}
        >
          <Icon size={20} strokeWidth={1.5} className="flex-shrink-0" />
        </span>
        <span className={`hidden md:block text-[11px] mt-0.5 truncate max-w-full px-0.5 ${isActive ? 'text-primary' : 'text-fg-secondary'}`}>
          {label}
        </span>
        {isActive && (
          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full md:hidden" />
        )}
      </button>
    </div>
  );
}

export default function SortableTagBar({
  tagIds,
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
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tagIds.indexOf(active.id as string);
    const newIndex = tagIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tagIds, oldIndex, newIndex);
    onReorder(reordered);
  };

  const totalItems = tagIds.length + 1;
  const needsScrollDesktop = totalItems > 8;
  const scrollFadeClass = needsScrollDesktop ? 'tag-bar-fade-both' : 'tag-bar-fade-mobile';

  return (
    <div className="border-b border-border-subtle">
      <div
        className={`overflow-x-auto scrollbar-hide px-3 py-2 ${scrollFadeClass}`}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
        }}
      >
        <div className="flex items-center min-w-max" style={{ gap: '24px' }}>
          <button
            onClick={onAllClick}
            className={`
              relative flex flex-col items-center justify-end flex-shrink-0 min-w-[32px] transition-all duration-150
              md:min-w-[48px] md:h-12
              ${activeTagFilters.length === 0
                ? 'text-primary'
                : 'text-fg-secondary hover:text-fg-primary'
              }
            `}
          >
            <span
              className={`
                flex items-center justify-center w-8 h-8 rounded-full transition-colors
                ${activeTagFilters.length === 0
                  ? 'bg-primary/[0.08] dark:bg-primary/[0.10]'
                  : ''
                }
              `}
            >
              <LuLayoutGrid size={20} strokeWidth={1.5} className="flex-shrink-0" />
            </span>
            <span className={`hidden md:block text-[11px] mt-0.5 ${activeTagFilters.length === 0 ? 'text-primary' : 'text-fg-secondary'}`}>
              All
            </span>
            {activeTagFilters.length === 0 && (
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full md:hidden" />
            )}
          </button>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tagIds} strategy={horizontalListSortingStrategy}>
              <div className="flex items-center" style={{ gap: '24px' }}>
                {tagIds.map((tagId) => (
                  <SortableTagButton
                    key={tagId}
                    tagId={tagId}
                    isActive={activeTagFilters.includes(tagId)}
                    onClick={() => onTagClick(tagId)}
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
