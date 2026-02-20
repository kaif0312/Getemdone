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
  tagCounts?: Record<string, number>;
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
  count,
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
  count?: number;
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
              relative flex items-center justify-center w-8 h-8 rounded-full transition-colors
              ${isEditing ? '' : 'transition-colors'}
              ${isActive && !isEditing
                ? 'bg-primary/[0.08] dark:bg-primary/[0.10]'
                : ''
              }
            `}
          >
            <Icon size={20} strokeWidth={1.5} className="flex-shrink-0" />
            {/* Mobile: tiny count badge on icon */}
            {count !== undefined && count > 0 && (
              <span className="md:hidden absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center text-[10px] font-medium text-fg-tertiary bg-surface-muted rounded-full">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </span>
          {/* Desktop: label with double-click to rename, count below */}
          <span className="hidden md:flex flex-col items-center mt-0.5 w-full max-w-[80px] min-w-[80px]">
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
              <>
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
                {count !== undefined && count > 0 && (
                  <span className="text-[10px] text-fg-tertiary tabular-nums mt-0.5">
                    {count}
                  </span>
                )}
              </>
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
  tagCounts = {},
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
  const prevTagIdsRef = useRef<string[]>(tagIds);
  const [exitingTags, setExitingTags] = useState<{ id: string; opacity: number }[]>([]);
  const exitingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canRename = Boolean(onSaveCustomLabel);

  // Track tags being removed for fade-out (150ms)
  useEffect(() => {
    const prev = prevTagIdsRef.current;
    const removed = prev.filter((id) => !tagIds.includes(id));
    const tagIdsSet = new Set(tagIds);
    prevTagIdsRef.current = tagIds;

    // Remove from exiting any tag re-added to tagIds; add newly removed tags
    setExitingTags((prevExiting) => {
      const withoutReadded = prevExiting.filter((e) => !tagIdsSet.has(e.id));
      const withoutReplacement = withoutReadded.filter((e) => !removed.includes(e.id));
      return [...withoutReplacement, ...removed.map((id) => ({ id, opacity: 1 }))];
    });

    if (removed.length === 0) return;

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setExitingTags((e) =>
          e.map((x) => (removed.includes(x.id) ? { ...x, opacity: 0 } : x))
        );
      });
    });
    const t = setTimeout(() => {
      setExitingTags((e) => e.filter((x) => !removed.includes(x.id)));
      exitingTimeoutRef.current = null;
    }, 150);
    exitingTimeoutRef.current = t;
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [tagIds]);

  useEffect(() => () => {
    if (exitingTimeoutRef.current) clearTimeout(exitingTimeoutRef.current);
  }, []);

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
                  <div key={tagId} className="relative flex-shrink-0 animate-in fade-in duration-150">
                    <SortableTagButton
                      tagId={tagId}
                      isActive={activeTagFilters.includes(tagId)}
                      onClick={() => onTagClick(tagId)}
                      label={getEffectiveLabelForTag(tagId, customTagLabels)}
                      count={tagCounts[tagId]}
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
                {/* Exiting tags - fade out over 150ms (display-only, not in SortableContext) */}
                {exitingTags.map(({ id, opacity }) => {
                  const Icon = getIconForTag(id);
                  const label = getEffectiveLabelForTag(id, customTagLabels);
                  const count = tagCounts[id];
                  return (
                    <div
                      key={`exiting-${id}`}
                      className="relative flex-shrink-0 transition-opacity duration-150 ease-out pointer-events-none flex flex-col items-center justify-end w-8 min-w-[32px] h-10 md:w-12 md:h-12 text-fg-secondary"
                      style={{ opacity }}
                    >
                      <span className="relative flex items-center justify-center w-8 h-8 rounded-full">
                        <Icon size={20} strokeWidth={1.5} className="flex-shrink-0" />
                        {count !== undefined && count > 0 && (
                          <span className="md:hidden absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 flex items-center justify-center text-[10px] font-medium text-fg-tertiary bg-surface-muted rounded-full">
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </span>
                      <span className="hidden md:flex flex-col items-center mt-0.5 w-full max-w-[80px] min-w-[80px]">
                        <span className="text-[11px] truncate max-w-full px-0.5 text-fg-secondary">{label}</span>
                        {count !== undefined && count > 0 && (
                          <span className="text-[10px] text-fg-tertiary tabular-nums mt-0.5">{count}</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
