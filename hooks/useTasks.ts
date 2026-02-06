'use client';

import { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Task, TaskWithUser, User, Reaction, Comment } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

export function useTasks() {
  const { user, userData } = useAuth();
  const [tasks, setTasks] = useState<TaskWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !userData) {
      setTasks([]);
      setLoading(false);
      return;
    }

    const tasksRef = collection(db, 'tasks');
    const unsubscribers: (() => void)[] = [];
    const allTasks = new Map<string, TaskWithUser>();
    const friendNameCache = new Map<string, string>();
    let updateTimer: NodeJS.Timeout | null = null;
    
    // Debounced update function to prevent flickering and reduce reads
    const scheduleUpdate = () => {
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      updateTimer = setTimeout(() => {
        const sortedTasks = Array.from(allTasks.values()).sort((a, b) => b.createdAt - a.createdAt);
        setTasks(sortedTasks);
        setLoading(false);
      }, 300); // 300ms debounce to reduce Firestore reads
    };
    
    // Pre-fetch friend names to avoid async delays during snapshot
    const prefetchFriendNames = async () => {
      if (userData.friends && userData.friends.length > 0) {
        const promises = userData.friends.map(async (friendId) => {
          if (!friendNameCache.has(friendId)) {
            try {
              const userDoc = await getDoc(doc(db, 'users', friendId));
              if (userDoc.exists()) {
                friendNameCache.set(friendId, (userDoc.data() as User).displayName);
              }
            } catch (error) {
              console.error('Error fetching friend name:', error);
            }
          }
        });
        await Promise.all(promises);
      }
    };
    
    // Pre-fetch friend names before setting up listeners
    prefetchFriendNames().then(() => {
      // Query 1: Get user's own tasks (private + public)
      const ownTasksQuery = query(
        tasksRef,
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const unsubOwnTasks = onSnapshot(ownTasksQuery, (snapshot) => {
        // Only process actual changes to reduce reads
        snapshot.docChanges().forEach((change) => {
          const task = { id: change.doc.id, ...change.doc.data() } as Task;
          
          if (change.type === 'removed') {
            allTasks.delete(change.doc.id);
          } else {
            // Filter out deleted tasks client-side
            if (!task.deleted) {
              allTasks.set(task.id, { ...task, userName: 'You' });
            } else {
              // Remove from map if it was marked as deleted
              allTasks.delete(change.doc.id);
            }
          }
        });
        
        scheduleUpdate();
      }, (error) => {
        console.error('Error fetching own tasks:', error);
        if (error.code === 'resource-exhausted') {
          alert('Firestore quota exceeded. Please wait a moment and refresh the page.');
        }
        setLoading(false);
      });
      
      unsubscribers.push(unsubOwnTasks);

      // Query 2: Get friends' public tasks (only if there are friends)
      if (userData.friends && userData.friends.length > 0) {
        // Limit to first 10 friends to reduce quota usage
        const maxFriends = Math.min(userData.friends.length, 10);
        const friendsToQuery = userData.friends.slice(0, maxFriends);
        
        const friendTasksQuery = query(
          tasksRef,
          where('userId', 'in', friendsToQuery),
          where('isPrivate', '==', false),
          orderBy('createdAt', 'desc')
        );

        const unsubFriendTasks = onSnapshot(friendTasksQuery, (snapshot) => {
          // Only process actual changes to reduce reads
          snapshot.docChanges().forEach((change) => {
            const task = { id: change.doc.id, ...change.doc.data() } as Task;
            
            if (change.type === 'removed') {
              allTasks.delete(change.doc.id);
            } else {
              // Filter out deleted tasks client-side
              if (!task.deleted) {
                // Get friend's name from cache
                const userName = friendNameCache.get(task.userId) || 'Unknown';
                allTasks.set(task.id, { ...task, userName });
              } else {
                // Remove from map if it was marked as deleted
                allTasks.delete(change.doc.id);
              }
            }
          });
          
          scheduleUpdate();
        }, (error) => {
          console.error('Error fetching friend tasks:', error);
          if (error.code === 'resource-exhausted') {
            console.warn('Firestore quota exceeded for friend tasks');
          }
        });
        
        unsubscribers.push(unsubFriendTasks);
      }
    });

    return () => {
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      unsubscribers.forEach(unsub => unsub());
    };
  }, [user, userData]);

  const addTask = async (text: string, isPrivate: boolean) => {
    if (!user) return;

    // Get current max order for user's tasks
    const userTasks = Array.from(tasks).filter(t => t.userId === user.uid && !t.completed);
    const maxOrder = userTasks.length > 0 
      ? Math.max(...userTasks.map(t => t.order || 0))
      : 0;

    await addDoc(collection(db, 'tasks'), {
      userId: user.uid,
      text,
      isPrivate,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
      order: maxOrder + 1,
    });
  };

  const toggleComplete = async (taskId: string, completed: boolean) => {
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      completed,
      completedAt: completed ? Date.now() : null,
    });
  };

  const togglePrivacy = async (taskId: string, isPrivate: boolean) => {
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      isPrivate,
    });
  };

  const toggleCommitment = async (taskId: string, committed: boolean) => {
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      committed,
    });
  };

  const deleteTask = async (taskId: string) => {
    // Soft delete - mark as deleted instead of permanently removing
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      deleted: true,
      deletedAt: Date.now(),
    });
  };

  const restoreTask = async (taskId: string) => {
    // Restore a deleted task
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      deleted: false,
      deletedAt: null,
    });
  };

  const permanentlyDeleteTask = async (taskId: string) => {
    // Permanently delete task from database
    await deleteDoc(doc(db, 'tasks', taskId));
  };

  const getDeletedTasks = () => {
    // This will be used by the RecycleBin component
    return new Promise<TaskWithUser[]>((resolve) => {
      if (!user) {
        resolve([]);
        return;
      }

      const tasksRef = collection(db, 'tasks');
      const deletedQuery = query(
        tasksRef,
        where('userId', '==', user.uid),
        where('deleted', '==', true),
        orderBy('deletedAt', 'desc')
      );

      const unsubscribe = onSnapshot(deletedQuery, (snapshot) => {
        const deletedTasks = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          userName: 'You',
        })) as TaskWithUser[];
        
        unsubscribe(); // Unsubscribe immediately after getting data
        resolve(deletedTasks);
      }, (error) => {
        console.error('Error fetching deleted tasks:', error);
        resolve([]);
      });
    });
  };

  const addReaction = async (taskId: string, emoji: string) => {
    if (!user || !userData) return;

    const taskRef = doc(db, 'tasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) return;

    const task = taskDoc.data() as Task;
    const reactions = task.reactions || [];
    
    // Check if user already reacted with this emoji
    const existingReaction = reactions.find(
      r => r.userId === user.uid && r.emoji === emoji
    );

    if (existingReaction) {
      // Remove reaction if clicking same emoji
      const updatedReactions = reactions.filter(
        r => !(r.userId === user.uid && r.emoji === emoji)
      );
      await updateDoc(taskRef, { reactions: updatedReactions });
    } else {
      // Remove any previous reaction from this user and add new one
      const updatedReactions = reactions.filter(r => r.userId !== user.uid);
      const newReaction: Reaction = {
        userId: user.uid,
        emoji,
        userName: userData.displayName,
        timestamp: Date.now(),
      };
      updatedReactions.push(newReaction);
      await updateDoc(taskRef, { reactions: updatedReactions });
    }
  };

  const addComment = async (taskId: string, text: string) => {
    if (!user || !userData) {
      console.error('[addComment] No user or userData');
      return;
    }

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        console.error('[addComment] Task does not exist:', taskId);
        return;
      }

      const task = taskDoc.data() as Task;
      const comments = task.comments || [];
      
      const newComment: Comment = {
        id: `${user.uid}_${Date.now()}`,
        userId: user.uid,
        userName: userData.displayName,
        text: text.substring(0, 500), // Limit to 500 characters
        timestamp: Date.now(),
      };

      comments.push(newComment);
      
      console.log('[addComment] Adding comment to task:', taskId, 'Current comments:', comments.length);
      await updateDoc(taskRef, { comments });
      console.log('[addComment] Comment added successfully');
    } catch (error) {
      console.error('[addComment] Error adding comment:', error);
      throw error;
    }
  };

  const deferTask = async (taskId: string, deferToDate: string) => {
    if (!user) return;

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      deferredTo: deferToDate,
      completed: false,
      completedAt: null,
    });
  };

  const reorderTasks = async (taskId: string, newOrder: number) => {
    if (!user) return;

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      order: newOrder,
    });
  };

  return {
    tasks,
    loading,
    addTask,
    toggleComplete,
    togglePrivacy,
    toggleCommitment,
    deleteTask,
    restoreTask,
    permanentlyDeleteTask,
    getDeletedTasks,
    addReaction,
    addComment,
    deferTask,
    reorderTasks,
  };
}
