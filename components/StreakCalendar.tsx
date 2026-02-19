'use client';

import { useState } from 'react';
import { StreakData, TaskWithUser } from '@/lib/types';
import { FaChevronLeft, FaChevronRight, FaTimes, FaArrowLeft, FaExclamationTriangle } from 'react-icons/fa';
import { LuCheck } from 'react-icons/lu';
import TaskItem from './TaskItem';
import { dateMatchesRecurrence } from '@/utils/recurrence';

interface StreakCalendarProps {
  streakData: StreakData;
  tasks: TaskWithUser[];
  currentUserId: string;
  onClose: () => void;
  onToggleComplete: (taskId: string, completed: boolean, dateStr?: string) => void;
  onTogglePrivacy: (taskId: string, isPrivate: boolean) => void;
  onDelete: (taskId: string) => void;
  onUpdateTask?: (taskId: string, text: string) => Promise<void>;
  onUpdateDueDate?: (taskId: string, dueDate: number | null) => Promise<void>;
  onUpdateNotes?: (taskId: string, notes: string) => Promise<void>;
  onAddReaction: (taskId: string, emoji: string) => void;
  onOpenComments?: (taskId: string) => void;
  onDeferTask: (taskId: string, deferToDate: string | null) => void;
  onUpdateTaskRecurrence?: (taskId: string, recurrence: import('@/lib/types').Recurrence | null, completedDateStr?: string) => Promise<void>;
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
  onDeferTask,
  onUpdateTaskRecurrence,
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

