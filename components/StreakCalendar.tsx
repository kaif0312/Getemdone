'use client';

import { useState } from 'react';
import { StreakData, TaskWithUser } from '@/lib/types';
import { FaChevronLeft, FaChevronRight, FaTimes, FaArrowLeft } from 'react-icons/fa';
import TaskItem from './TaskItem';

interface StreakCalendarProps {
  streakData: StreakData;
  tasks: TaskWithUser[];
  currentUserId: string;
  onClose: () => void;
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onTogglePrivacy: (taskId: string, isPrivate: boolean) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask?: (taskId: string, text: string) => Promise<void>;
  onUpdateDueDate?: (taskId: string, dueDate: number | null) => Promise<void>;
  onUpdateNotes?: (taskId: string, notes: string) => Promise<void>;
  onAddReaction: (taskId: string, emoji: string) => void;
  onOpenComments?: (taskId: string) => void;
  onDeferTask: (taskId: string, deferToDate: string) => void;
}

export default function StreakCalendar({ 
  streakData, 
  tasks,
  currentUserId,
  onClose,
  onToggleComplete,
  onTogglePrivacy,
  onDelete,
  onUpdateTask,
  onUpdateDueDate,
  onUpdateNotes,
  onAddReaction,
  onOpenComments,
  onDeferTask
}: StreakCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday

  // Month names
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

  const getTaskCount = (day: number): number => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return streakData.completionHistory[dateStr] || 0;
  };

  const getMissedCommitmentCount = (day: number): number => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return streakData.missedCommitments?.[dateStr] || 0;
  };

  const isToday = (day: number): boolean => {
    const today = new Date();
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const getTasksForDate = (dateStr: string) => {
    return tasks.filter(task => {
      // For completed tasks, check completion date
      if (task.completed && task.completedAt) {
        const date = new Date(task.completedAt);
        const taskDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return taskDateStr === dateStr;
      }
      
      // For incomplete tasks, show on BOTH creation date AND deferred/scheduled date
      if (!task.completed) {
        // Check if this matches the deferred/scheduled date
        if (task.deferredTo) {
          const deferredDate = task.deferredTo.includes('T') 
            ? task.deferredTo.split('T')[0] 
            : task.deferredTo;
          if (deferredDate === dateStr) return true;
        }
        
        // Check if this matches the creation date
        const date = new Date(task.createdAt);
        const taskDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (taskDateStr === dateStr) return true;
      }
      
      return false;
    });
  };

  const handleDateClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
  };

  // If a date is selected, show tasks for that date
  if (selectedDate) {
    const dateTasks = getTasksForDate(selectedDate);
    const selectedDateObj = new Date(selectedDate + 'T12:00:00');
    const isSelectedToday = selectedDateObj.getDate() === new Date().getDate() && 
                            selectedDateObj.getMonth() === new Date().getMonth() && 
                            selectedDateObj.getFullYear() === new Date().getFullYear();

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedDate(null)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Back to calendar"
              >
                <FaArrowLeft size={18} />
              </button>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedDateObj.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric',
                    year: 'numeric' 
                  })}
                </h2>
                {isSelectedToday && (
                  <span className="text-sm text-blue-600 font-medium">Today</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              aria-label="Close"
            >
              <FaTimes size={20} />
            </button>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto p-6">
            {dateTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-lg mb-2">No tasks on this date</p>
                <p className="text-sm">
                  {isSelectedToday 
                    ? "Add your first task below!" 
                    : "You didn't have any tasks scheduled for this day"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {dateTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    isOwnTask={true}
                    onToggleComplete={onToggleComplete}
                    onTogglePrivacy={onTogglePrivacy}
                    onUpdateTask={onUpdateTask}
                    onUpdateDueDate={onUpdateDueDate}
                    onUpdateNotes={onUpdateNotes}
                    onDelete={onDelete}
                    onAddReaction={onAddReaction}
                    onOpenComments={onOpenComments}
                    onDeferTask={onDeferTask}
                    currentUserId={currentUserId}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Generate calendar grid
  const calendarDays = [];
  
  // Add empty cells for days before month starts
  for (let i = 0; i < startingDayOfWeek; i++) {
    calendarDays.push(<div key={`empty-${i}`} className="p-2"></div>);
  }

  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const taskCount = getTaskCount(day);
    const today = isToday(day);
    
    let bgColor = 'bg-gray-100 hover:bg-gray-200';
    if (taskCount > 0) {
      if (taskCount === 1) bgColor = 'bg-green-200 hover:bg-green-300';
      else if (taskCount === 2) bgColor = 'bg-green-300 hover:bg-green-400';
      else if (taskCount === 3) bgColor = 'bg-green-400 hover:bg-green-500';
      else bgColor = 'bg-green-500 hover:bg-green-600';
    }

    const missedCount = getMissedCommitmentCount(day);
    
    calendarDays.push(
      <button
        key={day}
        onClick={() => handleDateClick(day)}
        className={`p-2 text-center rounded-lg ${bgColor} ${today ? 'ring-2 ring-blue-500' : ''} transition-all cursor-pointer relative`}
        title={
          taskCount > 0 || missedCount > 0
            ? `${taskCount} completed${missedCount > 0 ? `, ${missedCount} missed commitment${missedCount > 1 ? 's' : ''}` : ''} - Click to view`
            : 'Click to view tasks'
        }
      >
        <div className={`text-sm font-medium ${taskCount > 0 ? 'text-gray-900' : 'text-gray-500'}`}>
          {day}
        </div>
        <div className="flex items-center justify-center gap-1 mt-1">
          {taskCount > 0 && (
            <div className="text-xs font-bold text-green-600">
              ✓{taskCount}
            </div>
          )}
          {missedCount > 0 && (
            <div className="text-xs font-bold text-red-600">
              ⚠{missedCount}
            </div>
          )}
        </div>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Task Calendar</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Streak Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gradient-to-br from-orange-400 to-orange-500 text-white rounded-xl p-4 shadow-md">
            <div className="text-3xl font-bold">{streakData.currentStreak}</div>
            <div className="text-sm opacity-90">Current Streak</div>
          </div>
          <div className="bg-gradient-to-br from-purple-400 to-purple-500 text-white rounded-xl p-4 shadow-md">
            <div className="text-3xl font-bold">{streakData.longestStreak}</div>
            <div className="text-sm opacity-90">Longest Streak</div>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4 text-center bg-blue-50 border border-blue-200 rounded-lg p-2">
          💡 Click any date to view tasks
        </p>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Previous month"
          >
            <FaChevronLeft size={16} />
          </button>
          <h3 className="text-lg font-semibold text-gray-800">
            {monthNames[month]} {year}
          </h3>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Next month"
          >
            <FaChevronRight size={16} />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center text-xs font-semibold text-gray-600">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-2">
          {calendarDays}
        </div>

        {/* Legend */}
        <div className="mt-6 flex items-center justify-center gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-gray-100 rounded"></div>
            <span>0</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-green-200 rounded"></div>
            <span>1</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-green-300 rounded"></div>
            <span>2</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-green-400 rounded"></div>
            <span>3</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span>4+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
