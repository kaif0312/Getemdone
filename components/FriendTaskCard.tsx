'use client';

import { useState } from 'react';
import TaskItem from './TaskItem';
import EncouragementModal from './EncouragementModal';
import { TaskWithUser, Attachment } from '@/lib/types';
import { groupTasksByTag } from '@/utils/taskGrouping';
import { getIconForTag } from '@/lib/tagIcons';
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
  onDeferTask: (taskId: string, date: string | null) => void;
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
        {/* Compact Header - minimal section header with left border accent */}
        <div className="border-l-4 border-primary pl-4 py-2 rounded-r-lg">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-2 flex-1 min-w-0 text-left group"
            >
              {/* Section header: name (16px semibold) + task count (secondary) */}
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-fg-primary truncate">{friendName}</h2>
                <div className="flex items-center gap-2 text-sm text-fg-secondary">
                  <span>
                    {tasks.length === 0
                      ? 'No tasks yet'
                      : `${pendingCount} ${pendingCount === 1 ? 'task' : 'tasks'} pending${completedToday > 0 ? ` • ${completedToday} done today` : ''}`}
                  </span>
                  {privateTotal > 0 && (
                    <span className="flex items-center gap-1">
                      <FaLock size={12} className="text-fg-tertiary" />
                      {privateTotal}
                    </span>
                  )}
                </div>
              </div>
            </button>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Streak/Encouragement - secondary */}
              {onSendEncouragement && (
                <button
                  onClick={() => setShowEncouragementModal(true)}
                  className="p-2 text-fg-secondary hover:text-fg-primary rounded-lg transition-colors"
                  title="Send encouragement"
                >
                  <FaFire size={16} />
                </button>
              )}
              {/* Collapse chevron - tertiary, 20px */}
              <button onClick={onToggleExpand} className="p-1 text-fg-tertiary hover:text-fg-secondary transition-colors">
                {isExpanded ? (
                  <FaChevronUp size={20} />
                ) : (
                  <FaChevronDown size={20} />
                )}
              </button>
            </div>
          </div>
        </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="bg-surface rounded-lg shadow-elevation-2 border border-border-subtle p-4 space-y-2 mt-2 animate-in slide-in-from-top-2 duration-200">
          {privateTotal > 0 && (
            <div className="bg-surface-muted rounded-lg px-3 py-2 border border-border-subtle flex items-center gap-2 text-xs md:text-sm text-fg-secondary">
              <FaLock size={14} className="text-fg-secondary" />
              <span>
                <strong>{privateTotal}</strong> private {privateTotal === 1 ? 'task' : 'tasks'}
                {privateCompleted > 0 && (
                  <span> • <strong>{privateCompleted}</strong> completed</span>
                )}
              </span>
            </div>
          )}
          {publicTasks.length === 0 && privateTotal > 0 && (
            <p className="text-center text-fg-tertiary text-sm py-4">
              Only private tasks for today.
            </p>
          )}
          {publicTasks.length === 0 && privateTotal === 0 && (
            <p className="text-center text-fg-tertiary text-sm py-4">
              No tasks yet.
            </p>
          )}
          {publicGroups.map((group) => (
            <div key={group.tag ?? 'no-tag'}>
              {group.tag && (
                <div className="flex items-center gap-1.5 py-1.5 mt-1 first:mt-0">
                  {(() => {
                    const Icon = getIconForTag(group.tag);
                    return (
                      <>
                        <Icon size={16} strokeWidth={1.5} className="text-fg-secondary flex-shrink-0" />
                        <div className="flex-1 h-px bg-border-subtle" />
                      </>
                    );
                  })()}
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
