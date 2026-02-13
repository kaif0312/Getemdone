'use client';

import { useEffect, useState } from 'react';
import { FaBell, FaCheckCircle, FaClock, FaFire, FaUserFriends, FaTimes } from 'react-icons/fa';
import LinkifyText from './LinkifyText';

export interface ToastNotification {
  id: string;
  type: 'deadline' | 'noon-checkin' | 'commitment' | 'friend' | 'success';
  title: string;
  message: string;
  duration?: number; // ms, default 5000
}

interface NotificationToastProps {
  notifications: ToastNotification[];
  onDismiss: (id: string) => void;
}

export default function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  const [visible, setVisible] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    notifications.forEach((notif) => {
      // Show with animation
      setTimeout(() => {
        setVisible((prev) => ({ ...prev, [notif.id]: true }));
      }, 50);

      // Auto-dismiss after duration
      const timer = setTimeout(() => {
        handleDismiss(notif.id);
      }, notif.duration || 5000);

      return () => clearTimeout(timer);
    });
  }, [notifications]);

  const handleDismiss = (id: string) => {
    setVisible((prev) => ({ ...prev, [id]: false }));
    setTimeout(() => onDismiss(id), 300); // Wait for animation
  };

  const getIcon = (type: ToastNotification['type']) => {
    switch (type) {
      case 'deadline':
        return <FaClock className="text-orange-500" size={20} />;
      case 'noon-checkin':
        return <FaBell className="text-blue-500" size={20} />;
      case 'commitment':
        return <FaFire className="text-red-500" size={20} />;
      case 'friend':
        return <FaUserFriends className="text-green-500" size={20} />;
      case 'success':
        return <FaCheckCircle className="text-green-500" size={20} />;
      default:
        return <FaBell className="text-gray-500" size={20} />;
    }
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-[60] space-y-3 pointer-events-none">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className={`pointer-events-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-sm overflow-hidden transition-all duration-300 ${
            visible[notif.id]
              ? 'opacity-100 translate-x-0'
              : 'opacity-0 translate-x-full'
          }`}
        >
          <div className="p-4 flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">{getIcon(notif.type)}</div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-0.5">
                {notif.title}
              </h4>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                <LinkifyText text={notif.message} linkClassName="text-blue-600 dark:text-blue-400" />
              </p>
            </div>
            <button
              onClick={() => handleDismiss(notif.id)}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Dismiss notification"
            >
              <FaTimes size={16} />
            </button>
          </div>
          {/* Progress bar */}
          <div className="h-1 bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-progress"
              style={{
                animationDuration: `${notif.duration || 5000}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
