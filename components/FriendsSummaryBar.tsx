'use client';

import { FaLock } from 'react-icons/fa';
import { LuCheck } from 'react-icons/lu';
import Avatar from './Avatar';

interface FriendSummary {
  id: string;
  name: string;
  photoURL?: string;
  pendingCount: number;
  completedToday: number;
  privateTotal: number;
  privateCompleted: number;
  color: { from: string; to: string; text: string };
}

interface FriendsSummaryBarProps {
  friends: FriendSummary[];
  activeFriendId: string | null;
  onFriendClick: (friendId: string) => void;
}

export default function FriendsSummaryBar({
  friends,
  activeFriendId,
  onFriendClick,
}: FriendsSummaryBarProps) {
  if (friends.length === 0) return null;

  return (
    <div className="sticky top-[73px] md:top-[81px] z-30 bg-surface border-b border-border-subtle shadow-elevation-1">
      <div className="max-w-3xl mx-auto px-4 py-2">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
          {friends.map((friend) => {
            const isActive = activeFriendId === friend.id;
            const hasActivity = friend.pendingCount > 0 || friend.completedToday > 0;
            
            return (
              <button
                key={friend.id}
                onClick={() => onFriendClick(friend.id)}
                className={`
                  flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all
                  ${isActive 
                    ? `bg-gradient-to-r ${friend.color.from} ${friend.color.to} text-white shadow-elevation-2 scale-105` 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }
                `}
              >
                {friend.photoURL ? (
                  <Avatar
                    photoURL={friend.photoURL}
                    displayName={friend.name}
                    size="md"
                    className={isActive ? 'border-2 border-white' : ''}
                  />
                ) : (
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                    ${isActive 
                      ? 'bg-white text-gray-700' 
                      : `bg-gradient-to-r ${friend.color.from} ${friend.color.to} text-white`
                    }
                  `}>
                    {friend.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="text-xs font-medium truncate max-w-[60px]">
                  {friend.name}
                </div>
                {hasActivity && (
                  <div className={`
                    text-xs font-semibold px-1.5 py-0.5 rounded-full
                    ${isActive 
                      ? 'bg-white/20 text-white' 
                      : 'bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                    }
                  `}>
                    {friend.pendingCount > 0 && (
                      <span>{friend.pendingCount} pending</span>
                    )}
                    {friend.completedToday > 0 && friend.pendingCount === 0 && (
                      <span className="inline-flex items-center gap-0.5">{friend.completedToday}<LuCheck size={10} /></span>
                    )}
                  </div>
                )}
                {friend.privateTotal > 0 && (
                  <div className={`
                    text-xs flex items-center gap-0.5
                    ${isActive ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}
                  `}>
                    <FaLock size={8} />
                    <span>{friend.privateTotal}</span>
                    {friend.privateCompleted > 0 && (
                      <span className="opacity-75 inline-flex items-center gap-0.5">({friend.privateCompleted}<LuCheck size={10} />)</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
