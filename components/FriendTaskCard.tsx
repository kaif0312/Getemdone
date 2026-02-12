'use client';

import { useState } from 'react';
import TaskItem from './TaskItem';
import Avatar from './Avatar';
import EncouragementModal from './EncouragementModal';
import { TaskWithUser, Attachment } from '@/lib/types';
import { groupTasksByTag } from '@/utils/taskGrouping';
import { FaChevronDown, FaChevronUp, FaLock, FaFire } from 'react-icons/fa';

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
  onSendEncouragement?: (friendId: string, message: string) => Promise<void>;
  currentUserId: string;
  tagOrder?: string[];
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
  onSendEncouragement,
  currentUserId,
  tagOrder = [],
}: FriendTaskCardProps) {
  const [showEncouragementModal, setShowEncouragementModal] = useState(false);
  const publicTasks = tasks.filter(t => !t.isPrivate);
  const publicGroups = groupTasksByTag(publicTasks, tagOrder);
  const completedToday = tasks.filter(t => t.completed).length;
  const pendingCount = publicTasks.filter(t => !t.completed).length;

  const handleSendEncouragement = async (message: string) => {
    if (onSendEncouragement) {
      await onSendEncouragement(friendId, message);
    }
  };

  return (
    <>
      <div className="mb-4 md:mb-6">
        {/* Compact Header - Always Visible */}
        <div className={`w-full bg-gradient-to-r ${color.from} ${color.to} rounded-t-xl px-3 py-2.5 md:px-4 md:py-3 flex items-center justify-between`}>
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-2 md:gap-3 flex-1 min-w-0 transition-opacity hover:opacity-90"
          >
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
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Encouragement Button */}
            {onSendEncouragement && (
              <button
                onClick={() => setShowEncouragementModal(true)}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all duration-200 group active:scale-95"
                title="Send encouragement"
              >
                <FaFire className="text-white group-hover:scale-110 transition-transform" size={16} />
              </button>
            )}
            <button onClick={onToggleExpand} className="p-1 hover:opacity-80 transition-opacity">
              {isExpanded ? (
                <FaChevronUp className="text-white text-opacity-80" size={16} />
              ) : (
                <FaChevronDown className="text-white text-opacity-80" size={16} />
              )}
            </button>
          </div>
        </div>

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
          {publicGroups.map((group) => (
            <div key={group.tag ?? 'no-tag'}>
              {group.tag && (
                <div className="flex items-center gap-1.5 py-1.5 mt-1 first:mt-0">
                  <span className="text-base">{group.tag}</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                </div>
              )}
              {group.tasks.map((task) => (
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
          ))}
        </div>
      )}
      </div>

      {/* Encouragement Modal */}
      <EncouragementModal
        isOpen={showEncouragementModal}
        onClose={() => setShowEncouragementModal(false)}
        friendName={friendName}
        onSend={handleSendEncouragement}
      />
    </>
  );
}
