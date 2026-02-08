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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <FaBell className="text-blue-500" size={24} />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Notification Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Permission Status */}
          {permission !== 'granted' && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                {permission === 'denied'
                  ? '❌ Notifications are blocked. Please enable them in your browser settings.'
                  : '🔔 Enable notifications to receive reminders and stay on track!'}
              </p>
              {permission === 'default' && (
                <button
                  onClick={onRequestPermission}
                  className="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg transition-colors font-medium"
                >
                  Enable Notifications
                </button>
              )}
            </div>
          )}

          {/* Master Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center gap-3">
              <FaBell className="text-gray-500" size={20} />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Enable Notifications
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Master switch for all notifications
                </p>
              </div>
            </div>
            <button
              onClick={() => handleToggle('enabled')}
              className={`relative w-14 h-8 rounded-full transition-colors ${
                localSettings.enabled
                  ? 'bg-blue-500'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-transform ${
                  localSettings.enabled ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {/* Individual Settings */}
          <div className="space-y-4">
            {/* Deadline Reminders */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <FaClock className="text-orange-500" size={18} />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Deadline Reminders
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Get notified before tasks are due
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('deadlineReminders')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.deadlineReminders
                      ? 'bg-orange-500'
                      : 'bg-gray-300 dark:bg-gray-600'
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
                  <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">
                    Remind me
                  </label>
                  <select
                    value={localSettings.deadlineMinutesBefore}
                    onChange={(e) => handleReminderTimeChange(Number(e.target.value))}
                    disabled={!localSettings.enabled}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white disabled:opacity-50"
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
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaSun className="text-yellow-500" size={18} />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Noon Check-In
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Daily reminder at 12 PM
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('noonCheckIn')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.noonCheckIn
                      ? 'bg-yellow-500'
                      : 'bg-gray-300 dark:bg-gray-600'
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
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaFire className="text-red-500" size={18} />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Commitment Reminders
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Don't forget your commitments!
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('commitmentReminders')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.commitmentReminders
                      ? 'bg-red-500'
                      : 'bg-gray-300 dark:bg-gray-600'
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
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaUserFriends className="text-green-500" size={18} />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Friend Completions
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Celebrate when friends complete tasks
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('friendCompletions')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.friendCompletions
                      ? 'bg-green-500'
                      : 'bg-gray-300 dark:bg-gray-600'
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
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaComment className="text-purple-500" size={18} />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Friend Comments
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Get notified when friends comment on your tasks
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('friendComments')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.friendComments
                      ? 'bg-purple-500'
                      : 'bg-gray-300 dark:bg-gray-600'
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
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FaFire className="text-orange-500" size={18} />
                  <div>
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      Friend Encouragement
                    </h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Receive motivational messages from friends
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleToggle('friendEncouragement')}
                  disabled={!localSettings.enabled}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    localSettings.friendEncouragement
                      ? 'bg-orange-500'
                      : 'bg-gray-300 dark:bg-gray-600'
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
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FaVolumeUp className="text-gray-500" size={16} />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Sound
                  </span>
                </div>
                <button
                  onClick={() => handleToggle('sound')}
                  disabled={!localSettings.enabled}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localSettings.sound
                      ? 'bg-blue-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                  } disabled:opacity-50`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                      localSettings.sound ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FaMobileAlt className="text-gray-500" size={16} />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Vibration
                  </span>
                </div>
                <button
                  onClick={() => handleToggle('vibrate')}
                  disabled={!localSettings.enabled}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    localSettings.vibrate
                      ? 'bg-blue-500'
                      : 'bg-gray-300 dark:bg-gray-600'
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
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
