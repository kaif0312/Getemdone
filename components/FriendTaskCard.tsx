'use client';

import { useState } from 'react';
import TaskItem from './TaskItem';
import EncouragementModal from './EncouragementModal';
import TodaysScheduleCard from './TodaysScheduleCard';
import { TaskWithUser, Attachment, CalendarEvent } from '@/lib/types';
import { groupTasksByTag } from '@/utils/taskGrouping';
import { getIconForTag } from '@/lib/tagIcons';
import { FaFire } from 'react-icons/fa';
import { LuZap } from 'react-icons/lu';
import { FocusPresenceData } from '@/lib/types';
import { formatElapsed } from '@/hooks/useFocusPresence';
import { getPresenceElapsedSeconds } from '@/hooks/useFriendPresence';

interface FriendTaskCardProps {
  friendId: string;
  friendName: string;
  photoURL?: string;
  tasks: TaskWithUser[];
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
  onSendNudge?: (friendId: string) => Promise<void>;
  currentUserId: string;
  tagOrder?: string[];
  /** Today's schedule for this friend (only if friend has calendar connected) */
  scheduleEvents?: CalendarEvent[];
  scheduleLoading?: boolean;
  /** Friend has Google Calendar connected */
  friendHasCalendar?: boolean;
  /** Can show nudge (free all day + pending tasks + not rate limited) */
  canNudgeToday?: boolean;
  /** Live focus presence for this friend — shows banner when active */
  focusPresence?: FocusPresenceData | null;
}

export default function FriendTaskCard({
  friendId,
  friendName,
  photoURL,
  tasks,
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
  onSendNudge,
  currentUserId,
  tagOrder = [],
  scheduleEvents = [],
  scheduleLoading = false,
  friendHasCalendar = false,
  canNudgeToday = true,
  focusPresence,
}: FriendTaskCardProps) {
  const [showEncouragementModal, setShowEncouragementModal] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const publicTasks = tasks; // Parent already filters by canViewTask
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
        {/* Focus presence banner */}
        {focusPresence?.isActive && (() => {
          const elapsed = getPresenceElapsedSeconds(focusPresence);
          return (
            <div className="flex items-center gap-2.5 px-3 py-2 mb-3 rounded-xl bg-success/8 border border-success/15">
              {/* Pulsing dot */}
              <span className="relative flex-shrink-0 w-2 h-2">
                <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
                <span className="relative w-2 h-2 rounded-full bg-success block" />
              </span>
              <LuZap size={13} className="text-success flex-shrink-0" />
              <span className="text-sm text-success font-medium flex-1 min-w-0 truncate">
                {friendName} is in deep focus
              </span>
              <span className="text-xs text-success/70 font-medium flex-shrink-0 tabular-nums">
                {formatElapsed(elapsed)}
              </span>
            </div>
          );
        })()}

        {/* Header */}
        <div className="border-l-4 border-primary pl-4 py-2 rounded-r-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-fg-primary truncate">{friendName}</h2>
              <div className="flex items-center gap-2 text-sm text-fg-secondary">
                <span>
                  {tasks.length === 0
                    ? 'No tasks yet'
                    : `${pendingCount} ${pendingCount === 1 ? 'task' : 'tasks'} pending${completedToday > 0 ? ` • ${completedToday} done today` : ''}`}
                </span>
              </div>
            </div>
            {onSendEncouragement && (
              <button
                onClick={() => setShowEncouragementModal(true)}
                className="p-2 text-fg-secondary hover:text-fg-primary rounded-lg transition-colors flex-shrink-0"
                title="Send encouragement"
              >
                <FaFire size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Content — always visible */}
        <div className="mt-2 space-y-2">
          {friendHasCalendar && (
            <TodaysScheduleCard
              events={scheduleEvents}
              currentUserId={currentUserId}
              ownerId={friendId}
              isOwn={false}
              loading={scheduleLoading}
              hideSection={!friendHasCalendar}
              pendingTaskCount={pendingCount}
              onNudge={onSendNudge ? () => onSendNudge(friendId) : undefined}
              canNudge={!!(onSendNudge && canNudgeToday && pendingCount > 0 && !scheduleLoading && scheduleEvents.length === 0)}
            />
          )}
          <div className="bg-surface rounded-lg shadow-elevation-2 border border-border-subtle p-4 space-y-2">
          {publicTasks.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-surface-muted flex items-center justify-center">
                <FaFire size={22} className="text-fg-tertiary" />
              </div>
              <div>
                <p className="text-sm font-medium text-fg-primary">{friendName} hasn&apos;t added tasks yet</p>
                <p className="text-xs text-fg-tertiary mt-0.5">Check back later or send some encouragement</p>
              </div>
              {onSendEncouragement && (
                <button
                  onClick={() => setShowEncouragementModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  <FaFire size={14} />
                  Send Encouragement
                </button>
              )}
            </div>
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
              isExpanded={focusedTaskId === task.id}
              onExpand={() => setFocusedTaskId((prev) => prev === task.id ? null : task.id)}
            />
              ))}
            </div>
          ))}
          </div>
        </div>
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
