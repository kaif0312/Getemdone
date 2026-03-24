'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaTimes } from 'react-icons/fa';
import { LuPlus } from 'react-icons/lu';
import TagIconPicker from './TagIconPicker';
import {
  getIconForTag,
  getTintClassForTag,
  getTintBgClassForTag,
  getEffectiveLabelForTag,
  type TagIconId,
} from '@/lib/tagIcons';

interface QuickTagSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  tagIds: string[];
  selectedTags: string[];
  onToggleTag: (tagId: string) => void;
  recentlyUsed: string[];
  onRecordRecentTag: (iconId: string) => void;
  customTagLabels?: Record<string, string> | null;
}

export default function QuickTagSelector({
  isOpen,
  onClose,
  tagIds,
  selectedTags,
  onToggleTag,
  recentlyUsed,
  onRecordRecentTag,
  customTagLabels,
}: QuickTagSelectorProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const checkMobile = useCallback(() => {
    setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
  }, []);

  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

  // Reset icon picker when selector closes
  useEffect(() => {
    if (!isOpen) setShowIconPicker(false);
  }, [isOpen]);

  const handleIconPickerApply = (iconId: TagIconId | null, tintId?: string) => {
    if (!iconId) return;
    const tagString = tintId && tintId !== 'primary' ? `${iconId}:${tintId}` : iconId;
    // Only add if not already selected and under limit
    if (!selectedTags.includes(tagString) && selectedTags.length < 5) {
      onToggleTag(tagString);
    }
    onRecordRecentTag(iconId);
  };

  if (!isOpen) return null;

  const hasExistingTags = tagIds.length > 0;

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <h3 className="text-[15px] font-semibold text-fg-primary">Add tags</h3>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-muted transition-colors"
          aria-label="Close"
        >
          <FaTimes size={16} />
        </button>
      </div>

      {/* Tag chips or empty state */}
      <div className="px-4 py-4">
        {!hasExistingTags ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <p className="text-sm text-fg-tertiary text-center">
              No tags yet. Pick an icon to create your first tag.
            </p>
            <button
              type="button"
              onClick={() => setShowIconPicker(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
            >
              <LuPlus size={16} />
              Add your first tag
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tagIds.map((tagId) => {
              const Icon = getIconForTag(tagId);
              const isSelected = selectedTags.includes(tagId);
              const isDisabled = selectedTags.length >= 5 && !isSelected;
              return (
                <button
                  key={tagId}
                  type="button"
                  onClick={() => !isDisabled && onToggleTag(tagId)}
                  disabled={isDisabled}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                    isSelected
                      ? `${getTintBgClassForTag(tagId)} ${getTintClassForTag(tagId)} border-current/30`
                      : 'bg-surface-muted text-fg-secondary border-transparent hover:border-border-subtle'
                  } ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <Icon size={14} />
                  <span>{getEffectiveLabelForTag(tagId, customTagLabels)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
        <div className="flex items-center gap-2">
          {hasExistingTags && (
            <button
              type="button"
              onClick={() => setShowIconPicker(true)}
              disabled={selectedTags.length >= 5}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-surface-muted text-fg-secondary hover:text-fg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <LuPlus size={14} />
              New tag
            </button>
          )}
          {hasExistingTags && (
            <span className="text-xs text-fg-tertiary">{selectedTags.length}/5</span>
          )}
        </div>
        {hasExistingTags && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-full bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Done
          </button>
        )}
      </div>

      {/* TagIconPicker — renders via portal, stacks above this sheet */}
      <TagIconPicker
        isOpen={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        onApply={handleIconPickerApply}
        recentlyUsed={recentlyUsed}
      />
    </>
  );

  const backdropClass = 'fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm';
  const panelClass = 'bg-elevated flex flex-col shadow-elevation-2';

  if (isMobile) {
    return (
      <>
        <div className={backdropClass} onClick={onClose} />
        <div
          className={`fixed inset-x-0 bottom-0 z-[99999] ${panelClass} rounded-t-[16px] max-h-[70vh] animate-in slide-in-from-bottom duration-250`}
          style={{ animationDuration: '250ms' }}
        >
          <div className="flex justify-center pt-3 pb-1">
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
          className={`w-full max-w-[380px] ${panelClass} rounded-2xl overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </>
  );
}
