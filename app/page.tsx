'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTasks } from '@/hooks/useTasks';
import AuthModal from '@/components/AuthModal';
import TaskInput from '@/components/TaskInput';
import TaskItem from '@/components/TaskItem';
import SortableTaskItem from '@/components/SortableTaskItem';
import FriendsModal from '@/components/FriendsModal';
import StreakCalendar from '@/components/StreakCalendar';
import RecycleBin from '@/components/RecycleBin';
import CommentsModal from '@/components/CommentsModal';
import { FaUsers, FaSignOutAlt, FaFire, FaCalendarAlt, FaMoon, FaSun, FaTrash, FaWhatsapp } from 'react-icons/fa';
import { shareMyTasks } from '@/utils/share';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, MouseSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';

export default function Home() {
  const { user, userData, loading: authLoading, signOut, updateStreakData } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { tasks, loading: tasksLoading, addTask, toggleComplete, togglePrivacy, toggleCommitment, deleteTask, restoreTask, permanentlyDeleteTask, getDeletedTasks, addReaction, addComment, deferTask, reorderTasks } = useTasks();
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [showStreakCalendar, setShowStreakCalendar] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [deletedCount, setDeletedCount] = useState(0);
  const [selectedTaskForComments, setSelectedTaskForComments] = useState<string | null>(null);

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

  // Update streak data when component mounts
  useEffect(() => {
    if (user && userData) {
      updateStreakData();
    }
  }, [user, userData, updateStreakData]);

  // Update deleted tasks count
  useEffect(() => {
    if (user) {
      getDeletedTasks().then(tasks => setDeletedCount(tasks.length));
    }
  }, [user, tasks]); // Re-check when tasks change

  const handleToggleComplete = async (taskId: string, completed: boolean) => {
    await toggleComplete(taskId, completed);
    // Update streak data after completing a task
    if (completed) {
      await updateStreakData();
    }
  };

  const handleShare = async () => {
    if (!userData) return;
    await shareMyTasks({ userData, tasks });
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-24">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Task Accountability</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>Welcome, {userData.displayName}!</p>
            </div>
            
            <div className="flex items-center gap-2">
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
                onClick={() => setShowFriendsModal(true)}
                className="relative bg-blue-600 dark:bg-blue-500 text-white p-3 rounded-full hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                title="Manage Friends"
              >
                <FaUsers size={18} />
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
                onClick={() => setShowStreakCalendar(true)}
                className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl px-4 py-3 flex items-center justify-between hover:from-orange-600 hover:to-orange-700 transition-all shadow-md"
              >
                <div className="flex items-center gap-2">
                  <FaFire size={20} />
                  <div className="text-left">
                    <div className="text-2xl font-bold" suppressHydrationWarning>{userData.streakData.currentStreak}</div>
                    <div className="text-xs opacity-90">Day Streak</div>
                  </div>
                </div>
                <FaCalendarAlt size={16} className="opacity-75" />
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
        {tasksLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-gray-600">Loading tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-2">No tasks yet!</p>
            <p className="text-gray-500 text-sm">Add your first task below to get started.</p>
          </div>
        ) : (
          <>
            {/* Your Tasks */}
            {(() => {
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              
              console.log('[Home] Filtering tasks for display, total tasks:', tasks.length, 'todayStr:', todayStr);
              
              const myTasks = tasks.filter(task => {
                if (task.userId !== user.uid) {
                  console.log('[Home] Task filtered out (not my task):', task.id.substring(0, 8));
                  return false;
                }
                
                console.log('[Home] My task:', task.id.substring(0, 8), 'deferredTo:', task.deferredTo, 'completed:', task.completed);
                
                // Hide deferred tasks that are deferred to a future date
                if (task.deferredTo && task.deferredTo > todayStr) {
                  console.log('[Home] Task filtered out (deferred to future):', task.id.substring(0, 8), 'deferredTo:', task.deferredTo, '> todayStr:', todayStr);
                  return false;
                }
                
                // Show incomplete tasks (including deferred to today or past)
                if (!task.completed) {
                  console.log('[Home] Task INCLUDED (incomplete):', task.id.substring(0, 8));
                  return true;
                }
                
                // For completed tasks, only show if completed today
                if (task.completedAt) {
                  const completedDate = new Date(task.completedAt);
                  const completedStr = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}-${String(completedDate.getDate()).padStart(2, '0')}`;
                  const shouldShow = completedStr === todayStr;
                  console.log('[Home] Task completed:', task.id.substring(0, 8), 'completedStr:', completedStr, 'shouldShow:', shouldShow);
                  return shouldShow;
                }
                
                console.log('[Home] Task filtered out (no condition matched):', task.id.substring(0, 8));
                return false;
              });
              
              console.log('[Home] After filtering, myTasks count:', myTasks.length);

              // Separate incomplete and completed tasks
              const incompleteTasks = myTasks.filter(t => !t.completed).sort((a, b) => (a.order || 0) - (b.order || 0));
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
                            onToggleCommitment={toggleCommitment}
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
                        onToggleCommitment={toggleCommitment}
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

            {/* Friends' Tasks - Grouped by Friend */}
            {(() => {
              const today = new Date();
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              
              const friendTasks = tasks.filter(task => {
                if (task.userId === user.uid) return false;
                
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
              
              if (friendTasks.length === 0) return null;

              // Group tasks by userId
              const tasksByUser = friendTasks.reduce((acc, task) => {
                if (!acc[task.userId]) {
                  acc[task.userId] = [];
                }
                acc[task.userId].push(task);
                return acc;
              }, {} as Record<string, typeof tasks>);

              return Object.entries(tasksByUser).map(([userId, userTasks]) => {
                const friendName = userTasks[0].userName;
                const colors = [
                  { from: 'from-green-500', to: 'to-green-600', text: 'text-green-600' },
                  { from: 'from-purple-500', to: 'to-purple-600', text: 'text-purple-600' },
                  { from: 'from-pink-500', to: 'to-pink-600', text: 'text-pink-600' },
                  { from: 'from-indigo-500', to: 'to-indigo-600', text: 'text-indigo-600' },
                  { from: 'from-orange-500', to: 'to-orange-600', text: 'text-orange-600' },
                ];
                const colorIndex = parseInt(userId.slice(-1), 16) % colors.length;
                const color = colors[colorIndex];

                return (
                  <div key={userId} className="mb-6">
                    <div className={`bg-gradient-to-r ${color.from} ${color.to} rounded-t-xl px-4 py-3 flex items-center justify-between`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 bg-white rounded-full flex items-center justify-center ${color.text} font-bold text-lg`}>
                          {friendName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h2 className="text-white font-semibold">{friendName}</h2>
                          <p className="text-white text-opacity-80 text-sm">{userTasks.length} task{userTasks.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-b-xl shadow-md p-4 space-y-3">
                      {userTasks.map((task) => (
                        <TaskItem
                          key={task.id}
                          task={task}
                          isOwnTask={false}
                          onToggleComplete={handleToggleComplete}
                          onTogglePrivacy={togglePrivacy}
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
              });
            })()}

          </>
        )}
      </main>

      {/* Task Input (Fixed at Bottom) */}
      <TaskInput 
        onAddTask={addTask} 
        disabled={tasksLoading}
        recentTasks={
          tasks
            .filter(t => t.userId === user?.uid && t.completed)
            .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
            .slice(0, 10)
            .map(t => t.text)
        }
      />

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
          console.log('[Home] Task not found for comments:', selectedTaskForComments);
          return null;
        }
        
        console.log('[Home] Rendering CommentsModal for task:', selectedTask.id, 'Comments:', selectedTask.comments?.length || 0);
        
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
    </div>
  );
}
