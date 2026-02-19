'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { LuSearch } from 'react-icons/lu';
import {
  TAG_ICON_CATEGORIES,
  ALL_TAG_ICONS,
  TAG_TINT_COLORS,
  normalizeTagToIconId,
  type TagIconId,
} from '@/lib/tagIcons';

interface TagIconPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (iconId: TagIconId, tintId?: string) => void;
  recentlyUsed: string[];
  currentTags: string[];
  maxTags?: number;
}

const CATEGORY_TABS = [
  { id: 'all', label: 'All' },
  ...TAG_ICON_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];

function searchIcons(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_TAG_ICONS;
  const words = q.split(/\s+/).filter(Boolean);
  return ALL_TAG_ICONS.filter((def) => {
    const searchable = [def.id, def.label, ...def.keywords].join(' ').toLowerCase();
    return words.every((w) => searchable.includes(w));
  });
}

export default function TagIconPicker({
  isOpen,
  onClose,
  onSelect,
  recentlyUsed,
  currentTags,
  maxTags = 5,
}: TagIconPickerProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [tintId, setTintId] = useState<string>('primary');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canAddMore = currentTags.length < maxTags;

  const currentTagsNormalized = useMemo(
    () => new Set(currentTags.map(normalizeTagToIconId)),
    [currentTags]
  );

  const searchResults = useMemo(() => searchIcons(search), [search]);

  const filteredByCategory = useMemo(() => {
    if (activeCategory === 'all') return searchResults;
    const cat = TAG_ICON_CATEGORIES.find((c) => c.id === activeCategory);
    if (!cat) return searchResults;
    return searchResults.filter((def) =>
      cat.icons.some((i) => i.id === def.id)
    );
  }, [activeCategory, searchResults]);

  const recentIconIds = useMemo(() => {
    return recentlyUsed
      .map(normalizeTagToIconId)
      .filter((id) => !currentTagsNormalized.has(id))
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, 8);
  }, [recentlyUsed, currentTagsNormalized]);

  const handleSelect = (iconId: TagIconId) => {
    if (!canAddMore || currentTagsNormalized.has(iconId)) return;
    onSelect(iconId, tintId);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setActiveCategory('all');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  if (!isOpen || typeof document === 'undefined') return null;

  const picker = (
    <>
      <div
        className="fixed inset-0 z-[99998] bg-black/40 dark:bg-black/60 backdrop-blur-[4px] animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={containerRef}
        className="fixed inset-x-0 bottom-0 z-[99999] max-h-[70vh] flex flex-col animate-in slide-in-from-bottom duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="bg-elevated rounded-t-2xl flex flex-col max-h-[70vh] overflow-hidden shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-none dark:border-t dark:border-border-subtle">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
            <div className="w-9 h-1 rounded-full bg-fg-tertiary/30" aria-hidden />
          </div>

          <div className="px-4 pb-4 pt-0 flex-1 min-h-0 flex flex-col overflow-hidden">
            {!canAddMore && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                Max 5 tags per task
              </p>
            )}

            {/* Search bar */}
            <div className="relative mb-3 flex-shrink-0">
              <LuSearch
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary pointer-events-none"
              />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search icons..."
                className="w-full pl-9 pr-3 py-2.5 rounded-[10px] bg-background text-fg-primary text-sm placeholder:text-fg-tertiary border-0 focus:ring-2 focus:ring-primary/30 focus:outline-none"
              />
            </div>

            {/* Category tabs */}
            <div
              className="flex gap-1 overflow-x-auto scrollbar-hide mb-3 flex-shrink-0 h-9"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveCategory(tab.id)}
                  className={`
                    flex-shrink-0 px-3 py-1.5 text-[13px] font-medium transition-colors rounded-lg
                    ${activeCategory === tab.id
                      ? 'text-primary underline underline-offset-4 decoration-2'
                      : 'text-fg-secondary hover:text-fg-primary'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Recent row */}
            {recentIconIds.length > 0 && !search.trim() && (
              <div className="mb-3 flex-shrink-0">
                <div className="text-[12px] uppercase tracking-wide text-fg-tertiary mb-2">
                  Recent
                </div>
                <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                  {recentIconIds.map((iconId) => {
                    const def = ALL_TAG_ICONS.find((d) => d.id === iconId);
                    if (!def) return null;
                    const Icon = def.Icon;
                    return (
                      <button
                        key={iconId}
                        type="button"
                        onClick={() => handleSelect(iconId)}
                        disabled={!canAddMore}
                        className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-fg-secondary hover:bg-primary/10 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Icon size={22} strokeWidth={1.5} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Icon grid */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              <div className="grid grid-cols-6 gap-1">
                {filteredByCategory.map((def) => {
                  const Icon = def.Icon;
                  const isSelected = currentTagsNormalized.has(def.id);
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => handleSelect(def.id)}
                      disabled={!canAddMore || isSelected}
                      className={`
                        w-11 h-11 flex items-center justify-center rounded-lg transition-all
                        min-w-[44px] min-h-[44px] touch-manipulation
                        disabled:opacity-50 disabled:cursor-not-allowed
                        ${isSelected
                          ? 'bg-primary/12 border-2 border-primary text-primary'
                          : 'text-fg-secondary hover:bg-primary/10 active:scale-95'
                        }
                      `}
                    >
                      <Icon size={22} strokeWidth={1.5} />
                    </button>
                  );
                })}
              </div>
              {filteredByCategory.length === 0 && (
                <p className="text-sm text-fg-tertiary py-4 text-center">
                  No icons found for &quot;{search}&quot;
                </p>
              )}
            </div>

            {/* Color picker */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border-subtle flex-shrink-0">
              <span className="text-[12px] text-fg-tertiary">Color</span>
              <div className="flex gap-2">
                {TAG_TINT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setTintId(c.id)}
                    className={`
                      w-3 h-3 rounded-full transition-transform
                      ${tintId === c.id ? 'scale-[1.3] ring-2 ring-primary ring-offset-2 ring-offset-surface dark:ring-offset-elevated' : ''}
                      ${c.id === 'primary' ? 'bg-primary' : ''}
                      ${c.id === 'teal' ? 'bg-cyan-500' : ''}
                      ${c.id === 'green' ? 'bg-emerald-500' : ''}
                      ${c.id === 'yellow' ? 'bg-amber-500' : ''}
                      ${c.id === 'orange' ? 'bg-orange-500' : ''}
                      ${c.id === 'red' ? 'bg-red-500' : ''}
                      ${c.id === 'pink' ? 'bg-pink-500' : ''}
                      ${c.id === 'purple' ? 'bg-purple-500' : ''}
                    `}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(picker, document.body);
}
