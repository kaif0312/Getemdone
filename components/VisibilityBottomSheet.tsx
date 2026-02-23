'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaTimes } from 'react-icons/fa';
import { LuSearch } from 'react-icons/lu';
import { TaskVisibility, FriendGroup } from '@/lib/types';
import { useFriends } from '@/hooks/useFriends';
import { useAuth } from '@/contexts/AuthContext';
import Avatar from './Avatar';

const VISIBILITY_MODES: { key: TaskVisibility; label: string }[] = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'only', label: 'Only...' },
  { key: 'except', label: 'Except...' },
  { key: 'private', label: 'Private' },
];

interface VisibilityBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (visibility: TaskVisibility, visibilityList: string[]) => void;
  currentVisibility?: TaskVisibility;
  currentVisibilityList?: string[];
  /** When true, show "Set as default for new tasks" toggle */
  showSetAsDefault?: boolean;
  /** Multi-task mode: applying to multiple tasks */
  multiTaskMode?: boolean;
  /** When set, position as popover anchored to this rect (desktop only). Otherwise centered modal. */
  anchorRect?: DOMRect | null;
}

function getEffectiveVisibility(
  visibility?: TaskVisibility,
  isPrivate?: boolean
): TaskVisibility {
  if (visibility) return visibility;
  return isPrivate ? 'private' : 'everyone';
}

