'use client';

import TaskItem from './TaskItem';
import Avatar from './Avatar';
import { TaskWithUser, Attachment } from '@/lib/types';
import { FaChevronDown, FaChevronUp, FaLock } from 'react-icons/fa';

interface FriendTaskCardProps {
  friendId: string;
  friendName: string;
  photoURL?: string;
  tasks: TaskWithUser[];
  privateTotal: number;
  privateCompleted: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  color: { from: string; to: string; text: string };
  onToggleComplete: (taskId: string, completed: boolean) => void;
  onTogglePrivacy: (taskId: string, isPrivate: boolean) => void;
  onUpdateTask: (taskId: string, text: string) => Promise<void>;
  onUpdateDueDate: (taskId: string, dueDate: number | null) => Promise<void>;
  onUpdateNotes: (taskId: string, notes: string) => Promise<void>;
  onToggleCommitment: (taskId: string, committed: boolean) => Promise<void>;
  onToggleSkipRollover: (taskId: string, skipRollover: boolean) => Promise<void>;
  onDelete: (taskId: string) => Promise<void>;
  onAddReaction: (taskId: string, emoji: string) => void;
  onOpenComments: (taskId: string) => void;
  onDeferTask: (taskId: string, date: string) => void;
  onAddAttachment?: (taskId: string, attachment: Attachment) => void;
  onDeleteAttachment?: (taskId: string, attachmentId: string) => void;
  currentUserId: string;
}

export default function FriendTaskCard({
  friendId,
  friendName,
  photoURL,
  tasks,
  privateTotal,
  privateCompleted,
  isExpanded,
  onToggleExpand,
  color,
  onToggleComplete,
  onTogglePrivacy,
  onUpdateTask,
  onUpdateDueDate,
  onUpdateNotes,
  onToggleCommitment,
  onToggleSkipRollover,
  onDelete,
  onAddReaction,
  onOpenComments,
  onDeferTask,
  onAddAttachment,
  onDeleteAttachment,
  currentUserId,
}: FriendTaskCardProps) {
  const publicTasks = tasks.filter(t => !t.isPrivate);
  const completedToday = tasks.filter(t => t.completed).length;
  const pendingCount = publicTasks.filter(t => !t.completed).length;

  return (
    <div className="mb-4 md:mb-6">
      {/* Compact Header - Always Visible */}
      <button
        onClick={onToggleExpand}
        className={`w-full bg-gradient-to-r ${color.from} ${color.to} rounded-t-xl px-3 py-2.5 md:px-4 md:py-3 flex items-center justify-between transition-all hover:opacity-90 active:scale-[0.98]`}
      >
        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
          {photoURL ? (
            <Avatar
              photoURL={photoURL}
              displayName={friendName}
              size="md"
              className="border-2 border-white flex-shrink-0"
            />
          ) : (
            <div className={`w-9 h-9 md:w-10 md:h-10 bg-white rounded-full flex items-center justify-center ${color.text} font-bold text-base md:text-lg flex-shrink-0`}>
              {friendName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-semibold text-base md:text-lg text-left truncate">{friendName}</h2>
            <div className="flex items-center gap-2 text-white text-opacity-90 text-xs md:text-sm">
              <span>
                {pendingCount} {pendingCount === 1 ? 'task' : 'tasks'} pending
                {completedToday > 0 && (
                  <span className="ml-1">• {completedToday} done today</span>
                )}
              </span>
              {privateTotal > 0 && (
                <span className="flex items-center gap-1 ml-1">
                  <FaLock size={10} />
                  {privateTotal} ({privateCompleted}✓)
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isExpanded ? (
            <FaChevronUp className="text-white text-opacity-80" size={16} />
          ) : (
            <FaChevronDown className="text-white text-opacity-80" size={16} />
          )}
        </div>
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="bg-white dark:bg-gray-800 rounded-b-xl shadow-md p-3 space-y-2 md:p-4 md:space-y-3 animate-in slide-in-from-top-2 duration-200">
          {privateTotal > 0 && (
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-600 flex items-center gap-2 text-xs md:text-sm text-gray-600 dark:text-gray-400">
              <span className="text-base">🔒</span>
              <span>
                <strong>{privateTotal}</strong> private {privateTotal === 1 ? 'task' : 'tasks'}
                {privateCompleted > 0 && (
                  <span> • <strong>{privateCompleted}</strong> completed</span>
                )}
              </span>
            </div>
          )}
          {publicTasks.length === 0 && privateTotal > 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm py-4">
              Only private tasks for today.
            </p>
          )}
          {publicTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              isOwnTask={false}
              onToggleComplete={(taskId, completed) => onToggleComplete(taskId, completed)}
              onTogglePrivacy={(taskId, isPrivate) => onTogglePrivacy(taskId, isPrivate)}
              onUpdateTask={onUpdateTask}
              onUpdateDueDate={onUpdateDueDate}
              onUpdateNotes={onUpdateNotes}
              onToggleCommitment={(taskId, committed) => onToggleCommitment(taskId, committed)}
              onToggleSkipRollover={(taskId, skipRollover) => onToggleSkipRollover(taskId, skipRollover)}
              onDelete={onDelete}
              onAddReaction={onAddReaction}
              onOpenComments={onOpenComments}
              onDeferTask={onDeferTask}
              onAddAttachment={onAddAttachment}
              onDeleteAttachment={onDeleteAttachment}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
