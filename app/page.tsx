'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTasks } from '@/hooks/useTasks';
import AuthModal from '@/components/AuthModal';
import PendingApproval from '@/components/PendingApproval';
import TaskInput from '@/components/TaskInput';
import TaskItem from '@/components/TaskItem';
import SortableTaskItem from '@/components/SortableTaskItem';
import FriendsModal from '@/components/FriendsModal';
import FriendTaskCard from '@/components/FriendTaskCard';
import FriendsSummaryBar from '@/components/FriendsSummaryBar';
import StreakCalendar from '@/components/StreakCalendar';
import RecycleBin from '@/components/RecycleBin';
import CommentsModal from '@/components/CommentsModal';
import { FaUsers, FaSignOutAlt, FaFire, FaCalendarAlt, FaMoon, FaSun, FaTrash, FaWhatsapp, FaShieldAlt, FaQuestionCircle } from 'react-icons/fa';
import EmptyState from '@/components/EmptyState';
import HelpModal from '@/components/HelpModal';
import ContextualTooltip from '@/components/ContextualTooltip';
import FeatureBadge from '@/components/FeatureBadge';
import { useOnboarding } from '@/hooks/useOnboarding';
import { TIPS, FEATURE_BADGES } from '@/lib/tips';
import { useRouter } from 'next/navigation';
import { shareMyTasks } from '@/utils/share';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, MouseSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { shouldShowInTodayView, countRolledOverTasks, getTodayString, getDateString } from '@/utils/taskFilter';

