'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { LuTriangleAlert } from 'react-icons/lu';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTasks } from '@/hooks/useTasks';
import { useFriends } from '@/hooks/useFriends';
import { useRecycleCleanup } from '@/hooks/useRecycleCleanup';
import AuthModal from '@/components/AuthModal';
import TaskInput from '@/components/TaskInput';
import TaskItem from '@/components/TaskItem';
import SortableTaskItem from '@/components/SortableTaskItem';
import FriendsModal from '@/components/FriendsModal';
import FriendTaskCard from '@/components/FriendTaskCard';
import SortableFriendsSummaryBar from '@/components/SortableFriendsSummaryBar';
import StreakCalendar from '@/components/StreakCalendar';
import RecycleBin from '@/components/RecycleBin';
import CommentsModal from '@/components/CommentsModal';
import ProfileSettings from '@/components/ProfileSettings';
import Avatar from '@/components/Avatar';
import NotificationSettings from '@/components/NotificationSettings';
import NotificationToast, { ToastNotification } from '@/components/NotificationToast';
import { useNotifications, DEFAULT_NOTIFICATION_SETTINGS } from '@/hooks/useNotifications';
import type { NotificationSettings as NotificationSettingsType } from '@/lib/types';
import { useNotificationListener } from '@/hooks/useNotificationListener';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import SettingsMenu from '@/components/SettingsMenu';
import BugReportModal from '@/components/BugReportModal';
import NotificationsPanel from '@/components/NotificationsPanel';
import QuickInfoModal from '@/components/QuickInfoModal';
import IOSInstallPrompt from '@/components/IOSInstallPrompt';
import AndroidInstallPrompt from '@/components/AndroidInstallPrompt';
import AccessRemovedScreen from '@/components/AccessRemovedScreen';
import { FaBell } from 'react-icons/fa';
import { LuFlame, LuInbox, LuChevronDown } from 'react-icons/lu';
import ProfileAvatarDropdown from '@/components/ProfileAvatarDropdown';
import { NudgeWordmark, NudgeIcon } from '@/components/NudgeLogo';
import EmptyState from '@/components/EmptyState';
import HelpModal from '@/components/HelpModal';
import NotificationPrompt from '@/components/NotificationPrompt';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useRouter } from 'next/navigation';
import { shareMyTasks } from '@/utils/share';
import { useDataMigration } from '@/hooks/useDataMigration';
import { useTagMigration } from '@/hooks/useTagMigration';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, MouseSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { shouldShowInTodayView, countRolledOverTasks, getTodayString, getDateString } from '@/utils/taskFilter';
import { dateMatchesRecurrence } from '@/utils/recurrence';
import { needsInstallation, needsAndroidInstallation } from '@/utils/deviceDetection';
import { loadTagOrder, saveTagOrder, mergeTagOrder } from '@/lib/tagOrder';
import { normalizeTagToIconId, getIconForTag, getLabelForTag } from '@/lib/tagIcons';
import { loadFriendOrder, saveFriendOrder, mergeFriendOrder } from '@/lib/friendOrder';
import { getAccentForId } from '@/lib/theme';
import { groupTasksByTag, loadCollapsedSections, saveCollapsedSections, sectionKey } from '@/utils/taskGrouping';
import SortableTagBar from '@/components/SortableTagBar';

export default function Home() {
  const { user, userData, isWhitelisted, loading: authLoading } = useAuth();

  // Early return before mounting Firestore-dependent hooks - prevents "Missing or insufficient permissions" on login screen
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center flex flex-col items-center">
          <div className="animate-nudge-pulse mb-4">
            <NudgeIcon size={64} />
          </div>
          <p className="text-[24px] font-bold text-fg-primary">Nudge</p>
        </div>
      </div>
    );
  }

  if (!user || !userData) {
    return <AuthModal />;
  }

  if (isWhitelisted === false) {
    return <AccessRemovedScreen />;
  }

  if (isWhitelisted === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center flex flex-col items-center">
          <div className="animate-nudge-pulse mb-4">
            <NudgeIcon size={64} />
          </div>
          <p className="text-[24px] font-bold text-fg-primary mb-2">Nudge</p>
          <p className="text-fg-secondary">Verifying access...</p>
        </div>
      </div>
    );
  }

  return <MainApp />;
}

