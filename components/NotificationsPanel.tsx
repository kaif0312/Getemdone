'use client';

import { useState, useEffect } from 'react';
import { FaTimes, FaBell, FaComment, FaCheck, FaClock, FaFire, FaTrash } from 'react-icons/fa';
import { InAppNotification } from '@/lib/types';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { useEncryption } from '@/hooks/useEncryption';
import { isEncrypted } from '@/utils/crypto';
import { db } from '@/lib/firebase';
import LinkifyText from './LinkifyText';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onTaskClick?: (taskId: string) => void;
}

export default function NotificationsPanel({
  isOpen,
  onClose,
  userId,
  onTaskClick,
}: NotificationsPanelProps) {
  const { isInitialized: encryptionInitialized, decryptFromFriend } = useEncryption();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !userId) return;

    // Listen to user's notifications
    const notificationsRef = collection(db, 'notifications');
    const q = query(
      notificationsRef,
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const notifs: InAppNotification[] = [];
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          
          // Decrypt notification data if encrypted
          let message = data.message;
          let taskText = data.taskText;
          let commentText = data.commentText;
          
          if (encryptionInitialized && data.fromUserId) {
            try {
              // Decrypt message, taskText, and commentText if they're encrypted
              if (message && typeof message === 'string' && isEncrypted(message)) {
                message = await decryptFromFriend(message, data.fromUserId);
              }
              if (taskText && typeof taskText === 'string' && isEncrypted(taskText)) {
                taskText = await decryptFromFriend(taskText, data.fromUserId);
              }
              if (commentText && typeof commentText === 'string' && isEncrypted(commentText)) {
                commentText = await decryptFromFriend(commentText, data.fromUserId);
              }
            } catch (error) {
              console.error('[NotificationsPanel] Failed to decrypt notification:', error);
            }
          }
          // Hide any remaining ciphertext or decryption failure - show friendly placeholder
          const looksLikeCipher = (s: string) =>
            !s || typeof s !== 'string' ? false
              : isEncrypted(s) || s.startsWith('e1:') || (s.length >= 30 && /^[A-Za-z0-9+/]+=*$/.test(s));
          const toPlaceholder = (s: string, placeholder: string) =>
            (looksLikeCipher(s) || s?.includes("[Couldn't decrypt]")) ? placeholder : s;
          if (commentText && typeof commentText === 'string') {
            commentText = toPlaceholder(commentText, '[Message]');
          }
          if (taskText && typeof taskText === 'string') {
            taskText = toPlaceholder(taskText, '[Task]');
          }
          
          const notif = {
            id: docSnap.id,
            userId: data.userId,
            type: data.type,
            title: data.title,
            message: message,
            taskId: data.taskId,
            taskText: taskText,
            fromUserId: data.fromUserId,
            fromUserName: data.fromUserName,
            commentText: commentText,
            createdAt: data.createdAt,
            read: data.read || false,
          };
          if (process.env.NODE_ENV === 'development' && (!data.fromUserName || !data.title)) {
            console.log('[NotificationsPanel] Notification missing name/title:', { id: docSnap.id, type: data.type, fromUserName: data.fromUserName, title: data.title });
          }
          notifs.push(notif);
        }
        setNotifications(notifs);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching notifications:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isOpen, userId, encryptionInitialized, decryptFromFriend]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleDelete = async (notificationId: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationClick = async (notification: InAppNotification) => {
    // Mark as read
    if (!notification.read) {
      await handleMarkAsRead(notification.id);
    }

    // Navigate to task if available
    if (notification.taskId && onTaskClick) {
      onTaskClick(notification.taskId);
      onClose();
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const getIcon = (type: InAppNotification['type']) => {
    switch (type) {
      case 'comment':
        return <FaComment className="text-purple-500" size={18} />;
      case 'completion':
        return <FaCheck className="text-green-500" size={18} />;
      case 'deadline':
        return <FaClock className="text-blue-500" size={18} />;
      case 'commitment':
        return <FaFire className="text-red-500" size={18} />;
      default:
        return <FaBell className="text-gray-500" size={18} />;
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-x-0 top-0 md:right-0 md:left-auto md:w-96 h-full md:h-auto md:top-16 md:max-h-[600px] bg-white dark:bg-gray-800 z-50 shadow-2xl animate-in slide-in-from-top md:slide-in-from-right duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <FaBell className="text-blue-500" size={20} />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
            title="Close"
          >
            <FaTimes className="text-gray-500 dark:text-gray-400" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <FaBell className="text-gray-300 dark:text-gray-600 mb-4" size={48} />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                No notifications yet
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                You'll see updates from your friends here
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer ${
                    !notification.read ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">{getIcon(notification.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">
                            {notification.title}
                          </p>
                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 whitespace-pre-wrap">
                            {notification.type === 'comment' && notification.commentText ? (
                              <>
                                <span>"<LinkifyText text={notification.commentText} linkClassName="text-blue-600 dark:text-blue-400" />"</span>
                                {notification.taskText && (
                                  <span className="block text-xs text-gray-500 dark:text-gray-500 mt-1 italic truncate">
                                    on "<LinkifyText text={notification.taskText} linkClassName="text-blue-600 dark:text-blue-400" />"
                                  </span>
                                )}
                              </>
                            ) : notification.type === 'bugReport' && notification.message && !notification.message.includes('Your feedback has been') ? (
                              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border-l-3 border-blue-500 rounded-r">
                                <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
                                  💬 Admin Reply:
                                </div>
                                <div className="text-sm text-gray-800 dark:text-gray-200">
                                  <LinkifyText text={notification.message} linkClassName="text-blue-600 dark:text-blue-400" />
                                </div>
                              </div>
                            ) : (
                              notification.message ? <LinkifyText text={notification.message} linkClassName="text-blue-600 dark:text-blue-400" /> : null
                            )}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(notification.id);
                          }}
                          className="flex-shrink-0 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors"
                          title="Delete"
                        >
                          <FaTrash className="text-gray-400 dark:text-gray-500" size={12} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {formatTime(notification.createdAt)}
                        </span>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 p-3">
            <button
              onClick={async () => {
                // Mark all as read
                const unread = notifications.filter((n) => !n.read);
                await Promise.all(
                  unread.map((n) => handleMarkAsRead(n.id))
                );
              }}
              className="w-full px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            >
              Mark all as read
            </button>
          </div>
        )}
      </div>
    </>
  );
}