  const getTasksForDate = (dateStr: string): TaskWithUser[] => {
    return tasks.filter(task => {
      // Recurring tasks: show if completed on this date OR due on this date (not skipped)
      if (task.recurrence) {
        if (task.recurrence.completedDates?.includes(dateStr)) return true;
        if (task.recurrence.skippedDates?.includes(dateStr)) return false;
        return dateMatchesRecurrence(task.recurrence, dateStr);
      }

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

  /** For recurring tasks completed on a date, show as completed in the calendar */
  const getDisplayTasksForDate = (dateStr: string): TaskWithUser[] => {
    return getTasksForDate(dateStr).map(task => {
      if (task.recurrence?.completedDates?.includes(dateStr)) {
        return { ...task, completed: true, completedAt: new Date(dateStr + 'T12:00:00').getTime() };
      }
      return task;
    });
  };

  const handleDateClick = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(dateStr);
  };

  // If a date is selected, show tasks for that date
  if (selectedDate) {
    const dateTasks = getDisplayTasksForDate(selectedDate);
    const selectedDateObj = new Date(selectedDate + 'T12:00:00');
    const isSelectedToday = selectedDateObj.getDate() === new Date().getDate() && 
                            selectedDateObj.getMonth() === new Date().getMonth() && 
                            selectedDateObj.getFullYear() === new Date().getFullYear();

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] flex items-center justify-center p-4 z-50">
        <div className="bg-surface dark:bg-elevated dark:border dark:border-border-subtle rounded-2xl shadow-elevation-3 dark:shadow-none max-w-2xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border-subtle">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedDate(null)}
                className="text-fg-tertiary hover:text-fg-primary transition-colors"
                aria-label="Back to calendar"
              >
                <FaArrowLeft size={18} />
              </button>
              <div>
                <h2 className="text-xl font-semibold text-fg-primary">
                  {selectedDateObj.toLocaleDateString('en-US', { 
                    weekday: 'long', 
                    month: 'long', 
                    day: 'numeric',
                    year: 'numeric' 
                  })}
                </h2>
                {isSelectedToday && (
                  <span className="text-sm text-primary font-medium">Today</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-fg-tertiary hover:text-fg-primary transition-colors"
              aria-label="Close"
            >
              <FaTimes size={20} />
            </button>
          </div>

          {/* Task List */}
          <div className="flex-1 overflow-y-auto p-6">
            {dateTasks.length === 0 ? (
              <div className="text-center py-12 text-fg-secondary">
                <p className="text-lg mb-2">No tasks on this date</p>
                <p className="text-sm text-fg-tertiary">
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
                    onToggleComplete={(taskId, completed) => onToggleComplete(taskId, completed, selectedDate)}
                    onTogglePrivacy={onTogglePrivacy}
                    onUpdateTask={onUpdateTask}
                    onUpdateDueDate={onUpdateDueDate}
                    onUpdateNotes={onUpdateNotes}
                    onDelete={onDelete}
                    onAddReaction={onAddReaction}
                    onOpenComments={onOpenComments}
                    onDeferTask={onDeferTask}
                    onUpdateTaskRecurrence={onUpdateTaskRecurrence}
                    recurrenceDateContext={selectedDate}
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
    calendarDays.push(<div key={`empty-${i}`} className="w-10 h-10" />);
  }

  // Opacity scale: 1→15%, 2→30%, 3→50%, 4+→80%. Text: fg-primary for 1-2, white for 3+
  const getCellStyles = (count: number, isToday: boolean) => {
    const base = 'w-10 h-10 flex flex-col items-center justify-center rounded-lg transition-all cursor-pointer relative';
    const todayRing = isToday ? 'ring-[1.5px] ring-primary' : '';
    if (count === 0) {
      return `${base} ${todayRing} hover:bg-surface-muted text-fg-secondary`;
    }
    const opacityMap: Record<number, string> = {
      1: 'bg-primary/15',
      2: 'bg-primary/30',
      3: 'bg-primary/50',
      4: 'bg-primary/80',
    };
    const bg = count >= 4 ? 'bg-primary/80' : opacityMap[count] || 'bg-primary/80';
    const textColor = count >= 3 ? 'text-white' : 'text-fg-primary';
    return `${base} ${bg} ${todayRing} ${textColor}`;
  };

  // Add days of month
  for (let day = 1; day <= daysInMonth; day++) {
    const taskCount = getTaskCount(day);
    const today = isToday(day);
    const missedCount = getMissedCommitmentCount(day);
    
    calendarDays.push(
      <button
        key={day}
        onClick={() => handleDateClick(day)}
        className={getCellStyles(taskCount, today)}
        title={
          taskCount > 0 || missedCount > 0
            ? `${taskCount} completed${missedCount > 0 ? `, ${missedCount} missed commitment${missedCount > 1 ? 's' : ''}` : ''} - Click to view`
            : 'Click to view tasks'
        }
      >
        {missedCount > 0 && (
          <FaExclamationTriangle
            size={10}
            className="absolute top-0.5 right-0.5 text-warning"
            title={`${missedCount} missed`}
          />
        )}
        <span className="text-sm font-medium">{day}</span>
        {taskCount > 0 && (
          <span className="text-xs font-medium mt-0.5 flex items-center gap-0.5"><LuCheck size={10} />{taskCount}</span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-[4px] flex items-center justify-center p-4 z-50">
      <div className="bg-surface dark:bg-elevated dark:border dark:border-border-subtle rounded-2xl shadow-elevation-3 dark:shadow-none max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-fg-primary">Task Calendar</h2>
          <button
            onClick={onClose}
            className="text-fg-tertiary hover:text-fg-primary transition-colors"
            aria-label="Close"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Streak Stats - compact stat blocks */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-surface rounded-xl px-4 py-3">
            <div className="text-2xl font-semibold text-primary">{streakData.currentStreak}</div>
            <div className="text-xs text-fg-secondary uppercase tracking-wider mt-0.5">Current Streak</div>
          </div>
          <div className="bg-surface rounded-xl px-4 py-3">
            <div className="text-2xl font-semibold text-primary">{streakData.longestStreak}</div>
            <div className="text-xs text-fg-secondary uppercase tracking-wider mt-0.5">Longest Streak</div>
          </div>
        </div>

        <p className="text-sm text-fg-tertiary mb-4 text-center">
          Click any date to view tasks
        </p>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-surface-muted rounded-lg transition-colors text-fg-secondary"
            aria-label="Previous month"
          >
            <FaChevronLeft size={16} />
          </button>
          <h3 className="text-base font-semibold text-fg-primary">
            {monthNames[month]} {year}
          </h3>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-surface-muted rounded-lg transition-colors text-fg-secondary"
            aria-label="Next month"
          >
            <FaChevronRight size={16} />
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="w-10 text-center text-xs font-medium text-fg-tertiary">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid - 40px cells, 4px gap */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays}
        </div>

        {/* Legend - 8px circles, primary opacity scale */}
        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-fg-tertiary">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-transparent border border-border-subtle" />
            <span>0</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary/15" />
            <span>1</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary/30" />
            <span>2</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary/50" />
            <span>3</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary/80" />
            <span>4+</span>
          </div>
        </div>
      </div>
    </div>
  );
}
