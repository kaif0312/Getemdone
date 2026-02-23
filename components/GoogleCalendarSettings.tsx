'use client';

import { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FaTimes } from 'react-icons/fa';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';
import { useAuth } from '@/contexts/AuthContext';
import type { TaskVisibility } from '@/lib/types';
import VisibilityBottomSheet from './VisibilityBottomSheet';

interface GoogleCalendarSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

export default function GoogleCalendarSettings({
  isOpen,
  onClose,
  onSuccess,
}: GoogleCalendarSettingsProps) {
  const { user, userData } = useAuth();
  const {
    isConnected,
    connecting,
    calendars,
    selectedCalendarIds,
    saveSelectedCalendars,
    connect,
    disconnect,
    loadCalendars,
  } = useGoogleCalendar();
  const [view, setView] = useState<'main' | 'calendars'>('main');
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [savingCalendars, setSavingCalendars] = useState(false);
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [defaultEventVisibility, setDefaultEventVisibility] = useState<TaskVisibility>('private');
  const [defaultEventVisibilityList, setDefaultEventVisibilityList] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen && userData) {
      setDefaultEventVisibility(userData.defaultEventVisibility ?? 'private');
      setDefaultEventVisibilityList(userData.defaultEventVisibilityList ?? []);
    }
  }, [isOpen, userData?.defaultEventVisibility, userData?.defaultEventVisibilityList]);

  useEffect(() => {
    if (isOpen && isConnected && view === 'calendars') {
      loadCalendars();
      setLocalSelected(new Set(selectedCalendarIds));
    }
  }, [isOpen, isConnected, view, selectedCalendarIds, loadCalendars]);

  const handleSaveCalendars = async () => {
    setSavingCalendars(true);
    try {
      await saveSelectedCalendars(Array.from(localSelected));
      onSuccess?.('Calendars saved');
      setView('main');
    } finally {
      setSavingCalendars(false);
    }
  };

  const toggleCalendar = (id: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleVisibilitySelect = async (visibility: TaskVisibility, visibilityList: string[]) => {
    setDefaultEventVisibility(visibility);
    setDefaultEventVisibilityList(visibilityList);
    if (user?.uid) {
      await updateDoc(doc(db, 'users', user.uid), {
        defaultEventVisibility: visibility,
        defaultEventVisibilityList: visibilityList,
      });
    }
    setShowVisibilityPicker(false);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[98] bg-black/40 animate-in fade-in duration-150" onClick={onClose} />
      <div
        className="fixed inset-x-4 bottom-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[min(400px,calc(100vw-2rem))] z-[99] md:rounded-2xl rounded-2xl bg-surface shadow-elevation-3 border border-border-subtle overflow-hidden animate-in md:zoom-in-95 fade-in slide-in-from-bottom-4 md:slide-in-from-bottom-2 duration-150 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border-subtle">
          <div className="w-16 flex justify-start">
            {view === 'calendars' ? (
              <button
                onClick={() => setView('main')}
                className="text-[14px] text-primary hover:underline"
              >
                ← Back
              </button>
            ) : null}
          </div>
          <h2 className="text-lg font-semibold text-fg-primary flex-1 text-center">
            {view === 'calendars' ? 'Manage calendars' : 'Google Calendar'}
          </h2>
          <div className="w-16 flex justify-end">
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-lg hover:bg-surface-muted text-fg-tertiary hover:text-fg-primary"
            >
              <FaTimes size={20} />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {view === 'calendars' ? (
            <div>
              <p className="text-sm text-fg-secondary mb-3">
                Which calendars do you want to see in Nudge?
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
                {calendars.map((cal) => (
                  <label
                    key={cal.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-muted cursor-pointer"
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{
                        backgroundColor: cal.backgroundColor || '#4285f4',
                      }}
                    />
                    <span className="text-[14px] text-fg-primary flex-1">{cal.summary}</span>
                    <input
                      type="checkbox"
                      checked={localSelected.has(cal.id)}
                      onChange={() => toggleCalendar(cal.id)}
                      className="rounded"
                    />
                  </label>
                ))}
              </div>
              <button
                onClick={handleSaveCalendars}
                disabled={localSelected.size === 0 || savingCalendars}
                className="w-full h-11 rounded-xl bg-primary text-on-accent text-[14px] font-semibold disabled:opacity-40"
              >
                {savingCalendars ? 'Saving...' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {isConnected ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-fg-secondary">Status</span>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-success" />
                      <span className="text-[13px] text-success font-medium">Connected</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setView('calendars')}
                    className="w-full text-[13px] text-primary hover:underline text-left"
                  >
                    Manage calendars
                  </button>
                  <div>
                    <p className="text-[11px] text-fg-tertiary uppercase tracking-wider mb-2">
                      Default event visibility to friends
                    </p>
                    <button
                      onClick={() => setShowVisibilityPicker(true)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-muted/50 text-left"
                    >
                      <span className="text-[14px] text-fg-primary">
                        {defaultEventVisibility === 'everyone'
                          ? 'Everyone'
                          : defaultEventVisibility === 'private'
                          ? 'Private'
                          : defaultEventVisibility === 'only'
                          ? `Only ${defaultEventVisibilityList.length} friend${defaultEventVisibilityList.length !== 1 ? 's' : ''}`
                          : `Except ${defaultEventVisibilityList.length} friend${defaultEventVisibilityList.length !== 1 ? 's' : ''}`}
                      </span>
                      <span className="text-fg-tertiary">›</span>
                    </button>
                  </div>
                  <button
                    onClick={disconnect}
                    className="w-full text-[13px] text-error hover:underline text-left"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => connect(() => onSuccess?.('Google Calendar connected'))}
                  disabled={connecting}
                  className="w-full px-4 py-2.5 rounded-[20px] text-[13px] font-medium border-[1.5px] border-primary text-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <VisibilityBottomSheet
        isOpen={showVisibilityPicker}
        onClose={() => setShowVisibilityPicker(false)}
        onSelect={handleVisibilitySelect}
        currentVisibility={defaultEventVisibility}
        currentVisibilityList={defaultEventVisibilityList}
        showSetAsDefault={false}
      />
    </>
  );
}
