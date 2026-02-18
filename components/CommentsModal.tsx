'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Comment, TaskWithUser } from '@/lib/types';
import { FaTimes, FaPaperPlane, FaComment, FaReply, FaEdit, FaTrash, FaCopy } from 'react-icons/fa';
import Avatar from './Avatar';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
import LinkifyText from './LinkifyText';

interface CommentsModalProps {
  isOpen: boolean;
  task: TaskWithUser;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
  onAddComment: (taskId: string, text: string, replyTo?: { id: string; userName: string }) => void;
  onAddCommentReaction: (taskId: string, commentId: string, emoji: string) => void;
  onEditComment?: (taskId: string, commentId: string, newText: string) => void;
  onDeleteComment?: (taskId: string, commentId: string) => void;
}

export default function CommentsModal({
  isOpen,
  task,
  currentUserId,
  currentUserName,
  onClose,
  onAddComment,
  onAddCommentReaction,
  onEditComment,
  onDeleteComment,
}: CommentsModalProps) {
  const [commentText, setCommentText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showCommentMenu, setShowCommentMenu] = useState(false);
  const [commentMenuPosition, setCommentMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedCommentRect, setSelectedCommentRect] = useState<DOMRect | null>(null);
  const [selectedCommentForMenu, setSelectedCommentForMenu] = useState<{
    id: string;
    userName: string;
    text: string;
    userId: string;
  } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; userName: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const commentRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const swipingCommentRef = useRef<string | null>(null);
  const [swipingCommentId, setSwipingCommentId] = useState<string | null>(null);
  const [swipeDeltaX, setSwipeDeltaX] = useState(0);
  const [isAnimatingReplySwipe, setIsAnimatingReplySwipe] = useState(false);

  // Scroll to bottom when modal opens - useLayoutEffect runs before paint so no visible transition
  useLayoutEffect(() => {
    if (!isOpen) return;
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [isOpen, task.id, task.comments?.length]);

  // Smart auto-scroll when new comments arrive: only scroll if user is already near the bottom
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
  }, [task.comments, isOpen]);

  // Focus input when modal opens; clear reply/edit when closing
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setReplyingTo(null);
      setEditingCommentId(null);
      setShowCommentMenu(false);
    }
  }, [isOpen]);

  // iOS workaround: programmatic focus from touch on non-input doesn't open keyboard.
  // Focus a temp input first (in user gesture), then transfer to real input after ~100ms.
  const focusInputForMobile = () => {
    const el = inputRef.current;
    if (!el) return;
    const isTouchDevice = 'ontouchstart' in window;
    if (isTouchDevice) {
      const temp = document.createElement('input');
      temp.setAttribute('type', 'text');
      temp.setAttribute('aria-hidden', 'true');
      temp.style.cssText = 'position:absolute;opacity:0;pointer-events:none;top:-999px;left:-999px;';
      document.body.appendChild(temp);
      temp.focus();
      setTimeout(() => {
        el.focus();
        el.click();
        try {
          document.body.removeChild(temp);
        } catch {
          /* already removed */
        }
      }, 120);
    } else {
      el.focus();
    }
  };

  // Handle long press for comment menu (Edit / Delete / React), swipe right for reply
  const handleLongPressStart = (comment: Comment, e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    swipeStartRef.current = { x: clientX, y: clientY };
    swipingCommentRef.current = comment.id;

    longPressTimerRef.current = setTimeout(() => {
      const commentEl = commentRefs.current.get(comment.id);
      setCommentMenuPosition({ x: clientX, y: clientY });
      setSelectedCommentForMenu({
        id: comment.id,
        userName: comment.userName,
        text: comment.text,
        userId: comment.userId,
      });
      setSelectedCommentRect(commentEl?.getBoundingClientRect() ?? null);
      setShowCommentMenu(true);
      swipeStartRef.current = null;

      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 300);
  };

  const handleSwipeMove = (clientX: number) => {
    if (!swipeStartRef.current || !swipingCommentRef.current) return;
    const dx = clientX - swipeStartRef.current.x;
    if (Math.abs(dx) > 30 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (dx > 0) {
      setSwipingCommentId(swipingCommentRef.current);
      setSwipeDeltaX(Math.min(dx, 80));
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleSwipeMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleSwipeMove(e.clientX);
  };

  const handleLongPressEnd = (commentId: string, commentUserName: string, e: React.TouchEvent | React.MouseEvent) => {
    const endX = 'changedTouches' in e ? e.changedTouches[0]?.clientX : (e as React.MouseEvent).clientX;
    const startX = swipeStartRef.current?.x ?? endX;
    const deltaX = endX - startX;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Swipe right to reply (deltaX > 60) - runs whether timer fired or was cleared by swipe move
    if (deltaX > 60 && !showCommentMenu) {
      setIsAnimatingReplySwipe(true);
      setSwipeDeltaX(80);
      setReplyingTo({ id: commentId, userName: commentUserName });
      if ('vibrate' in navigator) navigator.vibrate(20);
      focusInputForMobile();
        setTimeout(() => setSwipeDeltaX(0), 30);
        setTimeout(() => {
          setSwipingCommentId(null);
          setSwipeDeltaX(0);
          swipingCommentRef.current = null;
          setIsAnimatingReplySwipe(false);
        }, 260);
    } else {
      setSwipingCommentId(null);
      setSwipeDeltaX(0);
    }
    swipeStartRef.current = null;
    swipingCommentRef.current = null;
  };

  const handleEditComment = () => {
    if (!selectedCommentForMenu || !onEditComment) return;
    setCommentText(selectedCommentForMenu.text);
    setEditingCommentId(selectedCommentForMenu.id);
    setReplyingTo(null);
    setShowCommentMenu(false);
    setSelectedCommentForMenu(null);
    setSelectedCommentRect(null);
    inputRef.current?.focus();
  };

  const handleDeleteComment = async () => {
    if (!selectedCommentForMenu || !onDeleteComment) return;
    try {
      await onDeleteComment(task.id, selectedCommentForMenu.id);
      setShowCommentMenu(false);
      setSelectedCommentForMenu(null);
      setSelectedCommentRect(null);
      setEditingCommentId(null);
    } catch (err) {
      console.error(err);
      alert('Failed to delete comment.');
    }
  };

  const handleQuickEmoji = (emoji: string) => {
    if (selectedCommentForMenu) {
      onAddCommentReaction(task.id, selectedCommentForMenu.id, emoji);
      setShowCommentMenu(false);
      setSelectedCommentForMenu(null);
      setSelectedCommentRect(null);
    }
  };

  const handleReplyFromMenu = () => {
    if (selectedCommentForMenu) {
      setReplyingTo({ id: selectedCommentForMenu.id, userName: selectedCommentForMenu.userName });
      setShowCommentMenu(false);
      setSelectedCommentForMenu(null);
      setSelectedCommentRect(null);
      focusInputForMobile();
    }
  };

  const handleCopyComment = async () => {
    if (!selectedCommentForMenu) return;
    try {
      await navigator.clipboard.writeText(selectedCommentForMenu.text);
      setShowCommentMenu(false);
      setSelectedCommentForMenu(null);
      setSelectedCommentRect(null);
      if ('vibrate' in navigator) navigator.vibrate(20);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = selectedCommentForMenu.text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setShowCommentMenu(false);
      setSelectedCommentForMenu(null);
      setSelectedCommentRect(null);
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
      if (editingCommentId && onEditComment) {
        await onEditComment(task.id, editingCommentId, commentText.trim());
        setEditingCommentId(null);
      } else {
        await onAddComment(task.id, commentText.trim(), replyingTo ?? undefined);
        setReplyingTo(null);
      }
      setCommentText('');

      if ('vibrate' in navigator) {
        navigator.vibrate(30);
      }
    } catch (error) {
      console.error('[CommentsModal] Error:', error);
      alert('Failed to save. Please try again.');
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
          <div ref={scrollContainerRef} className="comment-touchable flex-1 overflow-y-auto p-4 space-y-4">
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
                      className={`flex gap-3 ${isOwnComment ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in slide-in-from-bottom duration-200 transition-all duration-300 ease-out ${
                        showCommentMenu && selectedCommentForMenu?.id === comment.id
                          ? 'scale-[1.01] opacity-100'
                          : showCommentMenu
                          ? 'opacity-40'
                          : ''
                      }`}
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
                          style={{
                            transform: comment.id === swipingCommentId ? `translateX(${swipeDeltaX}px)` : undefined,
                            transition: isAnimatingReplySwipe ? 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
                          }}
                          onTouchStart={(e) => handleLongPressStart(comment, e)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={(e) => handleLongPressEnd(comment.id, comment.userName, e)}
                          onMouseDown={(e) => handleLongPressStart(comment, e)}
                          onMouseMove={handleMouseMove}
                          onMouseUp={(e) => handleLongPressEnd(comment.id, comment.userName, e)}
                          onMouseLeave={(e) => handleLongPressEnd(comment.id, comment.userName, e)}
                        >
                          {comment.replyToUserName && (
                            <div className={`text-xs mb-1 flex items-center gap-1 ${
                              isOwnComment ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                            }`}>
                              <FaReply size={10} />
                              <span>Replying to {comment.replyToUserName}</span>
                            </div>
                          )}
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
                            <LinkifyText text={comment.text} linkClassName="text-inherit" />
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
                        
                        <div className={`flex items-center gap-2 mt-1 ${isOwnComment ? 'justify-end' : 'justify-start'}`}>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo({ id: comment.id, userName: comment.userName });
                              inputRef.current?.focus();
                            }}
                            className="hidden md:inline-flex text-xs text-blue-500 dark:text-blue-400 hover:underline items-center gap-0.5"
                          >
                            <FaReply size={10} />
                            Reply
                          </button>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatTime(comment.timestamp)}
                          </span>
                        </div>
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
            {replyingTo && (
              <div className="flex items-center justify-between mb-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <span className="text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                  <FaReply size={12} />
                  Replying to {replyingTo.userName}
                </span>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-full transition-colors"
                  aria-label="Cancel reply"
                >
                  <FaTimes size={12} className="text-blue-600 dark:text-blue-400" />
                </button>
              </div>
            )}
            {editingCommentId && (
              <div className="flex items-center justify-between mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <span className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <FaEdit size={12} />
                  Editing comment
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCommentId(null);
                    setCommentText('');
                  }}
                  className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded-full transition-colors"
                  aria-label="Cancel edit"
                >
                  <FaTimes size={12} className="text-amber-600 dark:text-amber-400" />
                </button>
              </div>
            )}
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
                  placeholder={editingCommentId ? "Edit your comment..." : isOwnTask ? "Add an update..." : "Add a comment..."}
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
              <span className="md:hidden">Swipe right to reply · </span>
              <span className="hidden md:inline">Reply button · </span>
              Hold for Edit/Delete · Enter to send
            </p>
          </form>
        </div>
      </div>

      {/* Comment context menu: floating emojis above, vertical action stack below */}
      {showCommentMenu && selectedCommentForMenu && (
        <>
          <div
            className="fixed inset-0 z-[102] backdrop-blur-md bg-black/25 transition-all duration-300 ease-out"
            onClick={() => {
              setShowCommentMenu(false);
              setSelectedCommentForMenu(null);
              setSelectedCommentRect(null);
            }}
          />
          {/* Floating emojis - no background, above the comment */}
          <div
            className="fixed z-[103] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: selectedCommentRect
                ? selectedCommentRect.left + selectedCommentRect.width / 2
                : commentMenuPosition.x,
              top: selectedCommentRect
                ? selectedCommentRect.top - 48
                : commentMenuPosition.y - 48,
              transform: 'translateX(-50%)',
            }}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleQuickEmoji(emoji)}
                className="w-11 h-11 rounded-full flex items-center justify-center text-2xl transition-all duration-200 hover:scale-125 active:scale-95 drop-shadow-lg"
              >
                {emoji}
              </button>
            ))}
          </div>
          {/* Vertical action menu - WhatsApp style */}
          <div
            className="fixed z-[103] bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200/80 dark:border-gray-600/80 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-[180px]"
            style={{
              left: selectedCommentRect
                ? Math.max(16, Math.min(selectedCommentRect.left + selectedCommentRect.width / 2 - 90, (typeof window !== 'undefined' ? window.innerWidth : 400) - 196))
                : Math.max(16, commentMenuPosition.x - 90),
              top: selectedCommentRect
                ? selectedCommentRect.bottom + 12
                : commentMenuPosition.y + 12,
            }}
          >
            {/* Copy - available for all comments */}
            <button
              type="button"
              onClick={handleCopyComment}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors duration-150 text-[15px]"
            >
              <FaCopy size={15} className="text-gray-500 dark:text-gray-400" />
              Copy
            </button>
            {selectedCommentForMenu.userId === currentUserId ? (
              <>
                {onEditComment && (
                  <button
                    type="button"
                    onClick={handleEditComment}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors duration-150 text-[15px]"
                  >
                    <FaEdit size={15} className="text-gray-500 dark:text-gray-400" />
                    Edit
                  </button>
                )}
                {onDeleteComment && (
                  <button
                    type="button"
                    onClick={handleDeleteComment}
                    className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors duration-150 text-[15px]"
                  >
                    <FaTrash size={15} />
                    Delete for everyone
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={handleReplyFromMenu}
                className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors duration-150 text-[15px]"
              >
                <FaReply size={15} />
                Reply
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