export default function VisibilityBottomSheet({
  isOpen,
  onClose,
  onSelect,
  currentVisibility,
  currentVisibilityList = [],
  showSetAsDefault = false,
  multiTaskMode = false,
  anchorRect = null,
}: VisibilityBottomSheetProps) {
  const { friends, updateFriendGroups, updateDefaultVisibility } = useFriends();
  const { userData } = useAuth();
  const [mode, setMode] = useState<TaskVisibility>('everyone');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSelectedIds, setNewGroupSelectedIds] = useState<Set<string>>(new Set());

  const friendGroups = userData?.friendGroups || [];
  const hasMultipleFriends = friends.length > 1;

  const checkMobile = useCallback(() => {
    setIsMobile(typeof window !== 'undefined' && window.innerWidth < 768);
  }, []);

  useEffect(() => {
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [checkMobile]);

  useEffect(() => {
    if (isOpen) {
      setMode(currentVisibility || 'everyone');
      setSelectedIds(new Set(currentVisibilityList));
      setSearchQuery('');
      setSetAsDefault(false);
      setCreatingGroup(false);
      setNewGroupName('');
      setNewGroupSelectedIds(new Set());
    }
  }, [isOpen, currentVisibility, currentVisibilityList]);

  const filteredFriends = searchQuery.trim()
    ? friends.filter(
        (f) =>
          (f.displayName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (f.email || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : friends;

  const handleSelectMode = (m: TaskVisibility) => {
    if (m === 'everyone' || m === 'private') {
      onSelect(m, []);
      onClose();
      return;
    }
    setMode(m);
  };

  const toggleFriend = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectGroup = (group: FriendGroup) => {
    if (mode === 'only') {
      setSelectedIds(new Set(group.memberIds));
    } else {
      setSelectedIds(new Set(group.memberIds));
    }
  };

  const handleSaveGroup = async () => {
    if (!newGroupName.trim() || newGroupSelectedIds.size === 0) return;
    const newGroup: FriendGroup = {
      id: `g_${Date.now()}`,
      name: newGroupName.trim(),
      memberIds: Array.from(newGroupSelectedIds),
    };
    const updated = [...friendGroups, newGroup];
    await updateFriendGroups(updated);
    setCreatingGroup(false);
    setNewGroupName('');
    setNewGroupSelectedIds(new Set());
    selectGroup(newGroup);
  };

  const handleConfirm = () => {
    onSelect(mode, Array.from(selectedIds));
    if (setAsDefault) {
      updateDefaultVisibility(mode, Array.from(selectedIds));
    }
    onClose();
  };

  const canConfirm =
    mode === 'everyone' ||
    mode === 'private' ||
    (mode === 'only' && selectedIds.size > 0) ||
    (mode === 'except' && selectedIds.size > 0);

  const getSummary = () => {
    if (mode === 'everyone') return 'Everyone can see this';
    if (mode === 'private') return 'Only you can see this';
    const names = Array.from(selectedIds)
      .map((id) => friends.find((f) => f.id === id)?.displayName || 'Unknown')
      .filter(Boolean);
    if (names.length === 0) return '';
    if (mode === 'only') {
      if (names.length === 1) return `Only ${names[0]} can see this`;
      if (names.length === 2) return `Only ${names[0]} and ${names[1]} can see this`;
      return `Only ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} can see this`;
    }
    if (names.length === 1) return `Everyone except ${names[0]} can see this`;
    if (names.length === 2) return `Everyone except ${names[0]} and ${names[1]} can see this`;
    return `Everyone except ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]} can see this`;
  };

  if (!isOpen) return null;

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <h3 className="text-base font-semibold text-fg-primary">Who can see this?</h3>
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-fg-secondary hover:bg-surface-muted transition-colors -mr-1"
          aria-label="Close"
        >
          <FaTimes size={20} />
        </button>
      </div>

      <div className="px-4 py-4 space-y-4 overflow-y-auto flex-1 min-h-0" style={{ maxHeight: isMobile ? 'calc(70vh - 200px)' : anchorRect ? '280px' : 'none' }}>
        {/* Mode selector - pills */}
        <div className="flex flex-wrap gap-2">
          {VISIBILITY_MODES.map(({ key, label }) => {
            if (!hasMultipleFriends && (key === 'only' || key === 'except')) return null;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectMode(key)}
                className={`px-4 py-2 rounded-[20px] text-[13px] font-medium border-[1.5px] transition-all active:scale-95 ${
                  mode === key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border-subtle bg-transparent text-fg-secondary hover:border-fg-tertiary'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Friend picker - when Only or Except */}
        {(mode === 'only' || mode === 'except') && hasMultipleFriends && !creatingGroup && (
          <div className="space-y-3">
            {/* Groups section */}
            <div>
              <p className="text-[13px] font-medium text-fg-secondary mb-2">Groups</p>
              <div className="flex flex-wrap gap-2">
                {friendGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => selectGroup(g)}
                    className="px-3 py-1.5 rounded-[20px] text-[13px] font-medium border border-border-subtle bg-transparent text-fg-secondary hover:border-primary hover:bg-primary/10 hover:text-primary transition-colors"
                  >
                    {g.name} ({g.memberIds.length})
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCreatingGroup(true)}
                  className="px-3 py-1.5 text-[13px] font-medium text-primary hover:underline"
                >
                  + New Group
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <LuSearch size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search friends..."
                className="w-full pl-9 pr-4 py-2.5 text-[14px] text-fg-primary bg-surface border border-border-subtle rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-fg-tertiary"
              />
            </div>

            {/* Friend list - max 6 visible, scroll for more */}
            <div className="max-h-[200px] overflow-y-auto space-y-0">
              {filteredFriends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => toggleFriend(friend.id)}
                  className="w-full flex items-center gap-3 px-0 py-3 min-h-[48px] text-left hover:bg-surface-muted/50 rounded-lg transition-colors"
                >
                  <Avatar
                    photoURL={friend.photoURL}
                    displayName={friend.displayName || '?'}
                    size="sm"
                  />
                  <span className="flex-1 text-[14px] text-fg-primary truncate">
                    {friend.displayName || friend.email || 'Unknown'}
                  </span>
                  <div
                    className={`flex-shrink-0 w-5 h-5 rounded-[4px] flex items-center justify-center border-[1.5px] transition-colors ${
                      selectedIds.has(friend.id)
                        ? 'bg-primary border-primary'
                        : 'border-fg-tertiary bg-transparent'
                    }`}
                  >
                    {selectedIds.has(friend.id) && (
                      <svg className="w-2.5 h-2.5 text-on-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Selected count */}
            <p className="text-[13px] text-fg-secondary">
              {selectedIds.size} friend{selectedIds.size !== 1 ? 's' : ''} selected
            </p>
          </div>
        )}

        {/* Create group inline */}
        {creatingGroup && (
          <div className="space-y-3 p-3 bg-surface-muted rounded-xl border border-border-subtle">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="w-full px-3 py-2 text-[14px] text-fg-primary bg-surface border border-border-subtle rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            <div className="max-h-[120px] overflow-y-auto space-y-0">
              {friends.map((friend) => (
                <button
                  key={friend.id}
                  type="button"
                  onClick={() => {
                    setNewGroupSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(friend.id)) next.delete(friend.id);
                      else next.add(friend.id);
                      return next;
                    });
                  }}
                  className="w-full flex items-center gap-3 py-2 text-left transition-colors"
                >
                  <Avatar
                    photoURL={friend.photoURL}
                    displayName={friend.displayName || '?'}
                    size="xs"
                  />
                  <span className="flex-1 text-[13px] text-fg-primary truncate">
                    {friend.displayName || friend.email || 'Unknown'}
                  </span>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      newGroupSelectedIds.has(friend.id) ? 'bg-primary border-primary' : 'border-fg-tertiary'
                    }`}
                  >
                    {newGroupSelectedIds.has(friend.id) && (
                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCreatingGroup(false);
                  setNewGroupName('');
                  setNewGroupSelectedIds(new Set());
                }}
                className="px-3 py-1.5 text-[13px] text-fg-secondary hover:text-fg-primary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGroup}
                disabled={!newGroupName.trim() || newGroupSelectedIds.size === 0}
                className="px-4 py-2 rounded-lg bg-primary text-on-accent text-[13px] font-medium disabled:opacity-40"
              >
                Save Group
              </button>
            </div>
          </div>
        )}

        {!hasMultipleFriends && (
          <p className="text-[13px] text-fg-secondary">
            Add more friends to use custom visibility.
          </p>
        )}
      </div>

      {/* Summary + Confirm */}
      <div className="px-4 pb-4 pt-2 flex-shrink-0 border-t border-border-subtle" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
        {canConfirm && getSummary() && (
          <p className="text-[13px] text-fg-secondary py-2">{getSummary()}</p>
        )}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className="w-full h-12 rounded-xl bg-primary text-on-accent text-[15px] font-semibold disabled:opacity-40 transition-opacity"
        >
          Save Visibility
        </button>
        {showSetAsDefault && (
          <label className="flex items-center gap-3 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={setAsDefault}
              onChange={(e) => setSetAsDefault(e.target.checked)}
              className="rounded"
            />
            <span className="text-[13px] text-fg-secondary">Set as default for new tasks</span>
          </label>
        )}
      </div>
    </>
  );

  const backdropClass = 'fixed inset-0 z-[99998] bg-black/40 backdrop-blur-sm';
  const panelClass = 'bg-elevated flex flex-col shadow-elevation-2';

  if (isMobile) {
    return (
      <>
        <div className={`${backdropClass}`} onClick={onClose} />
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

  // Desktop: popover anchored to element, or centered modal
  if (anchorRect) {
    const popoverWidth = 380;
    const popoverMaxHeight = Math.min(480, typeof window !== 'undefined' ? window.innerHeight - 80 : 480);
    let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
    let top = anchorRect.top - popoverMaxHeight - 8;
    if (typeof window !== 'undefined') {
      if (left < 12) left = 12;
      if (left + popoverWidth > window.innerWidth - 12) left = window.innerWidth - popoverWidth - 12;
      if (top < 12) top = anchorRect.bottom + 8;
    }
    return (
      <>
        <div className={`${backdropClass}`} onClick={onClose} />
        <div
          className="fixed z-[99999] rounded-2xl overflow-hidden"
          style={{
            left: `${left}px`,
            top: `${top}px`,
            width: popoverWidth,
            maxHeight: popoverMaxHeight,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`${panelClass} rounded-2xl overflow-hidden flex flex-col`} style={{ maxHeight: popoverMaxHeight }}>
            {content}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`${backdropClass}`} onClick={onClose} />
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        <div
          className={`w-full max-w-[420px] ${panelClass} rounded-2xl overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    </>
  );
}

export { getEffectiveVisibility };