export default function Home() {
  const { user, userData, isWhitelisted, loading: authLoading, signOut, updateStreakData } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const { tasks, loading: tasksLoading, addTask, updateTask, updateTaskDueDate, updateTaskNotes, toggleComplete, togglePrivacy, toggleCommitment, toggleSkipRollover, deleteTask, restoreTask, permanentlyDeleteTask, getDeletedTasks, addReaction, addComment, deferTask, reorderTasks } = useTasks();
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showStreakCalendar, setShowStreakCalendar] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [selectedTaskForComments, setSelectedTaskForComments] = useState<string | null>(null);
  const [dismissedRolloverNotice, setDismissedRolloverNotice] = useState(false);
  const [lastNoticeDate, setLastNoticeDate] = useState<string | null>(null);
  const [expandedFriends, setExpandedFriends] = useState<Set<string>>(new Set());
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [collapsedFriends, setCollapsedFriends] = useState<Set<string>>(new Set()); // Track explicitly collapsed friends
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [tooltipTarget, setTooltipTarget] = useState<React.RefObject<HTMLElement> | null>(null);
  
  const onboarding = useOnboarding();
  
  // Refs for tooltip targets
  const taskInputRef = useRef<HTMLInputElement>(null);
  const friendsButtonRef = useRef<HTMLButtonElement>(null);
  const streakButtonRef = useRef<HTMLButtonElement>(null);

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
    
    // Get only incomplete tasks for reordering
    const myIncompleteTasks = tasks.filter(task => {
      if (task.userId !== user?.uid) return false;
      if (task.deferredTo && task.deferredTo > todayStr) return false;
      return !task.completed;
    }).sort((a, b) => (a.order || 0) - (b.order || 0));

    const oldIndex = myIncompleteTasks.findIndex(t => t.id === active.id);
    const newIndex = myIncompleteTasks.findIndex(t => t.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reorderedTasks = arrayMove(myIncompleteTasks, oldIndex, newIndex);

    // Update orders in Firestore
    const updates = reorderedTasks.map((task, index) => 
      reorderTasks(task.id, index)
    );

    await Promise.all(updates);
  };

  // Update streak data when component mounts or user changes
  useEffect(() => {
    if (user?.uid && userData?.id) {
      updateStreakData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, userData?.id]); // Only depend on IDs, not entire objects or functions

  // Update deleted tasks count
  useEffect(() => {
    if (user?.uid) {
      getDeletedTasks().then(tasks => setDeletedCount(tasks.length));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, tasks.length]); // Only depend on user ID and task count, not entire tasks array

  // Calculate friend entries for friends' tasks section
  const friendEntries = useMemo(() => {
    if (!user?.uid) return [];
    
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Get all friend tasks (both private and public)
    const allFriendTasks = tasks.filter(task => {
      if (task.userId === user.uid) return false;
      if (task.deleted === true) return false;
      
      // For friends' tasks, only show completed tasks from today
      // (we want to see what they accomplished today!)
      if (task.completed && task.completedAt) {
        const completedDate = new Date(task.completedAt);
        const completedStr = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}-${String(completedDate.getDate()).padStart(2, '0')}`;
        return completedStr === todayStr;
      }
      
      // Show incomplete tasks (they're working on them)
      return !task.completed;
    });
    
    if (allFriendTasks.length === 0) return [];

    // Group tasks by userId
    const tasksByUser = allFriendTasks.reduce((acc, task) => {
      if (!acc[task.userId]) {
        acc[task.userId] = [];
      }
      acc[task.userId].push(task);
      return acc;
    }, {} as Record<string, typeof tasks>);

    return Object.entries(tasksByUser);
  }, [user?.uid, tasks]);

  // Smart defaults: Expand first 2-3 friends by default (only on first load)
  useEffect(() => {
    if (expandedFriends.size === 0 && friendEntries.length > 0) {
      const defaultExpanded = new Set<string>();
      const maxDefault = Math.min(3, friendEntries.length);
      for (let i = 0; i < maxDefault; i++) {
        defaultExpanded.add(friendEntries[i][0]);
      }
      setExpandedFriends(defaultExpanded);
    }
  }, [friendEntries.length, expandedFriends.size]);

  const handleToggleComplete = async (taskId: string, completed: boolean) => {
    await toggleComplete(taskId, completed);
    // Update streak data after completing a task
    if (completed) {
      await updateStreakData();
    }
    // Mark first task completion as seen
    if (completed && !onboarding.state.hasSeenFirstTask) {
      onboarding.markFeatureSeen('hasSeenFirstTask');
    }
  };

  const handleAddTask = async (text: string, isPrivate: boolean, dueDate?: number | null) => {
    await addTask(text, isPrivate, dueDate);
    // Mark first task as seen
    if (!onboarding.state.hasSeenFirstTask) {
      onboarding.markFeatureSeen('hasSeenFirstTask');
    }
  };

  const handleShare = async () => {
    if (!userData) return;
    await shareMyTasks({ userData, tasks });
  };

  // Helper function to toggle friend expansion
  const toggleFriend = (friendId: string) => {
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
          newSet.delete(friendId);
        } else {
          newSet.add(friendId);
        }
        return newSet;
      });
    }
  };

  // Scroll to friend when clicked in summary bar
  const handleFriendClick = (friendId: string) => {
    setActiveFriendId(friendId);
    // Expand if not already expanded
    if (!expandedFriends.has(friendId)) {
      toggleFriend(friendId);
    }
    // Scroll to friend card
    setTimeout(() => {
      const element = document.getElementById(`friend-${friendId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !userData) {
    return <AuthModal />;
  }

  // Show pending approval screen if user is not whitelisted
  if (isWhitelisted === false) {
    return <PendingApproval />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 md:pb-24 safe-area-inset-bottom">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {/* App Icon/Logo */}
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg width="20" height="20" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" className="text-white">
                  <path d="M140 250 L220 330 L380 170" stroke="currentColor" strokeWidth="40" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white">GetDone</h1>
                <p className="text-xs md:text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>Welcome, {userData.displayName}!</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHelpModal(true)}
                className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 p-3 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors relative"
                title="Help & Tips"
              >
                <FaQuestionCircle size={18} />
              </button>

              <button
                onClick={toggleTheme}
                className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 p-3 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              >
                {theme === 'dark' ? <FaSun size={18} /> : <FaMoon size={18} />}
              </button>

              <button
                onClick={handleShare}
                className="bg-green-500 dark:bg-green-600 text-white p-3 rounded-full hover:bg-green-600 dark:hover:bg-green-700 transition-colors"
                title="Share on WhatsApp"
              >
                <FaWhatsapp size={18} />
              </button>

              <button
                ref={friendsButtonRef}
                onClick={() => {
                  setShowFriendsModal(true);
                  if (!onboarding.state.hasSeenFriends) {
                    onboarding.markFeatureSeen('hasSeenFriends');
                  }
                }}
                className="relative bg-blue-600 dark:bg-blue-500 text-white p-3 rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                title="Manage Friends"
              >
                <FaUsers size={18} />
                {onboarding.shouldShowBadge('friends-badge', !onboarding.state.hasSeenFriends && (userData?.friends?.length || 0) === 0) && (
                  <FeatureBadge
                    id="friends-badge"
                    label={FEATURE_BADGES.FRIENDS.label}
                    show={true}
                    onDismiss={() => onboarding.dismissFeatureBadge('friends-badge')}
                  />
                )}
              </button>

              <button
                onClick={() => setShowRecycleBin(true)}
                className="relative bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 p-3 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                title="Recycle Bin"
              >
                <FaTrash size={18} />
                {deletedCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {deletedCount > 9 ? '9+' : deletedCount}
                  </span>
                )}
              </button>

              {userData?.isAdmin && (
                <button
                  onClick={() => router.push('/admin')}
                  className="bg-purple-600 dark:bg-purple-500 text-white p-3 rounded-full hover:bg-purple-700 dark:hover:bg-purple-600 transition-colors"
                  title="Admin Dashboard"
                >
                  <FaShieldAlt size={18} />
                </button>
              )}
              
              <button
                onClick={signOut}
                className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 p-3 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                title="Sign Out"
              >
                <FaSignOutAlt size={18} />
              </button>
            </div>
          </div>

          {/* Streak Display */}
          {userData.streakData && (
            <div className="flex items-center gap-3">
              <button
                ref={streakButtonRef}
                onClick={() => {
                  setShowStreakCalendar(true);
                  if (!onboarding.state.hasSeenStreak) {
                    onboarding.markFeatureSeen('hasSeenStreak');
                  }
                }}
                className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl px-4 py-3 flex items-center justify-between hover:from-orange-600 hover:to-orange-700 transition-all shadow-md relative"
              >
                <div className="flex items-center gap-2">
                  <FaFire size={20} />
                  <div className="text-left">
                    <div className="text-2xl font-bold" suppressHydrationWarning>{userData.streakData.currentStreak}</div>
                    <div className="text-xs opacity-90">Day Streak</div>
                  </div>
                </div>
                <FaCalendarAlt size={16} className="opacity-75" />
                {onboarding.shouldShowBadge('streak-badge', !onboarding.state.hasSeenStreak && userData.streakData.currentStreak === 0) && (
                  <FeatureBadge
                    id="streak-badge"
                    label={FEATURE_BADGES.STREAK.label}
                    show={true}
                    onDismiss={() => onboarding.dismissFeatureBadge('streak-badge')}
                  />
                )}
              </button>
              
              <div className="bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl px-4 py-3 shadow-md">
                <div className="text-2xl font-bold text-center" suppressHydrationWarning>{userData.streakData.longestStreak}</div>
                <div className="text-xs opacity-90 text-center">Best</div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Task Feed */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {!userData ? (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="text-lg font-semibold text-yellow-900 dark:text-yellow-200 mb-2">
              Firestore Quota Exceeded
            </h3>
            <p className="text-yellow-800 dark:text-yellow-300 text-sm mb-3">
              You've hit the daily Firebase quota limit. Your tasks are safe in the database.
            </p>
            <p className="text-yellow-700 dark:text-yellow-400 text-xs">
              Quota resets at midnight PT. Try again in a few hours, or upgrade your Firebase plan.
            </p>
          </div>
        ) : tasksLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            type="no-tasks"
            onAction={() => taskInputRef.current?.focus()}
            showTips={true}
          />
        ) : (
          <>
            {/* Your Tasks */}
            {(() => {
              const todayStr = getTodayString();
              
              // Filter tasks using smart rollover logic
              const myTasks = tasks.filter(task => {
                // Only show user's own tasks
                if (task.userId !== user.uid) return false;
                
                // Skip deleted tasks
                if (task.deleted === true) return false;
                
                // Apply daily focus view with smart rollover
                const shouldShow = shouldShowInTodayView(task, todayStr);
                
                // Debug logging removed - was causing console noise
                
                return shouldShow;
              }).sort((a, b) => {
                // Sort by due date: tasks with due dates first, then by due date (earliest first)
                // Overdue tasks come first, then tasks due soon, then no due date
                if (a.dueDate && b.dueDate) {
                  return a.dueDate - b.dueDate; // Earliest first
                } else if (a.dueDate && !b.dueDate) {
                  return -1; // Tasks with due date come first
                } else if (!a.dueDate && b.dueDate) {
                  return 1; // Tasks without due date come after
                } else {
                  // Both have no due date, sort by order (for drag-and-drop)
                  return (a.order || 0) - (b.order || 0);
                }
              });
              
              // Debug logging removed

              // Separate incomplete and completed tasks
              const incompleteTasks = myTasks.filter(t => !t.completed);
              const completedTasks = myTasks.filter(t => t.completed);
              
              if (myTasks.length === 0) return null;
              
              return (
                <div className="mb-6">
                  <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-t-xl px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                        {userData.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h2 className="text-white font-semibold">You</h2>
                        <p className="text-blue-100 text-sm">{myTasks.length} task{myTasks.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-b-xl shadow-md p-4 space-y-3">
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={incompleteTasks.map(t => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {incompleteTasks.map((task) => (
                          <SortableTaskItem
                            key={task.id}
                            task={task}
                            isOwnTask={true}
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
                            onDeferTask={deferTask}
                            currentUserId={user.uid}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                    
                    {/* Completed tasks (not draggable) */}
                    {completedTasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        isOwnTask={true}
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
                        onDeferTask={deferTask}
                        currentUserId={user.uid}
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Friends' Tasks - Hybrid Approach */}
            {friendEntries.length > 0 && (() => {
              
              const colors = [
                { from: 'from-green-500', to: 'to-green-600', text: 'text-green-600' },
                { from: 'from-purple-500', to: 'to-purple-600', text: 'text-purple-600' },
                { from: 'from-pink-500', to: 'to-pink-600', text: 'text-pink-600' },
                { from: 'from-indigo-500', to: 'to-indigo-600', text: 'text-indigo-600' },
                { from: 'from-orange-500', to: 'to-orange-600', text: 'text-orange-600' },
                { from: 'from-teal-500', to: 'to-teal-600', text: 'text-teal-600' },
                { from: 'from-cyan-500', to: 'to-cyan-600', text: 'text-cyan-600' },
                { from: 'from-amber-500', to: 'to-amber-600', text: 'text-amber-600' },
              ];

              // Prepare friend summaries for the bar
              const friendSummaries = friendEntries.map(([userId, userTasks]) => {
                const friendName = userTasks[0]?.userName || 'Unknown';
                const publicTasks = userTasks.filter(t => !t.isPrivate);
                const privateTasks = userTasks.filter(t => t.isPrivate);
                const pendingCount = publicTasks.filter(t => !t.completed).length;
                const completedToday = userTasks.filter(t => t.completed).length;
                const privateTotal = privateTasks.length;
                const privateCompleted = privateTasks.filter(t => t.completed).length;
                
                const colorIndex = userId 
                  ? (userId.charCodeAt(0) + (userId.length > 1 ? userId.charCodeAt(userId.length - 1) : 0)) % colors.length
                  : 0;
                const color = colors[colorIndex] || colors[0];

                return {
                  id: userId,
                  name: friendName,
                  pendingCount,
                  completedToday,
                  privateTotal,
                  privateCompleted,
                  color,
                };
              });

              return (
                <>
                  {/* Friends Summary Bar */}
                  <FriendsSummaryBar
                    friends={friendSummaries}
                    activeFriendId={activeFriendId}
                    onFriendClick={handleFriendClick}
                  />

                  {/* Friends' Task Cards */}
                  <div className="mb-6">
                    {friendEntries.map(([userId, userTasks]) => {
                      const friendName = userTasks[0]?.userName || 'Unknown';
                      const privateTasks = userTasks.filter(t => t.isPrivate);
                      const publicTasks = userTasks.filter(t => !t.isPrivate);
                      const privateTotal = privateTasks.length;
                      const privateCompleted = privateTasks.filter(t => t.completed).length;
                      
                      const colorIndex = userId 
                        ? (userId.charCodeAt(0) + (userId.length > 1 ? userId.charCodeAt(userId.length - 1) : 0)) % colors.length
                        : 0;
                      const color = colors[colorIndex] || colors[0];

                      // If "Show All" is active, check if friend is NOT in collapsed set
                      // Otherwise, check if friend is in expanded set
                      const isExpanded = showAllFriends 
                        ? !collapsedFriends.has(userId)
                        : expandedFriends.has(userId);

                      return (
                        <div key={userId} id={`friend-${userId}`}>
                          <FriendTaskCard
                            friendId={userId}
                            friendName={friendName}
                            tasks={userTasks}
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
                            onDeferTask={deferTask}
                            currentUserId={user.uid}
                          />
                        </div>
                      );
                    })}

                    {/* Show All / Collapse All Button */}
                    {friendEntries.length > 3 && (
                      <div className="flex justify-center mt-4">
                        <button
                          onClick={() => {
                            if (showAllFriends) {
                              setShowAllFriends(false);
                              // Restore default expanded state
                              const defaultExpanded = new Set<string>();
                              const maxDefault = Math.min(3, friendEntries.length);
                              for (let i = 0; i < maxDefault; i++) {
                                defaultExpanded.add(friendEntries[i][0]);
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
                          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
                        >
                          {showAllFriends ? 'Collapse All' : `Show All (${friendEntries.length} friends)`}
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
              .filter(t => t.userId === user?.uid && t.completed)
              .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
              .slice(0, 10)
              .map(t => t.text)
          }
        />
        {/* First task tip below input - Mobile only (hidden on desktop) */}
        {onboarding.isLoaded && onboarding.shouldShowTip('first-task', !onboarding.state.hasSeenFirstTask && tasks.length === 0) && (
          <div className="md:hidden absolute -top-12 left-1/2 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
            <div className="bg-gray-900 dark:bg-gray-800 text-white rounded-lg shadow-xl p-2 px-3 text-xs max-w-[200px] text-center relative">
              {TIPS.FIRST_TASK.message}
              <button
                onClick={() => onboarding.dismissTip('first-task')}
                className="ml-2 text-white/70 hover:text-white"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-4 border-t-gray-900 dark:border-t-gray-800" />
          </div>
        )}
      </div>

      {/* Friends Modal */}
      {showFriendsModal && (
        <FriendsModal onClose={() => setShowFriendsModal(false)} />
      )}

      {/* Streak Calendar Modal */}
      {showStreakCalendar && userData.streakData && (
        <StreakCalendar 
          streakData={userData.streakData}
          tasks={tasks.filter(t => t.userId === user.uid)}
          currentUserId={user.uid}
          onClose={() => setShowStreakCalendar(false)}
          onToggleComplete={handleToggleComplete}
          onTogglePrivacy={togglePrivacy}
          onUpdateTask={updateTask}
          onUpdateDueDate={updateTaskDueDate}
          onUpdateNotes={updateTaskNotes}
          onDelete={deleteTask}
          onAddReaction={addReaction}
          onOpenComments={setSelectedTaskForComments}
          onDeferTask={deferTask}
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
        getDeletedTasks={getDeletedTasks}
      />

      {/* Comments Modal */}
      {selectedTaskForComments && (() => {
        const selectedTask = tasks.find(t => t.id === selectedTaskForComments);
        if (!selectedTask) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Home] Task not found for comments:', selectedTaskForComments);
        }
        return null;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[Home] Rendering CommentsModal for task:', selectedTask.id, 'Comments:', selectedTask.comments?.length || 0);
      }
        
        return (
          <CommentsModal
            key={`comments-${selectedTask.id}-${selectedTask.comments?.length || 0}`}
            isOpen={true}
            task={selectedTask}
            currentUserId={user.uid}
            currentUserName={userData.displayName}
            onClose={() => setSelectedTaskForComments(null)}
            onAddComment={addComment}
          />
        );
      })()}

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
      />

      {/* Contextual Tooltips - Mobile only (desktop has help button) */}
      {onboarding.isLoaded && onboarding.shouldShowTip('friends', !onboarding.state.hasSeenFriends && (userData?.friends?.length || 0) === 0) && friendsButtonRef.current && (
        <ContextualTooltip
          id="friends"
          message={TIPS.FRIENDS.message}
          position={TIPS.FRIENDS.position as any}
          targetRef={friendsButtonRef}
          show={true}
          mobileOnly={true}
          onDismiss={() => {
            onboarding.dismissTip('friends');
            setActiveTooltip(null);
          }}
        />
      )}

      {onboarding.isLoaded && onboarding.shouldShowTip('streak', !onboarding.state.hasSeenStreak && (userData?.streakData?.currentStreak || 0) === 0) && streakButtonRef.current && (
        <ContextualTooltip
          id="streak"
          message={TIPS.STREAK.message}
          position={TIPS.STREAK.position as any}
          targetRef={streakButtonRef}
          show={true}
          mobileOnly={true}
          onDismiss={() => {
            onboarding.dismissTip('streak');
            setActiveTooltip(null);
          }}
        />
      )}
    </div>
  );
}