function MainApp() {
  const { user, userData, signOut, updateStreakData } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();

  // MainApp only mounts when user and userData exist (checked in Home)
  const uid = user!.uid;
  const data = userData!;

  // Auto-cleanup expired recycle bin items
  useRecycleCleanup(uid);

  const { tasks, loading: tasksLoading, addTask, updateTask, updateTaskDueDate, updateTaskNotes, toggleComplete, togglePrivacy, toggleCommitment, toggleSkipRollover, deleteTask, restoreTask, permanentlyDeleteTask, permanentlyDeleteAllTasks, getDeletedTasks, addReaction, addComment, addCommentReaction, editComment, deleteComment, deferTask, reorderTasks, addAttachment, deleteAttachment, sendEncouragement, userStorageUsage, updateTaskTags, recordRecentlyUsedTag, updateTaskSubtasks, updateTaskRecurrence } = useTasks();
  const { friends: friendUsers } = useFriends();
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showStreakCalendar, setShowStreakCalendar] = useState(false);
  const [showBugReportModal, setShowBugReportModal] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [selectedTaskForComments, setSelectedTaskForComments] = useState<string | null>(null);
  const [hasHandledNotificationOpen, setHasHandledNotificationOpen] = useState(false);
  const [dismissedRolloverNotice, setDismissedRolloverNotice] = useState(false);
  const [lastNoticeDate, setLastNoticeDate] = useState<string | null>(null);
  const [expandedFriends, setExpandedFriends] = useState<Set<string>>(new Set());
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [collapsedFriends, setCollapsedFriends] = useState<Set<string>>(new Set()); // Track explicitly collapsed friends
  const [hasManuallyInteracted, setHasManuallyInteracted] = useState(false); // Track if user has manually expanded/collapsed
  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
  const [tagOrder, setTagOrder] = useState<string[]>(() => loadTagOrder());
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => loadCollapsedSections());

  useEffect(() => {
    saveTagOrder(tagOrder);
  }, [tagOrder]);

  useEffect(() => {
    saveCollapsedSections(collapsedSections);
  }, [collapsedSections]);

  const toggleSectionCollapsed = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Open comments or notifications when arriving from notification click
  useEffect(() => {
    if (hasHandledNotificationOpen || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('taskId');
    const openComments = params.get('openComments');
    const openNotifications = params.get('openNotifications');
    if (taskId && openComments === '1') {
      setSelectedTaskForComments(taskId);
      setHasHandledNotificationOpen(true);
      router.replace('/', { scroll: false });
    } else if (openNotifications === '1') {
      setShowNotificationsPanel(true);
      setHasHandledNotificationOpen(true);
      router.replace('/', { scroll: false });
    }
  }, [router, hasHandledNotificationOpen]);

  // Notification system
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [showQuickInfo, setShowQuickInfo] = useState(false);
  const [toastNotifications, setToastNotifications] = useState<ToastNotification[]>([]);
  const [noonCheckScheduled, setNoonCheckScheduled] = useState(false);
  const notifications = useNotifications(uid);

  // Listen for new notifications and trigger push notifications
  useNotificationListener({
    userId: uid,
    notificationSettings: data.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS,
    showNotification: notifications.showNotification,
    isSupported: notifications.isSupported,
  });

  // Track unread notification count
  const unreadNotifications = useUnreadNotifications(uid);

  const [activeFriendId, setActiveFriendId] = useState<string | null>(null);
  const [friendOrder, setFriendOrder] = useState<string[]>([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  
  const onboarding = useOnboarding();
  
  // Data migration - automatically encrypts existing data
  useDataMigration();
  useTagMigration();
  
  // Refs
  const taskInputRef = useRef<HTMLInputElement>(null);
  const streakButtonRef = useRef<HTMLButtonElement>(null);

  // iOS Installation Detection
  const [showIOSInstallPrompt, setShowIOSInstallPrompt] = useState(false);
  const [isCheckingIOSInstall, setIsCheckingIOSInstall] = useState(true);

  // Android Installation Detection
  const [showAndroidInstallPrompt, setShowAndroidInstallPrompt] = useState(false);
  const [isCheckingAndroidInstall, setIsCheckingAndroidInstall] = useState(true);

  // Check if iOS user needs to install app
  useEffect(() => {
    // Only check on client-side after mount
    if (typeof window !== 'undefined') {
      const needsInstall = needsInstallation();
      setShowIOSInstallPrompt(needsInstall);
      setIsCheckingIOSInstall(false);
      
      if (needsInstall) {
        console.log('🍎 iOS user detected - App must be installed to home screen for full functionality');
      }
    }
  }, []);

  // Check if Android user needs to install app
  useEffect(() => {
    // Only check on client-side after mount
    if (typeof window !== 'undefined') {
      const needsInstall = needsAndroidInstallation();
      setShowAndroidInstallPrompt(needsInstall);
      setIsCheckingAndroidInstall(false);
      
      if (needsInstall) {
        console.log('🤖 Android user detected - App must be installed to home screen for full functionality');
      }
    }
  }, []);

  // Reset rollover notice dismissal on new day (check periodically)
  useEffect(() => {
    const checkDateChange = () => {
      const todayStr = getTodayString();
      if (lastNoticeDate !== todayStr) {
        setDismissedRolloverNotice(false);
        setLastNoticeDate(todayStr);
      }
    };
    
    // Check immediately
    checkDateChange();
    
    // Check every minute to catch date changes
    const interval = setInterval(checkDateChange, 60000);
    return () => clearInterval(interval);
  }, []); // Only run once on mount

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms hold before drag starts (prevents conflict with scroll)
        tolerance: 5, // 5px tolerance for touch movement
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Get incomplete tasks - use same filter as main list (includes scheduled tasks)
    const myTasks = tasks.filter(task => {
      if (task.userId !== uid) return false;
      if (task.deleted === true) return false;
      return shouldShowInTodayView(task, todayStr) && !task.completed;
    });
    const filtered = activeTagFilters.length === 0
      ? myTasks
      : myTasks.filter((t) => activeTagFilters.some((filterId) => t.tags?.some((tag) => normalizeTagToIconId(tag) === filterId)));
    const groups = groupTasksByTag(filtered, tagOrder);
    const flatTasks = groups.flatMap((g) => g.tasks);

    const oldIndex = flatTasks.findIndex((t) => t.id === active.id);
    const newIndex = flatTasks.findIndex((t) => t.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedTasks = arrayMove(flatTasks, oldIndex, newIndex);

    // Update orders in Firestore
    const updates = reorderedTasks.map((task, index) => 
      reorderTasks(task.id, index)
    );

    await Promise.all(updates);
  };

  // Update streak data when component mounts or user changes
  useEffect(() => {
    if (uid && data.id) {
      updateStreakData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, data.id]); // Only depend on IDs, not entire objects or functions

  // Update deleted tasks count
  useEffect(() => {
    if (uid) {
      getDeletedTasks().then(tasks => setDeletedCount(tasks.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, tasks.length]); // Only depend on user ID and task count, not entire tasks array

  // Calculate friend entries for friends' tasks section - include ALL friends (even with no tasks)
  const friendEntries = useMemo(() => {
    if (!uid || friendUsers.length === 0) return [];

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Get all friend tasks (both private and public)
    const allFriendTasks = tasks.filter((task) => {
      if (task.userId === uid) return false;
      if (task.deleted === true) return false;

      // Recurring: show only if due today and not completed/skipped (completed ones disappear)
      if (task.recurrence) {
        if (task.recurrence.completedDates?.includes(todayStr)) return false;
        if (task.recurrence.skippedDates?.includes(todayStr)) return false;
        return dateMatchesRecurrence(task.recurrence, todayStr);
      }

      // For friends' tasks, only show completed tasks from today
      if (task.completed && task.completedAt) {
        const completedDate = new Date(task.completedAt);
        const completedStr = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}-${String(completedDate.getDate()).padStart(2, '0')}`;
        return completedStr === todayStr;
      }

      // Show incomplete tasks (they're working on them)
      return !task.completed;
    });

    // Group tasks by userId
    const tasksByUser = allFriendTasks.reduce(
      (acc, task) => {
        if (!acc[task.userId]) {
          acc[task.userId] = [];
        }
        acc[task.userId].push(task);
        return acc;
      },
      {} as Record<string, (typeof tasks)[0][]>
    );

    // Include ALL friends - those with tasks and those without (empty array)
    return friendUsers.map((friend) => [friend.id, tasksByUser[friend.id] || []] as [string, (typeof tasks)[0][]]);
  }, [uid, tasks, friendUsers]);

  // Apply saved friend order - friendEntriesOrdered is used for both summary bar and task cards
  const friendEntriesOrdered = useMemo(() => {
    if (friendEntries.length === 0) return [];
    const friendIds = friendEntries.map(([id]) => id);
    const orderedIds = mergeFriendOrder(friendIds, friendOrder);
    const entriesMap = new Map(friendEntries);
    return orderedIds
      .filter((id) => entriesMap.has(id))
      .map((id) => [id, entriesMap.get(id)!] as [string, typeof tasks]);
  }, [friendEntries, friendOrder]);

  // Load friend order from localStorage on mount
  useEffect(() => {
    setFriendOrder(loadFriendOrder());
  }, []);

  // Smart defaults: Expand first 2-3 friends by default (only on first load, not after manual interaction)
  useEffect(() => {
    if (!hasManuallyInteracted && expandedFriends.size === 0 && friendEntriesOrdered.length > 0) {
      const defaultExpanded = new Set<string>();
      const maxDefault = Math.min(3, friendEntriesOrdered.length);
      for (let i = 0; i < maxDefault; i++) {
        defaultExpanded.add(friendEntriesOrdered[i][0]);
      }
      setExpandedFriends(defaultExpanded);
    }
  }, [friendEntriesOrdered.length, expandedFriends.size, hasManuallyInteracted]);

  const handleToggleComplete = async (taskId: string, completed: boolean, dateStr?: string) => {
    const task = tasks.find((t) => t.id === taskId);
    await toggleComplete(taskId, completed, task, dateStr);
    // Update streak data after completing a task
    if (completed) {
      await updateStreakData();
    }
    // Mark first task completion as seen
    if (completed && !onboarding.state.hasSeenFirstTask) {
      onboarding.markFeatureSeen('hasSeenFirstTask');
    }
  };

  const handleDeferTask = (taskId: string, deferToDate: string | null) => {
    const task = tasks.find((t) => t.id === taskId);
    deferTask(taskId, deferToDate, task);
  };

  const handleAddTask = async (text: string, isPrivate: boolean, dueDate?: number | null, scheduledFor?: string | null, recurrence?: import('@/lib/types').Recurrence | null) => {
    const tags = activeTagFilters.length > 0 ? activeTagFilters.slice(0, 5) : undefined;
    await addTask(text, isPrivate, dueDate, scheduledFor, recurrence, tags);
    // Mark first task as seen
    if (!onboarding.state.hasSeenFirstTask) {
      onboarding.markFeatureSeen('hasSeenFirstTask');
    }
  };

  const handleShare = async () => {
    if (!data) return;
    await shareMyTasks({ userData: data, tasks });
  };

  // Notification functions
  const saveNotificationSettings = async (settings: NotificationSettingsType) => {
    if (!uid) return;
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, { notificationSettings: settings });
    } catch (error) {
      console.error('Error saving notification settings:', error);
    }
  };

  const addToastNotification = (notif: Omit<ToastNotification, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToastNotifications(prev => [...prev, { ...notif, id }]);
  };

  const dismissToastNotification = (id: string) => {
    setToastNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Schedule deadline reminders for tasks with due dates
  useEffect(() => {
    if (!uid || !data.notificationSettings || !notifications.isSupported) return;
    
    const settings = data.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS;
    if (!settings.enabled || !settings.deadlineReminders) return;

    const myTasks = tasks.filter(t => t.userId === uid && !t.completed && !t.deleted && t.dueDate);
    const timeoutIds: NodeJS.Timeout[] = [];

    myTasks.forEach(task => {
      if (!task.dueDate) return;
      
      const now = Date.now();
      const deadlineTime = task.dueDate;
      const reminderTime = deadlineTime - settings.deadlineMinutesBefore * 60 * 1000;

      if (reminderTime > now && reminderTime - now < 24 * 60 * 60 * 1000) { // Only schedule within next 24 hours
        const delay = reminderTime - now;
        const timeoutId = setTimeout(() => {
          addToastNotification({
            type: 'deadline',
            title: '⏰ Deadline Reminder',
            message: `"${task.text}" is due in ${settings.deadlineMinutesBefore} minutes!`,
            duration: 8000,
          });
          notifications.showNotification('⏰ Deadline Reminder', {
            body: `"${task.text}" is due in ${settings.deadlineMinutesBefore} minutes!`,
            tag: `deadline-${task.id}`,
            settings,
          });
        }, delay);
        timeoutIds.push(timeoutId);
      }
    });

    return () => timeoutIds.forEach(clearTimeout);
  }, [uid, tasks, data.notificationSettings, notifications]);

  // Schedule notifications for scheduled tasks (tasks scheduled for future date/time)
  useEffect(() => {
    if (!uid || !data.notificationSettings || !notifications.isSupported) return;
    
    const settings = data.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS;
    if (!settings.enabled) return;

    const todayStr = getTodayString();
    const myTasks = tasks.filter(t => {
      if (t.userId !== uid || t.completed || t.deleted || !t.deferredTo) return false;
      
      // Schedule notifications for tasks scheduled for today or future (with time)
      const deferredDate = t.deferredTo.includes('T') ? t.deferredTo.split('T')[0] : t.deferredTo;
      return (deferredDate >= todayStr) && t.deferredTo.includes('T');
    });

    const timeoutIds: NodeJS.Timeout[] = [];
    const reminderMinutesBefore = 15; // Notify 15 minutes before scheduled time

    myTasks.forEach(task => {
      if (!task.deferredTo || !task.deferredTo.includes('T')) return;
      
      try {
        const scheduledDateTime = new Date(task.deferredTo);
        const now = Date.now();
        const scheduledTime = scheduledDateTime.getTime();
        const reminderTime = scheduledTime - reminderMinutesBefore * 60 * 1000;

        // Only schedule if reminder time is in the future and within next 7 days
        if (reminderTime > now && scheduledTime - now < 7 * 24 * 60 * 60 * 1000) {
          const delay = reminderTime - now;
          const timeoutId = setTimeout(() => {
            const timeStr = scheduledDateTime.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            });
            addToastNotification({
              type: 'deadline',
              title: '📅 Scheduled Task Reminder',
              message: `"${task.text}" is scheduled for ${timeStr}`,
              duration: 8000,
            });
            notifications.showNotification('📅 Scheduled Task Reminder', {
              body: `"${task.text}" is scheduled for ${timeStr}`,
              tag: `scheduled-${task.id}`,
              settings,
            });
          }, delay);
          timeoutIds.push(timeoutId);
        }
      } catch (error) {
        console.error('Error scheduling notification for task:', task.id, error);
      }
    });

    return () => timeoutIds.forEach(clearTimeout);
  }, [uid, tasks, data.notificationSettings, notifications]);

  // Schedule noon check-in
  useEffect(() => {
    if (!uid || !data.notificationSettings || !notifications.isSupported || noonCheckScheduled) return;
    
    const settings = data.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS;
    if (!settings.enabled || !settings.noonCheckIn) return;

    const now = new Date();
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);

    // If it's past noon today, schedule for tomorrow
    if (now >= noon) {
      noon.setDate(noon.getDate() + 1);
    }

    const delay = noon.getTime() - now.getTime();
    
    const timeoutId = setTimeout(() => {
      const todayStr = getTodayString();
      const completedToday = tasks.filter(t => 
        t.userId === uid && 
        t.completed && 
        t.completedAt && 
        getDateString(t.completedAt) === todayStr
      ).length;

      if (completedToday === 0) {
        addToastNotification({
          type: 'noon-checkin',
          title: '☀️ Noon Check-In',
          message: "Hey! You haven't completed any tasks yet today. Let's make progress! 💪",
          duration: 10000,
        });
        notifications.showNotification('☀️ Noon Check-In', {
          body: "Hey! You haven't completed any tasks yet today. Let's make progress! 💪",
          tag: 'noon-checkin',
          settings,
        });
      } else {
        addToastNotification({
          type: 'success',
          title: '🎉 Great Progress!',
          message: `You've completed ${completedToday} task${completedToday !== 1 ? 's' : ''} today. Keep it up!`,
          duration: 8000,
        });
      }
      setNoonCheckScheduled(false); // Reset for next day
    }, delay);

    setNoonCheckScheduled(true);

    return () => clearTimeout(timeoutId);
  }, [uid, data.notificationSettings, noonCheckScheduled, notifications, tasks]);

  // Detect friend task completions (notify only on new completions)
  const previousFriendTasksRef = useRef<Map<string, boolean>>(new Map());
  useEffect(() => {
    if (!uid || !data.notificationSettings || !notifications.isSupported) return;
    
    const settings = data.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS;
    if (!settings.enabled || !settings.friendCompletions) return;

    // Check for newly completed friend tasks
    const friendTasks = tasks.filter(t => t.userId !== uid && !t.isPrivate);
    
    friendTasks.forEach(task => {
      const wasCompleted = previousFriendTasksRef.current.get(task.id);
      
      // If task is now completed and wasn't before, it's a new completion!
      if (task.completed && wasCompleted === false) {
        const friend = friendUsers.find(f => f.id === task.userId);
        if (friend) {
          addToastNotification({
            type: 'friend',
            title: `🎊 ${friend.displayName} completed a task!`,
            message: `"${task.text}" — Way to go!`,
            duration: 7000,
          });
          notifications.showNotification(`🎊 ${friend.displayName} completed a task!`, {
            body: `"${task.text}" — Way to go!`,
            tag: `friend-${task.id}`,
            settings,
          });
        }
      }
      
      // Update tracking
      previousFriendTasksRef.current.set(task.id, task.completed);
    });
  }, [uid, tasks, data.notificationSettings, notifications, friendUsers]);

  // Commitment reminders (check morning and evening)
  const [commitmentCheckScheduled, setCommitmentCheckScheduled] = useState<string | null>(null);
  useEffect(() => {
    if (!uid || !data.notificationSettings || !notifications.isSupported) return;
    
    const settings = data.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS;
    if (!settings.enabled || !settings.commitmentReminders) return;

    const committedTasks = tasks.filter(t => 
      t.userId === uid && 
      t.committed && 
      !t.completed && 
      !t.deleted &&
      shouldShowInTodayView(t, getTodayString())
    );

    if (committedTasks.length === 0) return;

    const now = new Date();
    const today = getTodayString();
    
    // Skip if we already checked today
    if (commitmentCheckScheduled === today) return;

    // Morning reminder: 9 AM
    const morningTime = new Date();
    morningTime.setHours(9, 0, 0, 0);
    
    // Evening reminder: 6 PM
    const eveningTime = new Date();
    eveningTime.setHours(18, 0, 0, 0);

    const scheduleReminder = (time: Date, period: string) => {
      if (time > now) {
        const delay = time.getTime() - now.getTime();
        setTimeout(() => {
          if (committedTasks.length > 0) {
            const taskList = committedTasks.map(t => t.text).join(', ');
            addToastNotification({
              type: 'commitment',
              title: '💪 Commitment Reminder',
              message: `You committed to: ${taskList}. Let's get it done!`,
              duration: 10000,
            });
            notifications.showNotification('💪 Commitment Reminder', {
              body: `You committed to: ${taskList}. Let's get it done!`,
              tag: `commitment-${period}`,
              settings,
            });
          }
          setCommitmentCheckScheduled(today);
        }, delay);
      }
    };

    scheduleReminder(morningTime, 'morning');
    scheduleReminder(eveningTime, 'evening');
  }, [uid, tasks, data.notificationSettings, notifications, commitmentCheckScheduled]);

  // Helper function to toggle friend expansion
  const toggleFriend = (friendId: string) => {
    // Mark that user has manually interacted
    setHasManuallyInteracted(true);

    // If "Show All" is active, toggle the collapsed set instead
    if (showAllFriends) {
      setCollapsedFriends(prev => {
        const newSet = new Set(prev);
        if (newSet.has(friendId)) {
          newSet.delete(friendId); // Remove from collapsed = expand it
        } else {
          newSet.add(friendId); // Add to collapsed = collapse it
        }
        return newSet;
      });
    } else {
      // Normal toggle when "Show All" is not active
      setExpandedFriends(prev => {
        const newSet = new Set(prev);
        if (newSet.has(friendId)) {
          newSet.delete(friendId); // Collapse
        } else {
          newSet.add(friendId); // Expand
        }
        return newSet;
      });
      // Also remove from collapsed set if it was there (cleanup)
      setCollapsedFriends(prev => {
        if (prev.has(friendId)) {
          const newSet = new Set(prev);
          newSet.delete(friendId);
          return newSet;
        }
        return prev;
      });
    }
  };

  // Scroll to friend when clicked in summary bar
  const handleFriendClick = (friendId: string) => {
    setActiveFriendId(friendId);
    // Expand if not already expanded (check both states)
    const isCurrentlyExpanded = showAllFriends 
      ? !collapsedFriends.has(friendId)
      : expandedFriends.has(friendId);
    
    const needsExpand = !isCurrentlyExpanded;
    if (needsExpand) {
      toggleFriend(friendId);
    }
    // Wait for layout to settle (longer when expanding), then scroll
    const delay = needsExpand ? 250 : 50;
    setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const element = document.getElementById(`friend-${friendId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
    }, delay);
  };

  // Show iOS installation prompt if needed (blocks access until installed)
  if (showIOSInstallPrompt && !isCheckingIOSInstall) {
    return (
      <IOSInstallPrompt 
        allowDismiss={false} 
        onFeedback={() => setShowBugReportModal(true)}
      />
    );
  }

  // Show Android installation prompt if needed (blocks access until installed)
  if (showAndroidInstallPrompt && !isCheckingAndroidInstall) {
    return (
      <AndroidInstallPrompt 
        allowDismiss={false} 
        onFeedback={() => setShowBugReportModal(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-[80px] md:pb-24 safe-area-inset-bottom transition-[background-color,color] duration-200 ease-out" style={{ paddingBottom: 'max(80px, env(safe-area-inset-bottom, 0px) + 80px)' }}>
      {/* Header */}
      <header className="bg-surface border-b border-border-emphasized sticky top-0 z-40 shadow-elevation-1 transition-[background-color,color,border-color] duration-200 ease-out" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 md:py-4" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
          <div className="flex items-center justify-between gap-2 min-h-[44px]">
            {/* Left: Logo + Nudge */}
            <button
              onClick={() => setShowQuickInfo(true)}
              className="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity flex-shrink-0 min-w-0"
              title="About & Updates"
            >
              <NudgeWordmark iconSize={28} />
            </button>

            {/* Center: Streak pill (compact) */}
            {data.streakData && (
              <button
                ref={streakButtonRef}
                onClick={() => {
                  setShowStreakCalendar(true);
                  if (!onboarding.state.hasSeenStreak) onboarding.markFeatureSeen('hasSeenStreak');
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs
                  bg-primary/5 border border-primary/10
                  hover:bg-primary/10 transition-colors flex-shrink-0"
                title="View streak calendar"
              >
                <LuFlame size={12} className="text-primary shrink-0" strokeWidth={1.5} />
                <span className="text-fg-secondary">
                  <span className="font-semibold text-primary" suppressHydrationWarning>{data.streakData.currentStreak}</span>
                  <span className="min-[376px]:inline hidden">{data.streakData.currentStreak === 1 ? ' day' : ' days'}</span>
                  <span className="max-[375px]:inline hidden">d</span>
                </span>
              </button>
            )}

            {/* Right: Notification bell + Profile avatar */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={() => setShowNotificationsPanel(true)}
                className="p-2 hover:bg-surface-muted rounded-full transition-colors relative flex-shrink-0 text-fg-secondary hover:text-fg-primary min-w-[36px] min-h-[36px] flex items-center justify-center"
                title={unreadNotifications > 0 ? `${unreadNotifications} unread notification${unreadNotifications !== 1 ? 's' : ''}` : 'Notifications'}
              >
                <FaBell className={unreadNotifications > 0 ? 'text-primary' : ''} size={18} />
                {unreadNotifications > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-error text-on-accent text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadNotifications > 99 ? '9+' : unreadNotifications}
                  </span>
                )}
              </button>
              <ProfileAvatarDropdown
                userPhotoURL={user?.photoURL ?? data.photoURL}
                userDisplayName={data.displayName}
                userEmail={user?.email ?? data.email}
                userId={uid}
                theme={theme}
                onThemeToggle={toggleTheme}
                onSettings={() => setShowSettingsMenu(true)}
                onSocial={() => {
                  setShowFriendsModal(true);
                  if (!onboarding.state.hasSeenFriends) onboarding.markFeatureSeen('hasSeenFriends');
                }}
                onLogout={signOut}
              />
            </div>
          </div>

          {/* Tag filter bar - sortable, only tags with tasks in today's view */}
          {(() => {
            const todayStr = getTodayString();
            const tasksInView = tasks.filter(
              (t) =>
                t.userId === uid &&
                t.deleted !== true &&
                t.tags?.length &&
                shouldShowInTodayView(t, todayStr)
            );
            const usedTags = Array.from(
              new Set(
                tasksInView.flatMap((t) => (t.tags || []).map(normalizeTagToIconId))
              )
            );
            if (usedTags.length === 0) return null;
            const orderedTags = mergeTagOrder(usedTags, tagOrder);
            return (
              <SortableTagBar
                tagIds={orderedTags}
                activeTagFilters={activeTagFilters}
                onTagClick={(tagId) => {
                  setActiveTagFilters((prev) =>
                    prev.includes(tagId) ? prev.filter((e) => e !== tagId) : [...prev, tagId]
                  );
                }}
                onAllClick={() => setActiveTagFilters([])}
                onReorder={setTagOrder}
              />
            );
          })()}
        </div>
      </header>

      {/* Task Feed */}
      <main className="max-w-3xl mx-auto px-4 py-6 transition-[background-color,color] duration-200 ease-out" style={{ paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))', paddingRight: 'max(16px, env(safe-area-inset-right, 0px))' }}>
        {!data ? (
          <div className="bg-warning-bg border border-warning-border rounded-lg p-6 text-center">
            <LuTriangleAlert className="text-warning mb-3" size={48} />
            <h3 className="text-lg font-semibold text-warning-text mb-2">
              Firestore Quota Exceeded
            </h3>
            <p className="text-warning-text text-sm mb-3 opacity-90">
              You've hit the daily Firebase quota limit. Your tasks are safe in the database.
            </p>
            <p className="text-warning-text text-xs opacity-80">
              Quota resets at midnight PT. Try again in a few hours, or upgrade your Firebase plan.
            </p>
          </div>
        ) : tasksLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-fg-secondary">Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="space-y-6">
            <EmptyState
              type="no-tasks"
              onAction={() => taskInputRef.current?.focus()}
              showTips={false}
            />
            {/* Notification Prompt for New Users */}
            {notifications.permission === 'default' && notifications.isSupported && (
              <div className="max-w-md mx-auto px-4">
                <NotificationPrompt
                  onEnable={notifications.requestPermission}
                  permission={notifications.permission}
                  isSupported={notifications.isSupported}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Your Tasks */}
            {(() => {
              const todayStr = getTodayString();
              
              // Filter tasks using smart rollover logic
              const myTasks = tasks.filter(task => {
                // Only show user's own tasks
                if (task.userId !== uid) return false;
                
                // Skip deleted tasks
                if (task.deleted === true) return false;
                
                // Apply daily focus view with smart rollover
                const shouldShow = shouldShowInTodayView(task, todayStr);
                
                // Debug logging removed - was causing console noise
                
                return shouldShow;
              }).sort((a, b) => {
                // Helper to get scheduled time from deferredTo
                const getScheduledTime = (task: typeof a) => {
                  if (!task.deferredTo || !task.deferredTo.includes('T')) return null;
                  try {
                    return new Date(task.deferredTo).getTime();
                  } catch {
                    return null;
                  }
                };
                
                const aScheduled = getScheduledTime(a);
                const bScheduled = getScheduledTime(b);
                
                // Priority 1: Tasks with due dates
                if (a.dueDate && b.dueDate) {
                  return a.dueDate - b.dueDate; // Earliest first
                } else if (a.dueDate && !b.dueDate) {
                  return -1; // Tasks with due date come first
                } else if (!a.dueDate && b.dueDate) {
                  return 1; // Tasks without due date come after
                }
                
                // Priority 2: Scheduled tasks (created today, scheduled for today or future)
                if (aScheduled && bScheduled) {
                  return aScheduled - bScheduled; // Earliest scheduled time first
                } else if (aScheduled && !bScheduled) {
                  return -1; // Scheduled tasks come before non-scheduled
                } else if (!aScheduled && bScheduled) {
                  return 1; // Non-scheduled come after scheduled
                }
                
                // Priority 3: Sort by order (for drag-and-drop)
                return (a.order || 0) - (b.order || 0);
              });
              
              // Debug logging removed

              // Apply tag filter (OR logic)
              const filteredTasks = activeTagFilters.length === 0
                ? myTasks
                : myTasks.filter((t) => activeTagFilters.some((filterId) => t.tags?.some((tag) => normalizeTagToIconId(tag) === filterId)));

              // Separate incomplete and completed tasks
              const incompleteTasks = filteredTasks.filter(t => !t.completed);
              const completedTasks = filteredTasks.filter(t => t.completed);

              const now = Date.now();
              const overdueTaskIds = new Set(
                incompleteTasks.filter((t) => t.dueDate && t.dueDate < now).map((t) => t.id)
              );

              // Group by tag: Inbox first, overdue categories higher, then by tagOrder
              const incompleteGroups = groupTasksByTag(incompleteTasks, tagOrder, overdueTaskIds);
              const completedGroups = groupTasksByTag(completedTasks, tagOrder);
              const flatIncomplete = incompleteGroups.flatMap((g) => g.tasks);
              
              if (myTasks.length === 0) return null;
              
              return (
                <div className="mb-6">
                  {/* Profile section - quiet header: avatar, name, task count */}
                  <button 
                    onClick={() => setShowProfileSettings(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-t-xl
                      bg-surface border border-border-subtle border-b-0
                      hover:bg-surface-muted transition-colors group"
                    title="Profile Settings"
                  >
                    <Avatar
                      photoURL={data.photoURL}
                      displayName={data.displayName}
                      size="md"
                    />
                    <div className="text-left flex-1 min-w-0">
                      <h2 className="text-lg font-semibold text-fg-primary group-hover:underline truncate leading-tight tracking-tight">{data.displayName || 'You'}</h2>
                      <p className="text-sm font-normal text-fg-secondary leading-normal">{myTasks.length} task{myTasks.length !== 1 ? 's' : ''}</p>
                    </div>
                  </button>
                  <div className="bg-surface rounded-b-xl shadow-elevation-2 p-4 space-y-2 border border-border-subtle border-t-0">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={flatIncomplete.map(t => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {incompleteGroups.map((group) => {
                          const key = sectionKey(group.tag);
                          const isCollapsed = collapsedSections.has(key);
                          const isInbox = group.tag === null;
                          const Icon = isInbox ? LuInbox : getIconForTag(group.tag!);
                          const label = isInbox ? 'Inbox' : getLabelForTag(group.tag!);
                          return (
                          <div key={key}>
                            <button
                              type="button"
                              onClick={() => toggleSectionCollapsed(key)}
                              className="w-full flex items-center gap-2 py-4 my-0 min-h-0"
                            >
                              <div className="flex-1 min-w-0 h-px bg-border-subtle" />
                              <div className="flex items-center gap-2 flex-shrink-0 px-2">
                                <Icon size={16} strokeWidth={1.5} className="text-fg-tertiary" />
                                <span className="text-[13px] text-fg-tertiary uppercase tracking-wider font-medium">
                                  {label}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0 h-px bg-border-subtle" />
                              <div className="flex items-center gap-1.5 flex-shrink-0 pl-2">
                                {isCollapsed && (
                                  <span className="text-[12px] text-fg-tertiary tabular-nums">
                                    {group.tasks.length}
                                  </span>
                                )}
                                <LuChevronDown
                                  size={12}
                                  className={`text-fg-tertiary transition-transform duration-200 ${
                                    isCollapsed ? '' : 'rotate-180'
                                  }`}
                                />
                              </div>
                            </button>
                            {!isCollapsed && (
                            <div className="space-y-2">
                            {group.tasks.map((task) => (
                          <SortableTaskItem
                            key={task.id}
                            task={task}
                            isOwnTask={true}
                            hideCategoryIcon={true}
                            onToggleComplete={handleToggleComplete}
                            onTogglePrivacy={togglePrivacy}
                            onUpdateTask={updateTask}
                            onUpdateDueDate={updateTaskDueDate}
                            onUpdateNotes={updateTaskNotes}
                            onToggleCommitment={toggleCommitment}
                            onToggleSkipRollover={toggleSkipRollover}
                            onDelete={deleteTask}
                            onAddReaction={addReaction}
                            onOpenComments={setSelectedTaskForComments}
                            onDeferTask={handleDeferTask}
                            onAddAttachment={addAttachment}
                            onDeleteAttachment={deleteAttachment}
                            onUpdateTaskTags={updateTaskTags}
                            recordRecentlyUsedTag={recordRecentlyUsedTag}
                            recentUsedTags={data.recentlyUsedTags || []}
                            onUpdateTaskSubtasks={updateTaskSubtasks}
                            onUpdateTaskRecurrence={updateTaskRecurrence}
                            userStorageUsed={data.storageUsed}
                            userStorageLimit={data.storageLimit}
                            currentUserId={uid}
                          />
                            ))}
                            </div>
                            )}
                          </div>
                          );
                        })}
                      </SortableContext>
                    </DndContext>
                    
                    {/* Completed tasks (not draggable) - grouped by tag */}
                    {completedGroups.map((group) => {
                      const key = `done-${sectionKey(group.tag)}`;
                      const isCollapsed = collapsedSections.has(key);
                      const isInbox = group.tag === null;
                      const Icon = isInbox ? LuInbox : getIconForTag(group.tag!);
                      const label = isInbox ? 'Inbox' : getLabelForTag(group.tag!);
                      return (
                      <div key={key}>
                        <button
                          type="button"
                          onClick={() => toggleSectionCollapsed(key)}
                          className="w-full flex items-center gap-2 py-4 my-0 min-h-0"
                        >
                          <div className="flex-1 min-w-0 h-px bg-border-subtle" />
                          <div className="flex items-center gap-2 flex-shrink-0 px-2">
                            <Icon size={16} strokeWidth={1.5} className="text-fg-tertiary" />
                            <span className="text-[13px] text-fg-tertiary uppercase tracking-wider font-medium">
                              {label}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 h-px bg-border-subtle" />
                          <div className="flex items-center gap-1.5 flex-shrink-0 pl-2">
                            {isCollapsed && (
                              <span className="text-[12px] text-fg-tertiary tabular-nums">
                                {group.tasks.length}
                              </span>
                            )}
                            <LuChevronDown
                              size={12}
                              className={`text-fg-tertiary transition-transform duration-200 ${
                                isCollapsed ? '' : 'rotate-180'
                              }`}
                            />
                          </div>
                        </button>
                        {!isCollapsed && (
                        <div className="space-y-2">
                        {group.tasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        isOwnTask={true}
                        hideCategoryIcon={true}
                        onToggleComplete={handleToggleComplete}
                        onTogglePrivacy={togglePrivacy}
                        onUpdateTask={updateTask}
                        onUpdateDueDate={updateTaskDueDate}
                        onUpdateNotes={updateTaskNotes}
                        onToggleCommitment={toggleCommitment}
                        onToggleSkipRollover={toggleSkipRollover}
                        onDelete={deleteTask}
                        onAddReaction={addReaction}
                        onOpenComments={setSelectedTaskForComments}
                        onDeferTask={handleDeferTask}
                        onAddAttachment={addAttachment}
                        onDeleteAttachment={deleteAttachment}
                        onUpdateTaskTags={updateTaskTags}
                        recordRecentlyUsedTag={recordRecentlyUsedTag}
                        recentUsedTags={data.recentlyUsedTags || []}
                        onUpdateTaskSubtasks={updateTaskSubtasks}
                        onUpdateTaskRecurrence={updateTaskRecurrence}
                        userStorageUsed={data.storageUsed}
                        userStorageLimit={data.storageLimit}
                        currentUserId={uid}
                      />
                        ))}
                        </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Friends' Tasks - Hybrid Approach */}
            {friendEntriesOrdered.length > 0 && (() => {
              // Create maps for friend photoURL and displayName (for friends with no tasks)
              const friendPhotoURLMap = new Map<string, string | undefined>();
              const friendDisplayNameMap = new Map<string, string>();
              friendUsers.forEach((friend) => {
                friendPhotoURLMap.set(friend.id, friend.photoURL);
                friendDisplayNameMap.set(friend.id, friend.displayName || 'Unknown');
              });

              // Prepare friend summaries for the bar (order matches friendEntriesOrdered)
              const friendSummaries = friendEntriesOrdered.map(([userId, userTasks]) => {
                const friendName = userTasks[0]?.userName || friendDisplayNameMap.get(userId) || 'Unknown';
                const publicTasks = userTasks.filter(t => !t.isPrivate);
                const privateTasks = userTasks.filter(t => t.isPrivate);
                const pendingCount = publicTasks.filter(t => !t.completed).length;
                const completedToday = userTasks.filter(t => t.completed).length;
                const privateTotal = privateTasks.length;
                const privateCompleted = privateTasks.filter(t => t.completed).length;
                
                const color = getAccentForId(userId);

                return {
                  id: userId,
                  name: friendName,
                  photoURL: friendPhotoURLMap.get(userId),
                  pendingCount,
                  completedToday,
                  privateTotal,
                  privateCompleted,
                  color,
                };
              });

              return (
                <>
                  {/* Friends Summary Bar - draggable to reorder */}
                  <SortableFriendsSummaryBar
                    friends={friendSummaries}
                    activeFriendId={activeFriendId}
                    onFriendClick={handleFriendClick}
                    onReorder={(newOrder) => {
                      saveFriendOrder(newOrder);
                      setFriendOrder(newOrder);
                    }}
                  />

                  {/* Friends' Task Cards - order matches summary bar */}
                  <div className="mb-6">
                    {friendEntriesOrdered.map(([userId, userTasks]) => {
                      const friendName = userTasks[0]?.userName || friendDisplayNameMap.get(userId) || 'Unknown';
                      const privateTasks = userTasks.filter(t => t.isPrivate);
                      const publicTasks = userTasks.filter(t => !t.isPrivate);
                      const privateTotal = privateTasks.length;
                      const privateCompleted = privateTasks.filter(t => t.completed).length;
                      
                      const color = getAccentForId(userId);

                      // If "Show All" is active, check if friend is NOT in collapsed set
                      // Otherwise, check if friend is in expanded set
                      const isExpanded = showAllFriends 
                        ? !collapsedFriends.has(userId)
                        : expandedFriends.has(userId);

                      return (
                        <div key={userId} id={`friend-${userId}`} className="scroll-mt-[140px] md:scroll-mt-[170px]">
                          <FriendTaskCard
                            friendId={userId}
                            friendName={friendName}
                            photoURL={friendPhotoURLMap.get(userId)}
                            tasks={userTasks}
                            tagOrder={tagOrder}
                            privateTotal={privateTotal}
                            privateCompleted={privateCompleted}
                            isExpanded={isExpanded}
                            onToggleExpand={() => toggleFriend(userId)}
                            color={color}
                            onToggleComplete={handleToggleComplete}
                            onTogglePrivacy={togglePrivacy}
                            onUpdateTask={updateTask}
                            onUpdateDueDate={updateTaskDueDate}
                            onUpdateNotes={updateTaskNotes}
                            onToggleCommitment={toggleCommitment}
                            onToggleSkipRollover={toggleSkipRollover}
                            onDelete={deleteTask}
                            onAddReaction={addReaction}
                            onOpenComments={setSelectedTaskForComments}
                            onDeferTask={handleDeferTask}
                            onAddAttachment={addAttachment}
                            onDeleteAttachment={deleteAttachment}
                            onSendEncouragement={sendEncouragement}
                            currentUserId={uid}
                          />
                        </div>
                      );
                    })}

                    {/* Show All / Collapse All Button */}
                    {friendEntriesOrdered.length > 3 && (
                      <div className="flex justify-center mt-4">
                        <button
                          onClick={() => {
                            if (showAllFriends) {
                              setShowAllFriends(false);
                              // Restore default expanded state
                              const defaultExpanded = new Set<string>();
                              const maxDefault = Math.min(3, friendEntriesOrdered.length);
                              for (let i = 0; i < maxDefault; i++) {
                                defaultExpanded.add(friendEntriesOrdered[i][0]);
                              }
                              setExpandedFriends(defaultExpanded);
                              // Clear collapsed set when turning off "Show All"
                              setCollapsedFriends(new Set());
                            } else {
                              setShowAllFriends(true);
                              // Expand all (clear collapsed set)
                              setCollapsedFriends(new Set());
                            }
                            setActiveFriendId(null);
                          }}
                          className="px-4 py-2 bg-surface-muted text-fg-primary rounded-lg font-medium hover:bg-elevated transition-colors text-sm"
                        >
                          {showAllFriends ? 'Collapse All' : `Show All (${friendEntriesOrdered.length} friends)`}
                        </button>
                      </div>
                    )}
        </div>
                </>
              );
            })()}

          </>
        )}
      </main>

      {/* Task Input (Fixed at Bottom) */}
      <div className="relative">
        <TaskInput 
          onAddTask={handleAddTask} 
          disabled={tasksLoading}
          inputRef={taskInputRef}
          recentTasks={
            tasks
              .filter(t => t.userId === uid && t.completed)
              .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
              .slice(0, 10)
              .map(t => t.text)
          }
        />
      </div>

      {/* Friends Modal */}
      {showFriendsModal && (
        <FriendsModal onClose={() => setShowFriendsModal(false)} />
      )}

      {/* Streak Calendar Modal */}
      {showStreakCalendar && data.streakData && (
        <StreakCalendar 
          streakData={data.streakData}
          tasks={tasks.filter(t => t.userId === uid)}
          currentUserId={uid}
          onClose={() => setShowStreakCalendar(false)}
          onToggleComplete={handleToggleComplete}
          onTogglePrivacy={togglePrivacy}
          onUpdateTask={updateTask}
          onUpdateDueDate={updateTaskDueDate}
          onUpdateNotes={updateTaskNotes}
          onDelete={deleteTask}
          onAddReaction={addReaction}
          onOpenComments={setSelectedTaskForComments}
          onDeferTask={handleDeferTask}
          onUpdateTaskRecurrence={updateTaskRecurrence}
        />
      )}

      {/* Recycle Bin Modal */}
      <RecycleBin
        isOpen={showRecycleBin}
        onClose={() => setShowRecycleBin(false)}
        onRestore={async (taskId) => {
          await restoreTask(taskId);
          // Refresh deleted count
          const deletedTasks = await getDeletedTasks();
          setDeletedCount(deletedTasks.length);
        }}
        onPermanentDelete={async (taskId) => {
          await permanentlyDeleteTask(taskId);
          // Refresh deleted count
          const deletedTasks = await getDeletedTasks();
          setDeletedCount(deletedTasks.length);
        }}
        onPermanentDeleteAll={async () => {
          await permanentlyDeleteAllTasks();
          const deletedTasks = await getDeletedTasks();
          setDeletedCount(deletedTasks.length);
        }}
        getDeletedTasks={getDeletedTasks}
      />

      {/* Comments Modal */}
      {selectedTaskForComments && (() => {
        const selectedTask = tasks.find(t => t.id === selectedTaskForComments);
        if (!selectedTask) {
          return null;
        }
        
        return (
          <CommentsModal
            key={`comments-${selectedTask.id}`}
            isOpen={true}
            task={selectedTask}
            currentUserId={uid}
            currentUserName={data.displayName}
            onClose={() => setSelectedTaskForComments(null)}
            onAddComment={addComment}
            onAddCommentReaction={addCommentReaction}
            onEditComment={editComment}
            onDeleteComment={deleteComment}
          />
        );
      })()}

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />

      {/* Bug Report Modal */}
      <BugReportModal
        isOpen={showBugReportModal}
        onClose={() => setShowBugReportModal(false)}
        userId={uid}
        userName={data.displayName || 'Unknown User'}
        userEmail={data.email || ''}
      />

      {/* Notifications Panel */}
      <NotificationsPanel
        isOpen={showNotificationsPanel}
        onClose={() => setShowNotificationsPanel(false)}
        userId={uid}
        onTaskClick={(taskId) => {
          setSelectedTaskForComments(taskId);
        }}
        friendPhotoMap={Object.fromEntries(
          (friendUsers || []).map((f) => [f.id, f.photoURL]).filter(([, v]) => v) as [string, string][]
        )}
      />

      {/* Quick Info Modal */}
      <QuickInfoModal
        isOpen={showQuickInfo}
        onClose={() => setShowQuickInfo(false)}
      />


      {/* Profile Settings Modal */}
      {data && (
        <ProfileSettings
          isOpen={showProfileSettings}
          onClose={() => setShowProfileSettings(false)}
          currentUser={data}
          onUpdateUser={(updatedData) => {
            // The userData will be updated automatically via Firestore listener
            if (updatedData.photoURL !== undefined) {
              setShowProfileSettings(false);
            }
          }}
        />
      )}

      {/* Settings Menu Modal (opened from profile dropdown) */}
      <SettingsMenu
        isOpen={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
        onNotificationSettings={() => setShowNotificationSettings(true)}
        onHelp={() => setShowHelpModal(true)}
        onRecycleBin={() => setShowRecycleBin(true)}
        onAdmin={data.isAdmin ? () => router.push('/admin') : undefined}
        onWhatsAppShare={handleShare}
        onFeedback={() => setShowBugReportModal(true)}
        deletedCount={deletedCount}
        isAdmin={data.isAdmin || false}
        notificationPermission={notifications.permission}
        userId={uid}
        storageUsed={userStorageUsage}
        storageLimit={data.storageLimit}
      />

      {/* Notification Settings Modal */}
      <NotificationSettings
        isOpen={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
        settings={data.notificationSettings || DEFAULT_NOTIFICATION_SETTINGS}
        onSave={saveNotificationSettings}
        onRequestPermission={notifications.requestPermission}
        permission={notifications.permission}
      />

      {/* Toast Notifications */}
      <NotificationToast
        notifications={toastNotifications}
        onDismiss={dismissToastNotification}
      />
    </div>
  );
}
