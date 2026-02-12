'use client';

import { useState, useRef, useEffect } from 'react';
import { Comment, TaskWithUser } from '@/lib/types';
import { FaTimes, FaPaperPlane, FaComment } from 'react-icons/fa';
import CommentReactionPicker from './CommentReactionPicker';
import Avatar from './Avatar';

interface CommentsModalProps {
  isOpen: boolean;
  task: TaskWithUser;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
  onAddComment: (taskId: string, text: string) => void;
  onAddCommentReaction: (taskId: string, commentId: string, emoji: string) => void;
}

export default function CommentsModal({
  isOpen,
  task,
  currentUserId,
  currentUserName,
  onClose,
  onAddComment,
  onAddCommentReaction,
}: CommentsModalProps) {
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [reactionPickerPosition, setReactionPickerPosition] = useState({ x: 0, y: 0 });
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Smart auto-scroll: only scroll if user is already near the bottom
  useEffect(() => {
    if (!isOpen || !commentsEndRef.current || !scrollContainerRef.current) return;
    
    const container = scrollContainerRef.current;
    const scrollHeight = container.scrollHeight;
    const scrollTop = container.scrollTop;
    const clientHeight = container.clientHeight;
    
    // Check if user is near the bottom (within 150px)
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
    
    // Only auto-scroll if user is near the bottom (not reading older messages)
    if (isNearBottom) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    // If user scrolled up, new messages appear but don't force scroll
    
  }, [task.comments, isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      // Delay to avoid iOS keyboard issues
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Handle long press for emoji picker
  const handleLongPressStart = (commentId: string, e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    longPressTimerRef.current = setTimeout(() => {
      setReactionPickerPosition({ x: clientX, y: clientY });
      setSelectedCommentId(commentId);
      setShowReactionPicker(true);
      
      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 300); // 300ms long press
  };

  const handleLongPressEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    if (selectedCommentId) {
      onAddCommentReaction(task.id, selectedCommentId, emoji);
      setShowReactionPicker(false);
      setSelectedCommentId(null);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isSending) return;

    setIsSending(true);
    try {
      console.log('[CommentsModal] Submitting comment:', commentText.trim());
      await onAddComment(task.id, commentText.trim());
      setCommentText('');
      
      // Haptic feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(30);
      }
      console.log('[CommentsModal] Comment submitted successfully');
    } catch (error) {
      console.error('[CommentsModal] Error submitting comment:', error);
      alert('Failed to add comment. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (!isOpen) return null;

  // Dedupe by id (keep last) to avoid duplicate key errors from optimistic + listener overlap
  const rawComments = task.comments || [];
  const seenIds = new Set<string>();
  const comments = rawComments
    .slice()
    .reverse()
    .filter((c) => {
      if (seenIds.has(c.id)) return false;
      seenIds.add(c.id);
      return true;
    })
    .reverse();
  const isOwnTask = task.userId === currentUserId;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal - Full screen on mobile, centered on desktop */}
      <div className="fixed inset-x-0 bottom-0 md:inset-x-auto md:inset-y-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg z-[101] animate-in slide-in-from-bottom md:slide-in-from-top duration-300">
        <div className="bg-white dark:bg-gray-800 md:rounded-2xl shadow-2xl flex flex-col h-[85vh] md:h-[600px] max-h-[85vh]">
          
          {/* Header */}
          <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <FaComment className="text-blue-500 flex-shrink-0" size={16} />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Comments
                  </h2>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {task.text}
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors flex-shrink-0"
                aria-label="Close"
              >
                <FaTimes className="text-gray-500 dark:text-gray-400" size={18} />
              </button>
            </div>
          </div>

          {/* Comments List */}
          <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                  <FaComment className="text-gray-400 dark:text-gray-500" size={24} />
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-lg font-medium mb-1">
                  No comments yet
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm">
                  Start the conversation!
                </p>
              </div>
            ) : (
              <>
                {comments.map((comment, index) => {
                  const isOwnComment = comment.userId === currentUserId;
                  const isTaskOwnerComment = comment.userId === task.userId;
                  const reactions = comment.reactions || [];
                  
                  // Group reactions by emoji
                  const reactionGroups = reactions.reduce((acc, reaction) => {
                    if (!acc[reaction.emoji]) {
                      acc[reaction.emoji] = [];
                    }
                    acc[reaction.emoji].push(reaction);
                    return acc;
                  }, {} as Record<string, typeof reactions>);

                  return (
                    <div
                      key={`${comment.id}-${index}`}
                      ref={(el) => {
                        if (el) commentRefs.current.set(comment.id, el);
                        else commentRefs.current.delete(comment.id);
                      }}
                      className={`flex gap-3 ${isOwnComment ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom duration-200`}
                    >
                      {/* Avatar - profile picture when available */}
                      <Avatar
                        photoURL={comment.photoURL}
                        displayName={comment.userName}
                        size="sm"
                        className={`flex-shrink-0 ${
                          isTaskOwnerComment
                            ? 'ring-2 ring-blue-400 dark:ring-blue-500 ring-offset-1 dark:ring-offset-gray-800'
                            : ''
                        }`}
                        gradientFrom={isTaskOwnerComment ? 'from-blue-500' : 'from-gray-500'}
                        gradientTo={isTaskOwnerComment ? 'to-blue-600' : 'to-gray-600'}
                      />

                      {/* Comment Bubble */}
                      <div className={`flex-1 max-w-[75%] ${isOwnComment ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div 
                          className={`rounded-2xl px-4 py-2.5 select-none ${
                            isOwnComment
                              ? 'bg-blue-500 text-white rounded-br-sm'
                              : isTaskOwnerComment
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100 border border-blue-200 dark:border-blue-800 rounded-bl-sm'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
                          }`}
                          onTouchStart={(e) => handleLongPressStart(comment.id, e)}
                          onTouchEnd={handleLongPressEnd}
                          onMouseDown={(e) => handleLongPressStart(comment.id, e)}
                          onMouseUp={handleLongPressEnd}
                          onMouseLeave={handleLongPressEnd}
                        >
                          {!isOwnComment && (
                            <div className={`text-xs font-semibold mb-1 ${
                              isTaskOwnerComment
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-gray-600 dark:text-gray-400'
                            }`}>
                              {comment.userName}
                              {isTaskOwnerComment && ' (Task Owner)'}
                            </div>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {comment.text}
                          </p>
                        </div>
                        
                        {/* Reactions */}
                        {Object.keys(reactionGroups).length > 0 && (
                          <div className={`flex items-center gap-1.5 mt-1.5 flex-wrap ${isOwnComment ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(reactionGroups).map(([emoji, emojiReactions]) => {
                              const hasUserReaction = emojiReactions.some(r => r.userId === currentUserId);
                              return (
                                <button
                                  key={emoji}
                                  onClick={() => onAddCommentReaction(task.id, comment.id, emoji)}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                                    hasUserReaction
                                      ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                                      : 'bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                                  }`}
                                >
                                  <span className="text-sm">{emoji}</span>
                                  <span className="text-gray-600 dark:text-gray-400 font-medium">
                                    {emojiReactions.length}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        
                        <span className={`text-xs text-gray-500 dark:text-gray-400 mt-1 px-1 ${
                          isOwnComment ? 'text-right' : 'text-left'
                        }`}>
                          {formatTime(comment.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={commentsEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                  placeholder={isOwnTask ? "Add an update..." : "Add a comment..."}
                  className="w-full px-4 py-3 pr-12 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-all max-h-32"
                  rows={1}
                  style={{
                    minHeight: '44px',
                    height: 'auto',
                  }}
                />
                {commentText.trim() && (
                  <div className="absolute right-2 bottom-2 text-xs text-gray-400 dark:text-gray-500">
                    {commentText.length}/500
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={!commentText.trim() || isSending}
                className={`p-3.5 rounded-full transition-all flex-shrink-0 ${
                  commentText.trim() && !isSending
                    ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl active:scale-95'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }`}
                aria-label="Send comment"
              >
                <FaPaperPlane size={16} className={isSending ? 'animate-pulse' : ''} />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        </div>
      </div>

      {/* Emoji Reaction Picker */}
      <CommentReactionPicker
        isOpen={showReactionPicker}
        position={reactionPickerPosition}
        onSelectEmoji={handleEmojiSelect}
        onClose={() => {
          setShowReactionPicker(false);
          setSelectedCommentId(null);
        }}
      />
    </>
  );
}
