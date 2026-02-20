'use client';

import { useState, useRef, useEffect } from 'react';
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
import { getIconForTag, getEffectiveLabelForTag, getLabelForTag } from '@/lib/tagIcons';

const RENAME_TOOLTIP_KEY = 'nudge_tag_rename_tooltip_seen';

interface SortableTagBarProps {
  tagIds: string[];
  activeTagFilters: string[];
  onTagClick: (tagId: string) => void;
  onAllClick: () => void;
  onReorder: (newOrder: string[]) => void;
  customTagLabels?: Record<string, string> | null;
  onSaveCustomLabel?: (tagId: string, label: string) => Promise<void>;
}

function SortableTagButton({
  tagId,
  isActive,
  onClick,
  label,
  isEditing,
  onStartEdit,
  onSave,
  onCancel,
  onSavedFlash,
}: {
  tagId: string;
  isActive: boolean;
  onClick: () => void;
  label: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
  onSavedFlash: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tagId, disabled: isEditing });

  const Icon = getIconForTag(tagId);
  const inputRef = useRef<HTMLInputElement>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async (value: string) => {
    const trimmed = value.trim().slice(0, 10);
    await onSave(trimmed);
    onSavedFlash();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave((e.target as HTMLInputElement).value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    handleSave(e.target.value);
  };

  return (
    <div ref={setNodeRef} style={style} className="flex-shrink-0">
      <div
        className="relative flex flex-col items-center justify-end flex-shrink-0 w-8 min-w-[32px] h-10 md:w-12 md:h-12 touch-manipulation transition-all duration-150"
      >
        <button
          ref={setActivatorNodeRef}
          {...(isEditing ? {} : { ...attributes, ...listeners })}
          onClick={(e) => {
            e.stopPropagation();
            if (isEditing) return;
            onClick();
          }}
          className={`
            flex flex-col items-center justify-end flex-shrink-0 w-full min-w-[32px] h-10 md:w-12 md:h-12
            ${!isEditing ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
            ${isActive
              ? 'text-primary'
              : 'text-fg-secondary hover:text-fg-primary'
            }
          `}
          style={{ touchAction: 'pan-x' }}
          onPointerDown={() => {
            if (!isEditing && 'vibrate' in navigator) navigator.vibrate(25);
          }}
        >
          <span
            className={`
              flex items-center justify-center w-8 h-8 rounded-full transition-colors
              ${isEditing ? '' : 'transition-colors'}
              ${isActive && !isEditing
                ? 'bg-primary/[0.08] dark:bg-primary/[0.10]'
                : ''
              }
            `}
          >
            <Icon size={20} strokeWidth={1.5} className="flex-shrink-0" />
          </span>
          {/* Desktop: label with double-click to rename */}
          <span className="hidden md:block mt-0.5 w-full max-w-[80px] min-w-[80px] flex items-center justify-center">
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                defaultValue={label}
                maxLength={10}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-[80px] text-[12px] text-fg-primary bg-transparent border-0 border-b border-primary rounded-none px-0 py-0.5 text-center focus:outline-none focus:ring-0"
              />
            ) : (
              <span
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onStartEdit();
                }}
                onClick={(e) => e.stopPropagation()}
                className={`text-[11px] truncate max-w-full px-0.5 cursor-default select-text ${isActive ? 'text-primary' : 'text-fg-secondary'}`}
              >
                {label}
              </span>
            )}
          </span>
        </button>
        {isActive && !isEditing && (
          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full md:hidden" />
        )}
      </div>
    </div>
  );
}

export default function SortableTagBar({
  tagIds,
  activeTagFilters,
  onTagClick,
  onAllClick,
  onReorder,
  customTagLabels,
  onSaveCustomLabel,
}: SortableTagBarProps) {
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [flashTagId, setFlashTagId] = useState<string | null>(null);
  const [showRenameTooltip, setShowRenameTooltip] = useState(false);
  const [tooltipTagId, setTooltipTagId] = useState<string | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canRename = Boolean(onSaveCustomLabel);

  useEffect(() => {
    if (!canRename || tagIds.length === 0) return;
    try {
      if (localStorage.getItem(RENAME_TOOLTIP_KEY)) return;
      setShowRenameTooltip(true);
      setTooltipTagId(tagIds[0]);
      tooltipTimerRef.current = setTimeout(() => {
        setShowRenameTooltip(false);
        setTooltipTagId(null);
        localStorage.setItem(RENAME_TOOLTIP_KEY, '1');
      }, 3000);
    } catch (e) {
      setShowRenameTooltip(false);
    }
    return () => {
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
    };
  }, [canRename, tagIds]);

  const dismissTooltip = () => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
    setShowRenameTooltip(false);
    setTooltipTagId(null);
    try {
      localStorage.setItem(RENAME_TOOLTIP_KEY, '1');
    } catch (e) {
      /* ignore */
    }
  };

  const handleSaveLabel = async (tagId: string, value: string) => {
    setEditingTagId(null);
    if (!onSaveCustomLabel) return;
    const defaultLabel = getLabelForTag(tagId);
    if (value === defaultLabel || !value.trim()) {
      await onSaveCustomLabel(tagId, '');
    } else {
      await onSaveCustomLabel(tagId, value.trim());
    }
  };

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerSavedFlash = (tagId: string) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashTagId(tagId);
    flashTimerRef.current = setTimeout(() => {
      setFlashTagId(null);
      flashTimerRef.current = null;
    }, 300);
  };

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
        onClick={dismissTooltip}
        onKeyDown={dismissTooltip}
        role="presentation"
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
                  <div key={tagId} className="relative flex-shrink-0">
                    <SortableTagButton
                      tagId={tagId}
                      isActive={activeTagFilters.includes(tagId)}
                      onClick={() => onTagClick(tagId)}
                      label={getEffectiveLabelForTag(tagId, customTagLabels)}
                      isEditing={editingTagId === tagId}
                      onStartEdit={() => {
                        dismissTooltip();
                        setEditingTagId(tagId);
                      }}
                      onSave={(value) => handleSaveLabel(tagId, value)}
                      onCancel={() => setEditingTagId(null)}
                      onSavedFlash={() => triggerSavedFlash(tagId)}
                    />
                    {/* Saved flash */}
                    {flashTagId === tagId && (
                      <span
                        className="absolute inset-0 flex items-end justify-center pb-2 md:pb-3 pointer-events-none"
                        aria-hidden
                      >
                        <span className="hidden md:block text-[11px] px-1 rounded animate-tag-save-flash">
                          {getEffectiveLabelForTag(tagId, customTagLabels)}
                        </span>
                      </span>
                    )}
                    {/* Rename tooltip - desktop only, first item */}
                    {showRenameTooltip && tooltipTagId === tagId && (
                      <div
                        className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-10 hidden md:block px-2 py-1 text-[11px] text-fg-primary bg-elevated rounded-md border border-border-subtle shadow-elevation-2 whitespace-nowrap"
                        role="tooltip"
                      >
                        Double-click to rename
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
