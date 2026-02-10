'use client';

import { useState, useRef, useEffect } from 'react';
import { FaCog, FaBell, FaQuestionCircle, FaTrash, FaShieldAlt, FaWhatsapp, FaDatabase, FaLightbulb } from 'react-icons/fa';
import StorageUsage from './StorageUsage';

interface SettingsMenuProps {
  onNotificationSettings: () => void;
  onHelp: () => void;
  onRecycleBin: () => void;
  onAdmin?: () => void;
  onWhatsAppShare: () => void;
  onFeedback: () => void;
  deletedCount: number;
  isAdmin: boolean;
  notificationPermission: NotificationPermission;
  userId: string;
  storageUsed?: number;
  storageLimit?: number;
}

export default function SettingsMenu({
  onNotificationSettings,
  onHelp,
  onRecycleBin,
  onAdmin,
  onWhatsAppShare,
  onFeedback,
  deletedCount,
  isAdmin,
  notificationPermission,
  userId,
  storageUsed = 0,
  storageLimit,
}: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* Settings Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 p-2 sm:p-2.5 md:p-3 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors relative flex-shrink-0"
        title="Settings & More"
      >
        <FaCog size={18} className={isOpen ? 'animate-spin-slow' : ''} />
        {/* Indicator badges */}
        {(notificationPermission !== 'granted' || deletedCount > 0) && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {deletedCount > 0 ? deletedCount : '!'}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 animate-in fade-in slide-in-from-top-2 duration-200" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', overflowX: 'hidden' }}>
          <div className="py-2">
            {/* Storage Usage - Non-clickable display */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <StorageUsage
                userId={userId}
                initialUsage={storageUsed}
                limit={storageLimit}
                compact={false}
              />
            </div>

            {/* Notification Settings */}
            <button
              onClick={() => handleItemClick(onNotificationSettings)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
            >
              <div className="relative">
                <FaBell size={18} className="text-blue-500" />
                {notificationPermission !== 'granted' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  Notification Settings
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {notificationPermission === 'granted' ? 'Enabled' : 'Not enabled'}
                </div>
              </div>
            </button>

            {/* Help & Tips */}
            <button
              onClick={() => handleItemClick(onHelp)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
            >
              <FaQuestionCircle size={18} className="text-purple-500" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400">
                  Help & Tips
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Learn how to use features
                </div>
              </div>
            </button>

            {/* Recycle Bin */}
            <button
              onClick={() => handleItemClick(onRecycleBin)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
            >
              <div className="relative">
                <FaTrash size={18} className="text-red-500" />
                {deletedCount > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {deletedCount}
                  </span>
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400">
                  Recycle Bin
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {deletedCount > 0 ? `${deletedCount} deleted task${deletedCount !== 1 ? 's' : ''}` : 'No deleted tasks'}
                </div>
              </div>
            </button>

            {/* WhatsApp Share */}
            <button
              onClick={() => handleItemClick(onWhatsAppShare)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
            >
              <FaWhatsapp size={18} className="text-green-500" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400">
                  Share to WhatsApp
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Share your tasks
                </div>
              </div>
            </button>

            {/* Feedback & Feature Requests */}
            <button
              onClick={() => handleItemClick(onFeedback)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
            >
              <FaLightbulb size={18} className="text-yellow-500" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-yellow-600 dark:group-hover:text-yellow-400">
                  Feedback & Ideas
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Report bugs or suggest features
                </div>
              </div>
            </button>

            {/* Admin Dashboard (only if admin) */}
            {isAdmin && onAdmin && (
              <>
                <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>
                <button
                  onClick={() => handleItemClick(onAdmin)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left group"
                >
                  <FaShieldAlt size={18} className="text-purple-600" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400">
                      Admin Dashboard
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Manage users & settings
                    </div>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
