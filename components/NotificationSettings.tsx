'use client';

import { useState, useEffect } from 'react';
import { FaTimes, FaBell, FaClock, FaSun, FaFire, FaUserFriends, FaVolumeUp, FaMobileAlt, FaComment } from 'react-icons/fa';
import { NotificationSettings as NotificationSettingsType } from '@/lib/types';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/hooks/useNotifications';

interface NotificationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  settings: NotificationSettingsType;
  onSave: (settings: NotificationSettingsType) => void;
  onRequestPermission: () => Promise<boolean>;
  permission: NotificationPermission;
}

export default function NotificationSettings({
  isOpen,
  onClose,
  settings,
  onSave,
  onRequestPermission,
  permission,
}: NotificationSettingsProps) {
  const [localSettings, setLocalSettings] = useState<NotificationSettingsType>(
    settings || DEFAULT_NOTIFICATION_SETTINGS
  );

  useEffect(() => {
    setLocalSettings(settings || DEFAULT_NOTIFICATION_SETTINGS);
  }, [settings]);

  const handleSave = () => {
    onSave(localSettings);
    onClose();
  };

  const handleToggle = (key: keyof NotificationSettingsType) => {
    setLocalSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleReminderTimeChange = (minutes: number) => {
    setLocalSettings((prev) => ({
      ...prev,
      deadlineMinutesBefore: minutes,
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-surface rounded-2xl shadow-elevation-3 max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <FaBell className="text-primary" size={24} />
            <h2 className="text-2xl font-bold text-fg-primary">
              Notification Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-fg-tertiary hover:text-fg-primary transition-colors"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Permission Status */}
          {permission !== 'granted' && (
            <div className="bg-warning-bg border border-warning-border rounded-lg p-4">
              <p className="text-sm text-warning-text mb-3">
                {permission === 'denied'
                  ? '❌ Notifications are blocked. Please enable them in your browser settings.'
                  : '🔔 Enable notifications to receive reminders and stay on track!'}
              </p>
              {permission === 'default' && (
                <button
                  onClick={onRequestPermission}
                  className="w-full px-4 py-2 bg-warning text-warning-text rounded-lg hover:opacity-90 transition-colors font-medium"
                >
                  Enable Notifications
                </button>
              )}
            </div>
          )}

          {/* Master Toggle */}
          <div className="flex items-center justify-between p-4 bg-surface-muted rounded-lg border border-border-subtle">
            <div className="flex items-center gap-3">
              <FaBell className="text-fg-tertiary" size={20} />
              <div>
                <h3 className="font-semibold text-fg-primary">
                  Enable Notifications
                </h3>
                <p className="text-sm text-fg-secondary">
                  Master switch for all notifications
                </p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('enabled')}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                localSettings.enabled
                  ? 'bg-primary'
                  : 'bg-surface-muted'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-on-accent rounded-full transition-transform ${
                  localSettings.enabled ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {/* Individual Settings */}
          <div className="space-y-4">
            {/* Deadline Reminders */}
            <div className="border border-border-subtle rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <FaClock className="text-warning" size={18} />
                  <div>
                    <h4 className="font-medium text-fg-primary">
                      Deadline Reminders
                    </h4>
                    <p className="text-xs text-fg-secondary">
                      Get notified before tasks are due
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('deadlineReminders')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.deadlineReminders
                      ? 'bg-warning'
                      : 'bg-surface-muted'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      localSettings.deadlineReminders ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
              {localSettings.deadlineReminders && (
                <div className="ml-7">
                  <label className="text-sm text-fg-secondary mb-2 block">
                    Remind me
                  </label>
                  <select
                    value={localSettings.deadlineMinutesBefore}
                    onChange={(e) => handleReminderTimeChange(Number(e.target.value))}
                    disabled={!localSettings.enabled}
                    className="w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-fg-primary disabled:opacity-50"
                  >
                    <option value={15}>15 minutes before</option>
                    <option value={30}>30 minutes before</option>
                    <option value={60}>1 hour before</option>
                    <option value={120}>2 hours before</option>
                    <option value={1440}>1 day before</option>
                  </select>
                </div>
              )}
            </div>

            {/* Noon Check-In */}
            <div className="border border-border-subtle rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaSun className="text-warning" size={18} />
                  <div>
                    <h4 className="font-medium text-fg-primary">
                      Noon Check-In
                    </h4>
                    <p className="text-xs text-fg-secondary">
                      Daily reminder at 12 PM
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('noonCheckIn')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.noonCheckIn
                      ? 'bg-warning'
                      : 'bg-surface-muted'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      localSettings.noonCheckIn ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Commitment Reminders */}
            <div className="border border-border-subtle rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaFire className="text-error" size={18} />
                  <div>
                    <h4 className="font-medium text-fg-primary">
                      Commitment Reminders
                    </h4>
                    <p className="text-xs text-fg-secondary">
                      Don't forget your commitments!
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('commitmentReminders')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.commitmentReminders
                      ? 'bg-error'
                      : 'bg-surface-muted'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      localSettings.commitmentReminders ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Friend Completions */}
            <div className="border border-border-subtle rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaUserFriends className="text-success" size={18} />
                  <div>
                    <h4 className="font-medium text-fg-primary">
                      Friend Completions
                    </h4>
                    <p className="text-xs text-fg-secondary">
                      Celebrate when friends complete tasks
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('friendCompletions')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.friendCompletions
                      ? 'bg-success'
                      : 'bg-surface-muted'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      localSettings.friendCompletions ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Friend Comments */}
            <div className="border border-border-subtle rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaComment className="text-primary" size={18} />
                  <div>
                    <h4 className="font-medium text-fg-primary">
                      Friend Comments
                    </h4>
                    <p className="text-xs text-fg-secondary">
                      Get notified when friends comment on your tasks
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('friendComments')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.friendComments
                      ? 'bg-primary'
                      : 'bg-surface-muted'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      localSettings.friendComments ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Friend Encouragement */}
            <div className="border border-border-subtle rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaFire className="text-streak" size={18} />
                  <div>
                    <h4 className="font-medium text-fg-primary">
                      Friend Encouragement
                    </h4>
                    <p className="text-xs text-fg-secondary">
                      Receive motivational messages from friends
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('friendEncouragement')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.friendEncouragement
                      ? 'bg-streak'
                      : 'bg-surface-muted'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      localSettings.friendEncouragement ? 'translate-x-6' : ''
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Sound & Vibration */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-surface-muted rounded-lg border border-border-subtle">
                <div className="flex items-center gap-3">
                  <FaVolumeUp className="text-fg-tertiary" size={16} />
                  <span className="text-sm font-medium text-fg-primary">
                    Sound
                  </span>
                </div>
                <button
                  onClick={() => handleToggle('sound')}
                  disabled={!localSettings.enabled}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localSettings.sound
                      ? 'bg-primary'
                      : 'bg-surface-muted'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      localSettings.sound ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-surface-muted rounded-lg border border-border-subtle">
                <div className="flex items-center gap-3">
                  <FaMobileAlt className="text-fg-tertiary" size={16} />
                  <span className="text-sm font-medium text-fg-primary">
                    Vibration
                  </span>
                </div>
                <button
                  onClick={() => handleToggle('vibrate')}
                  disabled={!localSettings.enabled}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localSettings.vibrate
                      ? 'bg-primary'
                      : 'bg-surface-muted'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      localSettings.vibrate ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border-subtle flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-surface-muted text-fg-secondary rounded-lg hover:bg-surface-muted/80 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-primary text-on-accent rounded-lg hover:bg-primary/90 transition-colors font-medium"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
