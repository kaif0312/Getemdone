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
import { LuLayoutGrid, LuZap } from 'react-icons/lu';
import { getIconForTag, getEffectiveLabelForTag, getLabelForTag } from '@/lib/tagIcons';
import TagFilterSheet from './TagFilterSheet';

const RENAME_TOOLTIP_KEY = 'nudge_tag_rename_tooltip_seen';
const MOBILE_VISIBLE_COUNT = 4;

interface SortableTagBarProps {
  tagIds: string[];
  tagCounts?: Record<string, number>;
  activeTagFilters: string[];
  onTagClick: (tagId: string) => void;
  onAllClick: () => void;
  onReorder: (newOrder: string[]) => void;
  customTagLabels?: Record<string, string> | null;
  onSaveCustomLabel?: (tagId: string, label: string) => Promise<void>;
  focusCount?: number;
  isFocusActive?: boolean;
  onFocusClick?: () => void;
}

// ── Desktop-only sortable tag button (drag-to-reorder + rename) ──────────────

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
      <div className="relative flex flex-col items-center justify-end flex-shrink-0 w-12 min-w-[48px] h-12 touch-manipulation transition-all duration-150">
        <button
          ref={setActivatorNodeRef}
          {...(isEditing ? {} : { ...attributes, ...listeners })}
          onClick={(e) => {
            e.stopPropagation();
            if (isEditing) return;
            onClick();
          }}
          className={`
            flex flex-col items-center justify-end flex-shrink-0 w-full min-w-[48px] h-12
            ${!isEditing ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
            ${isActive ? 'text-primary' : 'text-fg-secondary hover:text-fg-primary'}
          `}
        >
          <span
            className={`
              relative flex items-center justify-center w-8 h-8 rounded-full transition-colors
              ${isActive && !isEditing ? 'bg-primary/[0.08] dark:bg-primary/[0.10]' : ''}
            `}
          >
            <Icon size={20} strokeWidth={1.5} className="flex-shrink-0" />
          </span>
          <span className="flex flex-col items-center mt-0.5 w-full max-w-[80px] min-w-[80px]">
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
                  <span className="text-[12px] text-fg-tertiary tabular-nums mt-0.5">{count}</span>
                )}
              </>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SortableTagBar({
  tagIds,
  tagCounts = {},
  activeTagFilters,
  onTagClick,
  onAllClick,
  onReorder,
  customTagLabels,
  onSaveCustomLabel,
  focusCount = 0,
  isFocusActive = false,
  onFocusClick,
}: SortableTagBarProps) {
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [flashTagId, setFlashTagId] = useState<string | null>(null);
  const [showRenameTooltip, setShowRenameTooltip] = useState(false);
  const [tooltipTagId, setTooltipTagId] = useState<string | null>(null);
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevTagIdsRef = useRef<string[]>(tagIds);
  const [exitingTags, setExitingTags] = useState<{ id: string; opacity: number }[]>([]);
  const exitingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canRename = Boolean(onSaveCustomLabel);

  // Visible mobile chips: active filters first, then by tagIds order, up to MOBILE_VISIBLE_COUNT
  const visibleMobileTags = [
    ...tagIds.filter(id => activeTagFilters.includes(id)),
    ...tagIds.filter(id => !activeTagFilters.includes(id)),
  ].slice(0, MOBILE_VISIBLE_COUNT);
  const hiddenCount = tagIds.length - visibleMobileTags.length;
  const hiddenActiveCount = tagIds
    .filter(id => !visibleMobileTags.includes(id))
    .filter(id => activeTagFilters.includes(id)).length;

  // Track tags being removed for fade-out (150ms) — desktop only
  useEffect(() => {
    const prev = prevTagIdsRef.current;
    const removed = prev.filter((id) => !tagIds.includes(id));
    const tagIdsSet = new Set(tagIds);
    prevTagIdsRef.current = tagIds;

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
    try { localStorage.setItem(RENAME_TOOLTIP_KEY, '1'); } catch (e) { /* ignore */ }
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
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
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

  const needsScrollDesktop = tagIds.length + 1 > 8;

  return (
    <div className="border-b border-border-subtle">

      {/* ── Mobile: single fixed row + overflow chip ────────────────────────── */}
      <div
        className="md:hidden px-3 py-2 flex items-center gap-1.5"
        style={{ overflow: 'clip' }}
        onClick={dismissTooltip}
        onKeyDown={dismissTooltip}
        role="presentation"
      >
        {/* All */}
        <button
          onClick={onAllClick}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-medium transition-colors flex-shrink-0 select-none ${
            activeTagFilters.length === 0
              ? 'bg-primary/10 text-primary'
              : 'bg-surface-muted text-fg-secondary'
          }`}
        >
          <LuLayoutGrid size={13} strokeWidth={1.5} />
          <span>All</span>
        </button>

        {/* Focus */}
        {onFocusClick && (
          <button
            onClick={onFocusClick}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-medium transition-colors flex-shrink-0 select-none ${
              isFocusActive ? 'bg-primary/10 text-primary' : 'bg-surface-muted text-fg-secondary'
            }`}
          >
            <LuZap size={13} strokeWidth={1.5} />
            <span>Focus</span>
          </button>
        )}

        {/* Divider between system chips and user tags */}
        {tagIds.length > 0 && (
          <div className="w-px h-4 bg-border-subtle flex-shrink-0 mx-0.5" />
        )}

        {/* Visible tag chips — icon-only to stay compact on any screen width */}
        {visibleMobileTags.map((tagId) => {
          const Icon = getIconForTag(tagId);
          const isActive = activeTagFilters.includes(tagId);
          const count = tagCounts[tagId];
          return (
            <button
              key={tagId}
              onClick={() => onTagClick(tagId)}
              title={getEffectiveLabelForTag(tagId, customTagLabels)}
              className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-colors flex-shrink-0 select-none ${
                isActive ? 'bg-primary/10 text-primary' : 'text-fg-secondary'
              }`}
            >
              <Icon size={18} strokeWidth={1.5} />
              {count !== undefined && count > 0 && (
                <span className={`absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center text-[10px] font-semibold rounded-full leading-none ${
                  isActive ? 'bg-primary text-white' : 'bg-fg-tertiary/40 text-fg-secondary'
                }`}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
              {isActive && (
                <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-[2px] bg-primary rounded-full" />
              )}
            </button>
          );
        })}

        {/* Overflow chip — always left-aligned after visible tags, no spacer */}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowFilterSheet(true)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[13px] font-medium flex-shrink-0 transition-colors select-none ${
              hiddenActiveCount > 0
                ? 'bg-primary/10 text-primary'
                : 'bg-surface-muted text-fg-tertiary'
            }`}
          >
            <span>{hiddenActiveCount > 0 ? `+${hiddenCount} ●` : `+${hiddenCount}`}</span>
          </button>
        )}
      </div>

      <TagFilterSheet
        isOpen={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        tagIds={tagIds}
        activeTagFilters={activeTagFilters}
        tagCounts={tagCounts}
        onToggleFilter={onTagClick}
        onClearFilters={onAllClick}
        onReorder={onReorder}
        customTagLabels={customTagLabels}
      />

      {/* ── Desktop: horizontal scroll + drag-to-reorder (unchanged) ─────── */}
      <div
        className={`hidden md:block overflow-x-auto scrollbar-hide px-3 py-2 ${needsScrollDesktop ? 'tag-bar-fade-both' : ''}`}
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain' }}
        onClick={dismissTooltip}
        onKeyDown={dismissTooltip}
        role="presentation"
      >
        <div className="flex items-center min-w-max" style={{ gap: '24px' }}>
          {/* All */}
          <button
            onClick={onAllClick}
            className={`
              relative flex flex-col items-center justify-end flex-shrink-0 min-w-[48px] h-12 transition-all duration-150
              ${activeTagFilters.length === 0 ? 'text-primary' : 'text-fg-secondary hover:text-fg-primary'}
            `}
          >
            <span className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${activeTagFilters.length === 0 ? 'bg-primary/[0.08] dark:bg-primary/[0.10]' : ''}`}>
              <LuLayoutGrid size={20} strokeWidth={1.5} className="flex-shrink-0" />
            </span>
            <span className={`text-[11px] mt-0.5 ${activeTagFilters.length === 0 ? 'text-primary' : 'text-fg-secondary'}`}>All</span>
          </button>

          {/* Focus */}
          {onFocusClick && (
            <button
              onClick={onFocusClick}
              className={`relative flex flex-col items-center justify-end flex-shrink-0 min-w-[48px] h-12 transition-all duration-150 ${
                isFocusActive ? 'text-primary' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              <span className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${isFocusActive ? 'bg-primary/[0.08] dark:bg-primary/[0.10]' : ''}`}>
                <LuZap size={20} strokeWidth={1.5} className="flex-shrink-0" />
              </span>
              <span className={`text-[11px] mt-0.5 ${isFocusActive ? 'text-primary' : 'text-fg-secondary'}`}>
                {focusCount > 0 ? `Focus ${focusCount}` : 'Focus'}
              </span>
            </button>
          )}

          {/* Sortable tags */}
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
                      onStartEdit={() => { dismissTooltip(); setEditingTagId(tagId); }}
                      onSave={(value) => handleSaveLabel(tagId, value)}
                      onCancel={() => setEditingTagId(null)}
                      onSavedFlash={() => triggerSavedFlash(tagId)}
                    />
                    {flashTagId === tagId && (
                      <span className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none" aria-hidden>
                        <span className="text-[11px] px-1 rounded animate-tag-save-flash">
                          {getEffectiveLabelForTag(tagId, customTagLabels)}
                        </span>
                      </span>
                    )}
                    {showRenameTooltip && tooltipTagId === tagId && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-10 px-2 py-1 text-[11px] text-fg-primary bg-elevated rounded-md border border-border-subtle shadow-elevation-2 whitespace-nowrap" role="tooltip">
                        Double-click to rename
                      </div>
                    )}
                  </div>
                ))}
                {/* Exiting tags - fade out over 150ms */}
                {exitingTags.map(({ id, opacity }) => {
                  const Icon = getIconForTag(id);
                  const label = getEffectiveLabelForTag(id, customTagLabels);
                  const count = tagCounts[id];
                  return (
                    <div
                      key={`exiting-${id}`}
                      className="relative flex-shrink-0 transition-opacity duration-150 ease-out pointer-events-none flex flex-col items-center justify-end w-12 min-w-[48px] h-12 text-fg-secondary"
                      style={{ opacity }}
                    >
                      <span className="relative flex items-center justify-center w-8 h-8 rounded-full">
                        <Icon size={20} strokeWidth={1.5} className="flex-shrink-0" />
                      </span>
                      <span className="flex flex-col items-center mt-0.5 w-full max-w-[80px] min-w-[80px]">
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
