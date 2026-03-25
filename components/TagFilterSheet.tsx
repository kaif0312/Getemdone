'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { FaTimes, FaCheck } from 'react-icons/fa';
import { LuGripVertical } from 'react-icons/lu';
import { getIconForTag, getEffectiveLabelForTag } from '@/lib/tagIcons';

interface TagFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tagIds: string[];
  activeTagFilters: string[];
  tagCounts?: Record<string, number>;
  onToggleFilter: (tagId: string) => void;
  onClearFilters: () => void;
  onReorder: (newOrder: string[]) => void;
  customTagLabels?: Record<string, string> | null;
}

function SortableFilterItem({
  tagId,
  isActive,
  onToggle,
  label,
  count,
}: {
  tagId: string;
  isActive: boolean;
  onToggle: () => void;
  label: string;
  count: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tagId });

  const Icon = getIconForTag(tagId);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle last:border-0 bg-elevated"
    >
      {/* Drag handle — touch-none so scroll doesn't interfere */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-fg-tertiary touch-none cursor-grab active:cursor-grabbing p-1 -ml-1 flex-shrink-0"
        aria-label="Drag to reorder"
        tabIndex={-1}
      >
        <LuGripVertical size={18} />
      </button>

      {/* Tap area — toggles filter */}
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 flex items-center gap-2.5 min-w-0 text-left"
      >
        <Icon
          size={18}
          className={`flex-shrink-0 ${isActive ? 'text-primary' : 'text-fg-secondary'}`}
        />
        <span className={`text-[15px] font-medium truncate ${isActive ? 'text-primary' : 'text-fg-primary'}`}>
          {label}
        </span>
        {count > 0 && (
          <span className="text-sm text-fg-tertiary tabular-nums ml-auto pr-3 flex-shrink-0">
            {count}
          </span>
        )}
      </button>

      {/* Active checkbox */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          isActive ? 'bg-primary border-primary' : 'border-border-emphasized bg-transparent'
        }`}
        aria-label={isActive ? 'Remove filter' : 'Apply filter'}
      >
        {isActive && <FaCheck size={9} className="text-white" />}
      </button>
    </div>
  );
}

export default function TagFilterSheet({
  isOpen,
  onClose,
  tagIds,
  activeTagFilters,
  tagCounts = {},
  onToggleFilter,
  onClearFilters,
  onReorder,
  customTagLabels,
}: TagFilterSheetProps) {
  const [isMobile, setIsMobile] = useState(false);

  const checkMobile = useCallback(() => {
    setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
  }, []);

  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tagIds.indexOf(active.id as string);
    const newIndex = tagIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(tagIds, oldIndex, newIndex));
  };

  if (!isOpen) return null;

  const activeCount = activeTagFilters.length;

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-fg-primary">Filter by tag</h3>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClearFilters}
              className="text-[13px] text-primary hover:underline"
            >
              Clear
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-1.5 rounded-full bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>

      {/* Hint */}
      <p className="px-4 pt-3 pb-1 text-[12px] text-fg-tertiary flex-shrink-0">
        Tap to filter · Drag <LuGripVertical size={12} className="inline -mt-0.5" /> to reorder
      </p>

      {/* Sortable list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {tagIds.length === 0 ? (
          <p className="text-sm text-fg-tertiary text-center py-8">No tags yet.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tagIds} strategy={verticalListSortingStrategy}>
              {tagIds.map((tagId) => (
                <SortableFilterItem
                  key={tagId}
                  tagId={tagId}
                  isActive={activeTagFilters.includes(tagId)}
                  onToggle={() => onToggleFilter(tagId)}
                  label={getEffectiveLabelForTag(tagId, customTagLabels)}
                  count={tagCounts[tagId] ?? 0}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </>
  );

  const backdropClass = 'fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm';
  const panelClass = 'bg-elevated flex flex-col shadow-elevation-2';

  if (isMobile) {
    return (
      <>
        <div className={backdropClass} onClick={onClose} />
        <div
          className={`fixed inset-x-0 bottom-0 z-[99999] ${panelClass} rounded-t-[16px] max-h-[75vh] animate-in slide-in-from-bottom duration-250`}
          style={{ animationDuration: '250ms' }}
        >
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <div className="w-10 h-1 rounded-full bg-fg-tertiary/40" />
          </div>
          {content}
        </div>
      </>
    );
  }

  return (
    <>
      <div className={backdropClass} onClick={onClose} />
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <div
          className={`w-full max-w-[400px] ${panelClass} rounded-2xl overflow-hidden`}
          style={{ maxHeight: '70vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </>
  );
}
