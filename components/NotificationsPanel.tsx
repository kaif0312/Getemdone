'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSwipeable } from 'react-swipeable';
import { LuBell, LuBellRing, LuTrash2 } from 'react-icons/lu';
import { FaTimes } from 'react-icons/fa';
import { InAppNotification } from '@/lib/types';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { useEncryption } from '@/hooks/useEncryption';
import { isEncrypted } from '@/utils/crypto';
import { db } from '@/lib/firebase';
import LinkifyText from './LinkifyText';
import Avatar from './Avatar';
import { getAccentForId } from '@/lib/theme';

interface NotificationsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onTaskClick?: (taskId: string) => void;
  friendPhotoMap?: Record<string, string>;
}

/** Extract reaction emoji from title (e.g. "👍 dinesh reacted..." -> "👍") */
function extractReactionEmoji(title: string): string | undefined {
  const match = title.match(/^(\p{Emoji})\s+/u);
  return match ? match[1] : undefined;
}

/** Group key for similar notifications (same person, same task, within 30 min) */
function getGroupKey(n: InAppNotification): string {
  const isReaction = n.message?.includes('reacted') || n.title?.includes('reacted');
  if (!isReaction || !n.fromUserId || !n.taskId) return n.id;
  const windowStart = n.createdAt - 30 * 60 * 1000;
  return `${n.fromUserId}:${n.taskId}:${Math.floor(windowStart / (5 * 60 * 1000))}`;
}

interface GroupedNotification {
  id: string;
  items: InAppNotification[];
  fromUserId?: string;
  fromUserName?: string;
  fromUserPhotoURL?: string;
  taskId?: string;
  taskText?: string;
  createdAt: number;
  read: boolean;
  reactionEmojis: string[];
  commentTexts: string[];
}

function groupNotifications(notifications: InAppNotification[]): GroupedNotification[] {
  const byKey = new Map<string, InAppNotification[]>();
  for (const n of notifications) {
    const key = getGroupKey(n);
    const list = byKey.get(key) || [];
    list.push(n);
    byKey.set(key, list);
  }
  return Array.from(byKey.entries()).map(([key, items]) => {
    const first = items[0];
    const reactionEmojis = items
      .map((n) => n.reactionEmoji || extractReactionEmoji(n.title))
      .filter(Boolean) as string[];
    const commentTexts = items.map((n) => n.commentText).filter(Boolean) as string[];
    return {
      id: key,
      items,
      fromUserId: first.fromUserId,
      fromUserName: first.fromUserName,
      fromUserPhotoURL: first.fromUserPhotoURL,
      taskId: first.taskId,
      taskText: first.taskText,
      createdAt: first.createdAt,
      read: items.every((i) => i.read),
      reactionEmojis,
      commentTexts,
    };
  });
}

