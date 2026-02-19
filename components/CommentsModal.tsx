'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Comment, TaskWithUser } from '@/lib/types';
import { FaTimes, FaPaperPlane, FaReply, FaEdit, FaTrash, FaCopy, FaLock, FaInfoCircle } from 'react-icons/fa';
import { LuMessageCircle } from 'react-icons/lu';
import Avatar from './Avatar';
import LinkifyText from './LinkifyText';
import { getAccentForId } from '@/lib/theme';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const GROUP_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

interface CommentsModalProps {
  isOpen: boolean;
  task: TaskWithUser;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
  onAddComment: (taskId: string, text: string, replyTo?: { id: string; userName: string; text?: string }) => void;
  onAddCommentReaction: (taskId: string, commentId: string, emoji: string) => void;
  onEditComment?: (taskId: string, commentId: string, newText: string) => void;
  onDeleteComment?: (taskId: string, commentId: string) => void;
}

function formatTime(timestamp: number): string {
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
}

function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isDecryptError(text: string): boolean {
  return !text || text.includes("[Couldn't decrypt]") || text.includes('decrypt');
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
  const [replyingTo, setReplyingTo] = useState<{ id: string; userName: string; text: string } | null>(null);
  const [reactionTooltip, setReactionTooltip] = useState<{ emoji: string; names: string[]; x: number; y: number } | null>(null);
  const [hintDismissed, setHintDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('comments-hint-dismissed') === '1';
  });

  const dismissHintPermanently = () => {
    setHintDismissed(true);
    if (typeof window !== 'undefined') localStorage.setItem('comments-hint-dismissed', '1');
  };
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

  useLayoutEffect(() => {
    if (!isOpen) return;
    const container = scrollContainerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [isOpen, task.id, task.comments?.length]);

  useEffect(() => {
    if (!isOpen || !commentsEndRef.current || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [task.comments, isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100);
    else {
      setReplyingTo(null);
      setEditingCommentId(null);
      setShowCommentMenu(false);
      setReactionTooltip(null);
    }
  }, [isOpen]);

  const focusInputForMobile = () => {
    const el = inputRef.current;
    if (!el) return;
    if ('ontouchstart' in window) {
      const temp = document.createElement('input');
      temp.setAttribute('type', 'text');
      temp.setAttribute('aria-hidden', 'true');
      temp.style.cssText = 'position:absolute;opacity:0;pointer-events:none;top:-999px;left:-999px;';
      document.body.appendChild(temp);
      temp.focus();
      setTimeout(() => {
        el.focus();
        el.click();
        try { document.body.removeChild(temp); } catch { /* already removed */ }
      }, 120);
    } else el.focus();
  };

  const handleLongPressStart = (comment: Comment, e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    swipeStartRef.current = { x: clientX, y: clientY };
    swipingCommentRef.current = comment.id;
    longPressTimerRef.current = setTimeout(() => {
      const commentEl = commentRefs.current.get(comment.id);
      setCommentMenuPosition({ x: clientX, y: clientY });
      setSelectedCommentForMenu({ id: comment.id, userName: comment.userName, text: comment.text, userId: comment.userId });
      setSelectedCommentRect(commentEl?.getBoundingClientRect() ?? null);
      setShowCommentMenu(true);
      swipeStartRef.current = null;
      if ('vibrate' in navigator) navigator.vibrate(50);
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

  const handleLongPressEnd = (commentId: string, commentUserName: string, e: React.TouchEvent | React.MouseEvent) => {
    const endX = 'changedTouches' in e ? e.changedTouches[0]?.clientX : (e as React.MouseEvent).clientX;
    const startX = swipeStartRef.current?.x ?? endX;
    const deltaX = endX - startX;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (deltaX > 60 && !showCommentMenu) {
      setIsAnimatingReplySwipe(true);
      setSwipeDeltaX(80);
      const comment = comments.find((c) => c.id === commentId);
      setReplyingTo({ id: commentId, userName: commentUserName, text: comment?.text ?? '' });
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
      dismissHintPermanently();
      setShowCommentMenu(false);
      setSelectedCommentForMenu(null);
      setSelectedCommentRect(null);
    }
  };

  const handleReplyFromMenu = () => {
    if (selectedCommentForMenu) {
      setReplyingTo({ id: selectedCommentForMenu.id, userName: selectedCommentForMenu.userName, text: selectedCommentForMenu.text });
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

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isSending) return;

    const textToSend = commentText.trim();
    const replyToSend = replyingTo ? { id: replyingTo.id, userName: replyingTo.userName, text: replyingTo.text } : undefined;
    const editId = editingCommentId;

    setCommentText('');
    setReplyingTo(null);
    setEditingCommentId(null);
    setIsSending(true);
    dismissHintPermanently();

    if ('vibrate' in navigator) navigator.vibrate(30);

    try {
      if (editId && onEditComment) {
        await onEditComment(task.id, editId, textToSend);
      } else {
        await onAddComment(task.id, textToSend, replyToSend);
      }
    } catch (error) {
      console.error('[CommentsModal] Error:', error);
      setCommentText(textToSend);
      if (replyToSend) setReplyingTo({ id: replyToSend.id, userName: replyToSend.userName, text: replyToSend.text ?? '' });
      if (editId) setEditingCommentId(editId);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSending(false);
      setTimeout(() => {
        if ('ontouchstart' in window) focusInputForMobile();
        else inputRef.current?.focus();
      }, 50);
    }
  };

  if (!isOpen) return null;

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

  // Group comments by consecutive same-user within 2 min
  type CommentGroup = { userId: string; userName: string; photoURL?: string; comments: Comment[] };
  const groups: CommentGroup[] = [];
  let currentGroup: CommentGroup | null = null;

  for (const c of comments) {
    const prev = currentGroup?.comments[currentGroup.comments.length - 1];
    const withinWindow = prev && c.timestamp - prev.timestamp <= GROUP_WINDOW_MS;
    if (currentGroup && c.userId === currentGroup.userId && withinWindow) {
      currentGroup.comments.push(c);
    } else {
      currentGroup = { userId: c.userId, userName: c.userName, photoURL: c.photoURL, comments: [c] };
      groups.push(currentGroup);
    }
  }

  // Track last date for separators
  let lastDateStr = '';

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/40 md:bg-black/30 animate-in fade-in duration-200" onClick={onClose} />

      {/* Mobile: bottom sheet 90%, surface. Desktop: side panel 420px or modal 500px */}
      <div
        className="fixed z-[101] flex flex-col
          md:right-0 md:top-0 md:w-[420px] md:h-full md:rounded-none md:border-l md:border-border-subtle md:shadow-[-4px_0_16px_rgba(0,0,0,0.1)]
          inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl
          bg-surface md:bg-elevated
          animate-in slide-in-from-bottom md:slide-in-from-right duration-250 ease-out"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Drag handle - mobile only */}
        <div className="flex justify-center pt-3 pb-2 md:hidden flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-fg-tertiary/30" aria-hidden />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 border-b border-border-subtle px-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <LuMessageCircle size={18} className="text-fg-secondary flex-shrink-0" />
                <h2 className="text-base font-semibold text-fg-primary">Comments</h2>
              </div>
              <p className="text-sm text-fg-secondary truncate">{task.text}</p>
            </div>
            <button
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center -m-2 text-fg-secondary hover:text-fg-primary rounded-lg transition-colors"
              aria-label="Close"
            >
              <FaTimes size={20} />
            </button>
          </div>
        </div>

        {/* Comments List */}
        <div
          ref={scrollContainerRef}
          className="comments-scroll comment-touchable flex-1 overflow-y-auto min-h-0 p-4"
        >
          {comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center py-12">
              <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mb-4">
                <LuMessageCircle className="text-fg-tertiary" size={28} />
              </div>
              <p className="text-fg-secondary text-sm font-medium mb-1">No comments yet</p>
              <p className="text-fg-tertiary text-sm">Start the conversation!</p>
            </div>
          ) : (
            <div className="space-y-1">
              {groups.map((group) =>
                group.comments.map((comment, idxInGroup) => {
                  const isOwnComment = comment.userId === currentUserId;
                  const isTaskOwner = comment.userId === task.userId;
                  const isFirstInGroup = idxInGroup === 0;
                  const isLastInGroup = idxInGroup === group.comments.length - 1;
                  const reactions = comment.reactions || [];
                  const reactionGroups = reactions.reduce((acc, r) => {
                    if (!acc[r.emoji]) acc[r.emoji] = [];
                    acc[r.emoji].push(r);
                    return acc;
                  }, {} as Record<string, typeof reactions>);

                  const dateStr = formatDateLabel(comment.timestamp);
                  const showDateSeparator = dateStr !== lastDateStr;
                  if (showDateSeparator) lastDateStr = dateStr;

                  const isDecryptErr = isDecryptError(comment.text);
                  const accent = getAccentForId(comment.userId);

                  return (
                    <div key={`${comment.id}-${idxInGroup}`}>
                      {showDateSeparator && (
                        <div className="flex justify-center my-4">
                          <span className="inline-flex px-3 py-1 text-[11px] text-fg-tertiary bg-surface-muted border border-border-subtle rounded-full">
                            {dateStr}
                          </span>
                        </div>
                      )}
                      <div
                        ref={(el) => {
                          if (el) commentRefs.current.set(comment.id, el);
                          else commentRefs.current.delete(comment.id);
                        }}
                        className={`flex gap-2 ${isOwnComment ? 'flex-row-reverse' : 'flex-row'} ${
                          isFirstInGroup ? (isLastInGroup ? '' : 'mb-1') : 'mt-1'
                        } ${!isFirstInGroup ? 'gap-2' : ''}`}
                        style={{
                          marginTop: !isFirstInGroup ? 4 : undefined,
                        }}
                      >
                        {/* Avatar - only on last in group */}
                        {isLastInGroup ? (
                          <div className="flex-shrink-0 mt-1">
                            <Avatar
                              photoURL={comment.photoURL}
                              displayName={comment.userName}
                              size="xs"
                              gradientFrom={accent.from}
                              gradientTo={accent.to}
                              className="w-7 h-7"
                            />
                          </div>
                        ) : (
                          <div className="w-7 flex-shrink-0" />
                        )}

                        <div className={`flex-1 max-w-[75%] flex flex-col ${isOwnComment ? 'items-end' : 'items-start'}`}>
                          {/* Name label - only on first in group for others */}
                          {!isOwnComment && isFirstInGroup && (
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-primary">{comment.userName}</span>
                              {isTaskOwner && (
                                <span className="text-[10px] text-fg-secondary bg-surface-muted border border-border-subtle px-1.5 py-0.5 rounded-full">
                                  Task Owner
                                </span>
                              )}
                            </div>
                          )}

                          {/* Bubble */}
                          <div
                            className={`rounded-2xl px-4 py-2.5 max-w-full select-none ${
                              isDecryptErr
                                ? 'border border-dashed border-fg-tertiary/30 bg-transparent'
                                : isOwnComment
                                ? 'bg-primary/15 text-fg-primary rounded-br-sm'
                                : 'bg-elevated text-fg-primary rounded-bl-sm'
                            }`}
                            style={{
                              transform: comment.id === swipingCommentId ? `translateX(${swipeDeltaX}px)` : undefined,
                              transition: isAnimatingReplySwipe ? 'transform 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
                            }}
                            onTouchStart={(e) => handleLongPressStart(comment, e)}
                            onTouchMove={(e) => handleSwipeMove(e.touches[0].clientX)}
                            onTouchEnd={(e) => handleLongPressEnd(comment.id, comment.userName, e)}
                            onMouseDown={(e) => handleLongPressStart(comment, e)}
                            onMouseMove={(e) => handleSwipeMove(e.clientX)}
                            onMouseUp={(e) => handleLongPressEnd(comment.id, comment.userName, e)}
                            onMouseLeave={(e) => handleLongPressEnd(comment.id, comment.userName, e)}
                          >
                            {/* Reply-to quote block */}
                            {comment.replyToUserName && (
                              <div className="mb-2 pl-2 border-l-2 border-fg-tertiary/50 bg-black/5 dark:bg-white/5 rounded-r py-1 pr-2">
                                <div className="text-[11px] font-semibold text-fg-secondary">{comment.replyToUserName}</div>
                                {comment.replyToText && (
                                  <p className="text-xs text-fg-tertiary truncate mt-0.5">{comment.replyToText}</p>
                                )}
                              </div>
                            )}

                            {/* Message content */}
                            {isDecryptErr ? (
                              <div className="flex items-center gap-2 text-fg-tertiary italic text-sm">
                                <FaLock size={14} />
                                <span>Message unavailable</span>
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap break-words">
                                <LinkifyText text={comment.text} linkClassName="text-primary underline" />
                              </p>
                            )}
                          </div>

                          {/* Reactions - below bubble, left-aligned */}
                          {Object.keys(reactionGroups).length > 0 && (
                            <div className={`flex items-center gap-1.5 mt-1.5 flex-wrap ${isOwnComment ? 'justify-end' : 'justify-start'}`}>
                              {Object.entries(reactionGroups).map(([emoji, emojiReactions]) => {
                                const hasUserReaction = emojiReactions.some((r) => r.userId === currentUserId);
                                const names = emojiReactions.map((r) => r.userName);
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() => onAddCommentReaction(task.id, comment.id, emoji)}
                                    onTouchStart={(e) => {
                                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                                      setReactionTooltip({ emoji, names, x: rect.left + rect.width / 2, y: rect.top });
                                    }}
                                    onTouchEnd={() => setReactionTooltip(null)}
                                    onMouseEnter={(e) => {
                                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                      setReactionTooltip({ emoji, names, x: rect.left + rect.width / 2, y: rect.top });
                                    }}
                                    onMouseLeave={() => setReactionTooltip(null)}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                                      hasUserReaction
                                        ? 'bg-primary/8 border border-primary'
                                        : 'bg-surface-muted border border-border-subtle hover:bg-surface-muted/80'
                                    }`}
                                  >
                                    <span>{emoji}</span>
                                    <span className="text-fg-secondary font-medium">{emojiReactions.length}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Timestamp - only on last in group */}
                          {isLastInGroup && (
                            <span className="text-[12px] text-fg-tertiary mt-1">
                              {formatTime(comment.timestamp)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={commentsEndRef} />
            </div>
          )}
        </div>

        {/* Input bar - sticky bottom */}
        <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-border-subtle p-4 bg-surface md:bg-elevated">
          {replyingTo && (
            <div className="flex items-start justify-between gap-2 mb-2 px-3 py-2.5 bg-primary/10 rounded-lg border border-primary/20">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-primary flex items-center gap-1.5 mb-0.5">
                  <FaReply size={10} />
                  Replying to {replyingTo.userName}
                </div>
                <p className="text-sm text-fg-secondary line-clamp-2">{replyingTo.text || '...'}</p>
              </div>
              <button type="button" onClick={() => setReplyingTo(null)} className="p-1.5 hover:bg-primary/20 rounded-full flex-shrink-0" aria-label="Cancel reply">
                <FaTimes size={12} className="text-primary" />
              </button>
            </div>
          )}
          {editingCommentId && (
            <div className="flex items-center justify-between mb-2 px-3 py-2 bg-warning-bg rounded-lg border border-warning-border">
              <span className="text-sm text-warning-text flex items-center gap-2">
                <FaEdit size={12} />
                Editing comment
              </span>
              <button type="button" onClick={() => { setEditingCommentId(null); setCommentText(''); }} className="p-1 hover:bg-warning-bg/80 rounded-full" aria-label="Cancel edit">
                <FaTimes size={12} className="text-warning-text" />
              </button>
            </div>
          )}
          <div className="relative flex items-end">
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
              placeholder={editingCommentId ? 'Edit your comment...' : isOwnTask ? 'Add an update...' : 'Add a comment...'}
              className="w-full pl-4 pr-12 py-2.5 bg-background text-fg-primary placeholder:text-fg-tertiary rounded-full resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
              rows={1}
              style={{ minHeight: '44px', height: 'auto' }}
            />
            <button
              type="submit"
              disabled={!commentText.trim() || isSending}
              className={`absolute right-2 bottom-2 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                commentText.trim() && !isSending
                  ? 'bg-primary text-on-accent active:scale-95'
                  : 'opacity-0 pointer-events-none'
              }`}
              aria-label="Send"
            >
              <FaPaperPlane size={14} className={isSending ? 'animate-pulse' : ''} />
            </button>
          </div>
          {!hintDismissed && (
            <p className="text-[11px] text-fg-tertiary/50 mt-2 text-center">
              Swipe right to reply · Hold for Edit/Delete · Enter to send
            </p>
          )}
        </form>
      </div>

      {/* Reaction tooltip - who reacted */}
      {reactionTooltip && (
        <div
          className="fixed z-[104] px-3 py-2 bg-elevated border border-border-subtle rounded-lg shadow-elevation-2 text-sm text-fg-primary"
          style={{
            left: reactionTooltip.x,
            top: reactionTooltip.y - 40,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-medium mb-1">{reactionTooltip.emoji} reacted</div>
          <div className="text-xs text-fg-secondary">{reactionTooltip.names.join(', ')}</div>
        </div>
      )}

      {/* Comment context menu */}
      {showCommentMenu && selectedCommentForMenu && (
        <>
          <div
            className="fixed inset-0 z-[102] backdrop-blur-md bg-black/25"
            onClick={() => {
              setShowCommentMenu(false);
              setSelectedCommentForMenu(null);
              setSelectedCommentRect(null);
            }}
          />
          <div
            className="fixed z-[103] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: selectedCommentRect ? selectedCommentRect.left + selectedCommentRect.width / 2 : commentMenuPosition.x,
              top: selectedCommentRect ? selectedCommentRect.top - 48 : commentMenuPosition.y - 48,
              transform: 'translateX(-50%)',
            }}
          >
            {QUICK_EMOJIS.map((emoji) => (
              <button key={emoji} type="button" onClick={() => handleQuickEmoji(emoji)} className="w-11 h-11 rounded-full flex items-center justify-center text-2xl transition-all hover:scale-125 active:scale-95">
                {emoji}
              </button>
            ))}
          </div>
          <div
            className="fixed z-[103] bg-elevated rounded-2xl shadow-elevation-2 border border-border-subtle overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 min-w-[180px]"
            style={{
              left: selectedCommentRect
                ? Math.max(16, Math.min(selectedCommentRect.left + selectedCommentRect.width / 2 - 90, (typeof window !== 'undefined' ? window.innerWidth : 400) - 196))
                : Math.max(16, commentMenuPosition.x - 90),
              top: selectedCommentRect ? selectedCommentRect.bottom + 12 : commentMenuPosition.y + 12,
            }}
          >
            <button type="button" onClick={handleCopyComment} className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-fg-primary hover:bg-surface-muted text-sm">
              <FaCopy size={15} className="text-fg-tertiary" />
              Copy
            </button>
            {selectedCommentForMenu.userId === currentUserId ? (
              <>
                {onEditComment && (
                  <button type="button" onClick={handleEditComment} className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-fg-primary hover:bg-surface-muted text-sm">
                    <FaEdit size={15} className="text-fg-tertiary" />
                    Edit
                  </button>
                )}
                {onDeleteComment && (
                  <button type="button" onClick={handleDeleteComment} className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-error hover:bg-error/10 text-sm">
                    <FaTrash size={15} />
                    Delete for everyone
                  </button>
                )}
              </>
            ) : (
              <button type="button" onClick={handleReplyFromMenu} className="w-full px-4 py-3.5 flex items-center gap-3 text-left text-primary hover:bg-primary/10 text-sm">
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