export default function NotificationsPanel({
  isOpen,
  onClose,
  userId,
  onTaskClick,
  friendPhotoMap = {},
}: NotificationsPanelProps) {
  const { isInitialized: encryptionInitialized, decryptFromFriend } = useEncryption();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen || !userId) return;

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

          let message = data.message;
          let taskText = data.taskText;
          let commentText = data.commentText;

          if (encryptionInitialized && data.fromUserId) {
            try {
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

          notifs.push({
            id: docSnap.id,
            userId: data.userId,
            type: data.type,
            title: data.title,
            message: message,
            taskId: data.taskId,
            taskText: taskText,
            fromUserId: data.fromUserId,
            fromUserName: data.fromUserName,
            fromUserPhotoURL: data.fromUserPhotoURL,
            reactionEmoji: data.reactionEmoji,
            commentText: commentText,
            createdAt: data.createdAt,
            read: data.read || false,
          });
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

  const filteredNotifications = useMemo(() => {
    const list = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;
    return list;
  }, [notifications, filter]);

  const grouped = useMemo(() => groupNotifications(filteredNotifications), [filteredNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(unread.map((n) => handleMarkAsRead(n.id)));
  };

  const handleDelete = async (notificationId: string) => {
    setDeletingIds((prev) => new Set(prev).add(notificationId));
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    } finally {
      setTimeout(() => setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      }), 200);
    }
  };

  const handleDeleteGroup = async (group: GroupedNotification) => {
    for (const item of group.items) {
      await handleDelete(item.id);
    }
  };

  const handleNotificationClick = async (group: GroupedNotification) => {
    for (const n of group.items) {
      if (!n.read) await handleMarkAsRead(n.id);
    }
    if (group.taskId && onTaskClick) {
      onTaskClick(group.taskId);
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

  const getPhotoURL = (n: { fromUserPhotoURL?: string; fromUserId?: string }) =>
    n.fromUserPhotoURL || (n.fromUserId ? friendPhotoMap[n.fromUserId] : undefined);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop - rgba(0,0,0,0.3) mobile, rgba(0,0,0,0.15) desktop */}
      <div
        className="fixed inset-0 z-[100] bg-black/30 md:bg-black/15 backdrop-blur-0 animate-in fade-in duration-250"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel - mobile: bottom sheet 85%, desktop: side panel 380px, 250ms slide */}
      <div
        className="fixed z-[101] flex flex-col bg-elevated
          md:right-0 md:top-0 md:w-[380px] md:h-full md:rounded-none md:border-l md:border-border-subtle md:shadow-[-4px_0_16px_rgba(0,0,0,0.1)]
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl border-t border-border-subtle
          animate-in slide-in-from-bottom md:slide-in-from-right duration-250 ease-out"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0px)',
        }}
      >
        {/* Drag handle pill - mobile only: 36px wide, 4px tall, tertiary 30% opacity */}
        <div className="flex justify-center pt-3 pb-2 md:hidden flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-fg-tertiary/30" aria-hidden />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 border-b border-border-subtle px-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <LuBell size={20} className="text-fg-primary flex-shrink-0" />
              <h2 className="text-lg font-semibold text-fg-primary truncate">Notifications</h2>
              {unreadCount > 0 && (
                <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center text-[11px] font-medium bg-primary text-on-accent rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[13px] text-primary hover:underline py-1 px-2 -mr-1"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-2 text-fg-secondary hover:text-fg-primary rounded-lg transition-colors"
                title="Close"
              >
                <FaTimes size={20} />
              </button>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-4 mt-3">
            <button
              onClick={() => setFilter('all')}
              className={`text-[13px] font-medium transition-colors ${
                filter === 'all' ? 'text-primary underline underline-offset-4 decoration-2' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`text-[13px] font-medium transition-colors ${
                filter === 'unread' ? 'text-primary underline underline-offset-4 decoration-2' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              Unread
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <LuBellRing size={48} className="text-fg-tertiary/30 mb-4" />
              <p className="text-sm text-fg-secondary">All caught up</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {grouped.map((group) => {
                const isDeleting = group.items.some((i) => deletingIds.has(i.id));
                const photoURL = getPhotoURL(group.items[0]);
                const accent = group.fromUserId ? getAccentForId(group.fromUserId) : { from: 'from-blue-500', to: 'to-purple-600' };

                return (
                  <NotificationRow
                    key={group.id}
                    group={group}
                    photoURL={photoURL}
                    accent={accent}
                    formatTime={formatTime}
                    onClick={() => handleNotificationClick(group)}
                    onDelete={() => handleDeleteGroup(group)}
                    isDeleting={isDeleting}
                    friendPhotoMap={friendPhotoMap}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

interface NotificationRowProps {
  group: GroupedNotification;
  photoURL?: string;
  accent: { from: string; to: string };
  formatTime: (ts: number) => string;
  onClick: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  friendPhotoMap: Record<string, string>;
}

function NotificationRow({
  group,
  photoURL,
  accent,
  formatTime,
  onClick,
  onDelete,
  isDeleting,
}: NotificationRowProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);

  const first = group.items[0];
  const isReaction = first?.message?.includes('reacted') || first?.title?.includes('reacted');
  const count = group.items.length;
  const firstName = group.fromUserName || 'Someone';
  const emojis = group.reactionEmojis;
  const previewText = group.commentTexts[0] || '';
  const isComment = first?.type === 'comment';
  const isEncouragement = first?.type === 'encouragement';
  const isBugReport = first?.type === 'bugReport';

  const [swipeRevealed, setSwipeRevealed] = useState(false);

  const swipeHandlers = useSwipeable({
    onSwiping: (e) => {
      if (e.deltaX < 0) setSwipeOffset(Math.max(-80, e.deltaX));
      else if (!swipeRevealed) setSwipeOffset(0);
      else setSwipeOffset(Math.min(0, -80 + e.deltaX));
    },
    onSwiped: (e) => {
      if (e.deltaX < -50) {
        setSwipeOffset(-80);
        setSwipeRevealed(true);
      } else {
        setSwipeOffset(0);
        setSwipeRevealed(false);
      }
    },
    trackMouse: true,
  });

  return (
    <div
      {...swipeHandlers}
      className={`relative overflow-hidden transition-all duration-200 ease-out ${
        isDeleting ? 'opacity-0 -translate-x-full' : ''
      } ${!group.read ? 'border-l-[3px] border-l-primary bg-primary/[0.03]' : ''} border-b border-border-subtle last:border-b-0`}
    >
      {/* Swipe delete area - mobile (iOS Mail pattern) */}
      <div
        className="absolute inset-y-0 right-0 w-20 bg-error flex items-center justify-center md:hidden z-10"
      >
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-on-accent text-sm font-medium px-4"
        >
          Delete
        </button>
      </div>

      <div
        className="relative flex items-start gap-3 py-3 px-4 cursor-pointer hover:bg-surface-muted/50 transition-colors duration-200 group bg-elevated"
        style={{ transform: swipeOffset < 0 ? `translateX(${swipeOffset}px)` : undefined }}
        onClick={onClick}
      >
        {/* Avatar */}
        <div className="flex-shrink-0 mt-0.5">
          <Avatar
            photoURL={photoURL}
            displayName={firstName}
            size="xs"
            gradientFrom={accent.from}
            gradientTo={accent.to}
            className="w-7 h-7"
          />
        </div>

        {/* Content - padding 12px 16px */}
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] leading-snug ${group.read ? 'text-fg-secondary' : 'text-fg-primary'}`}>
            <span className="font-semibold">{firstName}</span>
            {isReaction ? (
              count > 1 ? (
                <>
                  {' '}
                  <span className={group.read ? 'text-fg-secondary' : 'text-fg-secondary'}>
                    reacted to {count} of your comments
                    {group.taskText && ` on "${group.taskText}"`}
                    {emojis.length > 0 && (
                      <span className="ml-1">{emojis.join(' ')}</span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  {' '}
                  <span className="text-fg-secondary">
                    reacted {emojis[0] || ''} to your comment
                  </span>
                </>
              )
            ) : isEncouragement ? (
              <span className="font-normal text-fg-secondary"> sent you encouragement</span>
            ) : isComment ? (
              <span className="font-normal text-fg-secondary"> commented</span>
            ) : isBugReport ? (
              <span className="font-normal text-fg-secondary"> {first?.message?.substring(0, 60) || 'Admin reply'}</span>
            ) : (
              <span className="font-normal text-fg-secondary"> {first?.message || first?.title}</span>
            )}
          </p>
          {previewText && (
            <p className="text-[13px] text-fg-tertiary italic mt-0.5 line-clamp-2">
              &quot;<LinkifyText text={previewText} linkClassName="text-primary" />&quot;
            </p>
          )}
          <p className="text-[12px] text-fg-tertiary mt-1 flex items-center gap-1 flex-wrap">
            {group.taskText && count === 1 && (
              <>
                <span>on &quot;{group.taskText}&quot;</span>
                <span>·</span>
              </>
            )}
            <span>{formatTime(group.createdAt)}</span>
          </p>
        </div>

        {/* Delete - desktop: hover only, tertiary → error on hover */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="hidden md:flex flex-shrink-0 p-2 rounded-lg text-fg-tertiary hover:text-error opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          title="Delete"
        >
          <LuTrash2 size={16} />
        </button>
      </div>
    </div>
  );
}
