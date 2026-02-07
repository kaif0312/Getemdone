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
  getDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Task, TaskWithUser, User, Reaction, Comment } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

export function useTasks() {
  const { user, userData } = useAuth();
  const [tasks, setTasks] = useState<TaskWithUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Debug function to check specific task in Firestore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).checkTask = async (taskId: string) => {
        try {
          console.log('[checkTask] Checking task:', taskId);
          console.log('[checkTask] Current user:', user?.uid);
          
          const taskRef = doc(db, 'tasks', taskId);
          const taskDoc = await getDoc(taskRef);
          
          if (taskDoc.exists()) {
            const data = taskDoc.data();
            console.log('[checkTask] ✅ Task EXISTS in Firestore:', data);
            console.log('[checkTask] Task userId:', data.userId);
            console.log('[checkTask] Your userId:', user?.uid);
            console.log('[checkTask] Match?', data.userId === user?.uid);
            return data;
          } else {
            console.log('[checkTask] ❌ Task does NOT exist in Firestore');
            return null;
          }
        } catch (error: any) {
          if (error.code === 'permission-denied') {
            console.error('[checkTask] ⚠️ PERMISSION DENIED - Task exists but you cannot read it');
            console.error('[checkTask] This usually means:');
            console.error('[checkTask] 1. Task has wrong userId (not yours)');
            console.error('[checkTask] 2. Task is private and you are not the owner');
            console.error('[checkTask] 3. Task was deleted from Firestore');
          } else {
            console.error('[checkTask] Error:', error);
          }
          return null;
        }
      };
      
      // Function to list all your tasks directly from Firestore
      (window as any).listMyTasks = async () => {
        if (!user) {
          console.log('[listMyTasks] No user logged in');
          return [];
        }
        
        console.log('[listMyTasks] Current user.uid:', user.uid);
        
        try {
          const tasksRef = collection(db, 'tasks');
          const q = query(tasksRef, where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
          const snapshot = await getDocs(q);
          
          console.log('[listMyTasks] Found', snapshot.docs.length, 'tasks in Firestore for user:', user.uid);
          const tasksList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          tasksList.forEach((task: any, index) => {
            console.log(`[listMyTasks] ${index + 1}. ID: ${task.id} | Text: "${task.text.substring(0, 30)}" | userId: ${task.userId} | Deleted: ${task.deleted || false}`);
          });
          
          console.log('[listMyTasks] Comparing: Current user.uid =', user.uid);
          console.log('[listMyTasks] All tasks have matching userId?', tasksList.every((t: any) => t.userId === user.uid));
          
          return tasksList;
        } catch (error) {
          console.error('[listMyTasks] Error:', error);
          return [];
        }
      };
      
      // Function to test emulator connection
      (window as any).testEmulator = async () => {
        try {
          console.log('[testEmulator] Testing Firestore connection...');
          const testRef = collection(db, '_test');
          const testDoc = await addDoc(testRef, { test: true, timestamp: Date.now() });
          console.log('[testEmulator] ✅ Successfully wrote to Firestore! Doc ID:', testDoc.id);
          await deleteDoc(testDoc);
          console.log('[testEmulator] ✅ Successfully deleted test doc');
          return true;
        } catch (error: any) {
          console.error('[testEmulator] ❌ Failed:', error.message);
          console.error('[testEmulator] Error code:', error.code);
          return false;
        }
      };
      
      // Function to check what user is currently logged in
      (window as any).whoAmI = async () => {
        if (!user) {
          console.log('[whoAmI] No user logged in');
          return null;
        }
        console.log('[whoAmI] Current user from Firebase Auth:');
        console.log('  - UID:', user.uid);
        console.log('  - Email:', user.email);
        console.log('  - Display Name from userData:', userData?.displayName);
        console.log('  - userData object:', userData);
        
        // Check if user document exists in Firestore
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            console.log('[whoAmI] ✅ User document EXISTS in Firestore:', userDoc.data());
          } else {
            console.error('[whoAmI] ❌ User document does NOT exist in Firestore!');
            console.error('[whoAmI] This is why userData is undefined!');
            console.error('[whoAmI] You need to sign out and sign in again to create user document.');
          }
        } catch (error) {
          console.error('[whoAmI] Error checking user document:', error);
        }
        
        return {
          uid: user.uid,
          email: user.email,
          displayName: userData?.displayName,
          userData: userData
        };
      };
      
      // Function to see ALL tasks in current state (regardless of filtering)
      (window as any).debugTasks = () => {
        console.log('[debugTasks] Total tasks in state:', tasks.length);
        console.log('[debugTasks] Current user.uid:', user?.uid);
        
        const myTasks = tasks.filter(t => t.userId === user?.uid);
        const otherTasks = tasks.filter(t => t.userId !== user?.uid);
        
        console.log('[debugTasks] Tasks with MY userId:', myTasks.length);
        myTasks.forEach((t, i) => {
          console.log(`  ${i+1}. ${t.id.substring(0,8)} | "${t.text.substring(0,20)}" | userName: ${t.userName}`);
        });
        
        console.log('[debugTasks] Tasks with OTHER userId:', otherTasks.length);
        otherTasks.forEach((t, i) => {
          console.log(`  ${i+1}. ${t.id.substring(0,8)} | "${t.text.substring(0,20)}" | userId: ${t.userId.substring(0,8)} | userName: ${t.userName}`);
        });
        
        return { myTasks, otherTasks, total: tasks.length };
      };
    }
  }, [user]);

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
    let isInitialLoad = true; // Track if this is the first snapshot
    let quotaExceeded = false; // Circuit breaker to prevent infinite retries
    
    // Page Visibility API - Pause listeners when tab is hidden to save reads
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[useTasks] 📴 Tab hidden - pausing listeners to save reads');
        // Unsubscribe from all listeners when tab is hidden
        unsubscribers.forEach(unsub => unsub());
        unsubscribers.length = 0;
      } else {
        console.log('[useTasks] 📱 Tab visible - listeners will reconnect on next change');
        // Note: Listeners will reconnect automatically when data changes
        // Or we can force a re-render by updating a state, but that's not necessary
        // The effect will re-run if user/userData changes
      }
    };
    
    // Only add visibility listener in browser
    let visibilityHandler: (() => void) | null = null;
    if (typeof window !== 'undefined') {
      visibilityHandler = handleVisibilityChange;
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    
    // Debounced update function to prevent flickering and reduce reads
    const scheduleUpdate = () => {
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      updateTimer = setTimeout(() => {
        const sortedTasks = Array.from(allTasks.values()).sort((a, b) => b.createdAt - a.createdAt);
        console.log('[useTasks] 📤 Updating state with', sortedTasks.length, 'tasks');
        setTasks(sortedTasks);
        setLoading(false);
        isInitialLoad = false; // Mark initial load as complete
      }, 100); // Reduced debounce for faster updates
    };
    
    // Pre-fetch friend names to avoid async delays during snapshot
    const prefetchFriendNames = async () => {
      // Prefetch friend names
      if (userData.friends && userData.friends.length > 0) {
        const promises = userData.friends.map(async (friendId) => {
          if (!friendNameCache.has(friendId)) {
            try {
              const userDoc = await getDoc(doc(db, 'users', friendId));
              if (userDoc.exists()) {
                const name = (userDoc.data() as User).displayName;
                friendNameCache.set(friendId, name);
                // Cache friend name
              }
            } catch (error) {
              console.error('Error fetching friend name:', error);
            }
          }
        });
        await Promise.all(promises);
        // Friend names cached
      }
    };
    
    // CRITICAL FIX: Set up own tasks listener IMMEDIATELY (don't wait for friend names)
    // Query 1: Get user's own tasks (private + public)
    const ownTasksQuery = query(
      tasksRef,
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubOwnTasks = onSnapshot(ownTasksQuery, (snapshot) => {
      if (isInitialLoad) {
        // First load - process all documents
        snapshot.docs.forEach((doc) => {
          const task = { id: doc.id, ...doc.data() } as Task;
          if (task.deleted !== true) {
            allTasks.set(task.id, { ...task, userName: 'You' });
          }
        });
        console.log('[useTasks] ✅ Initial load:', snapshot.docs.length, 'tasks');
      } else {
        // Subsequent updates - only process changes
        snapshot.docChanges().forEach((change) => {
          const task = { id: change.doc.id, ...change.doc.data() } as Task;
          
          if (change.type === 'removed') {
            allTasks.delete(change.doc.id);
          } else {
            if (task.deleted === true) {
              allTasks.delete(change.doc.id);
            } else {
              allTasks.set(task.id, { ...task, userName: 'You' });
            }
          }
        });
      }
      
      scheduleUpdate();
    }, (error) => {
      console.error('[useTasks] ❌ Error in own tasks listener:', error);
      if (error.code === 'resource-exhausted') {
        quotaExceeded = true; // Set circuit breaker
        console.warn('[useTasks] ⚠️ Quota exceeded - using cached tasks, stopping retries');
        // Don't clear tasks - keep showing cached data
        // Schedule update with existing cached tasks
        scheduleUpdate();
        // Show user-friendly message (only once)
        if (typeof window !== 'undefined' && !(window as any).__quotaMessageShown) {
          (window as any).__quotaMessageShown = true;
          const quotaMessage = document.createElement('div');
          quotaMessage.className = 'fixed top-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-md text-center';
          quotaMessage.innerHTML = `
            <p class="font-semibold">⚠️ Firebase Rate Limit</p>
            <p class="text-sm mt-1">Showing cached tasks. Retrying in background...</p>
            <p class="text-xs mt-2 opacity-90">If you just upgraded, it may take a few minutes to activate.</p>
          `;
          document.body.appendChild(quotaMessage);
          setTimeout(() => {
            quotaMessage.remove();
            (window as any).__quotaMessageShown = false;
          }, 10000);
        }
        // Stop retrying - don't let Firebase SDK retry infinitely
        setLoading(false);
        return; // Exit early to prevent retries
      }
      setLoading(false);
    });
    
    unsubscribers.push(unsubOwnTasks);
    console.log('[useTasks] ✅ Own tasks listener set up');

    // Pre-fetch friend names and set up friend tasks listener (can happen async)
    prefetchFriendNames().then(() => {

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
            
            // CRITICAL FIX: Skip if this is actually OUR task (happens if we added ourselves as friend)
            if (task.userId === user.uid) {
              return; // Don't process our own tasks as friend tasks
            }
            
            if (change.type === 'removed') {
              allTasks.delete(change.doc.id);
            } else {
              // Filter out deleted tasks client-side (only if explicitly deleted: true)
              if (task.deleted === true) {
                allTasks.delete(change.doc.id);
              } else {
                // Get friend's name from cache
                const userName = friendNameCache.get(task.userId) || 'Unknown';
                allTasks.set(task.id, { ...task, userName });
              }
            }
          });
          
          scheduleUpdate();
        }, (error) => {
          console.error('Error fetching friend tasks:', error);
          if (error.code === 'resource-exhausted') {
            quotaExceeded = true;
            console.warn('Firestore quota exceeded for friend tasks - stopping retries');
            // Don't retry - just use cached data
            return;
          }
        });
        
        unsubscribers.push(unsubFriendTasks);
      }
    });

    return () => {
      // Cleanup listeners
      quotaExceeded = false; // Reset circuit breaker on cleanup
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      unsubscribers.forEach(unsub => unsub());
      if (typeof window !== 'undefined' && visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
      console.log('[useTasks] 🧹 Cleanup: unsubscribed from', unsubscribers.length, 'listeners');
    };
  }, [user?.uid, userData?.id]); // Use stable IDs instead of whole objects to prevent infinite loops

  const addTask = async (text: string, isPrivate: boolean, dueDate?: number | null) => {
    if (!user) return;

    // Get current max order for user's tasks
    const userTasks = Array.from(tasks).filter(t => t.userId === user.uid && !t.completed);
    const maxOrder = userTasks.length > 0 
      ? Math.max(...userTasks.map(t => t.order || 0))
      : 0;

    const newTask = {
      userId: user.uid,
      text,
      isPrivate,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
      order: maxOrder + 1,
      deleted: false, // Explicitly set deleted to false
      ...(dueDate && { dueDate }), // Only include if set
    };
    
    try {
      const docRef = await addDoc(collection(db, 'tasks'), newTask);
      console.log('[addTask] ✅ Task created:', docRef.id);
    } catch (error: any) {
      console.error('[addTask] ❌ Failed to create task:', error.message);
      if (error.code === 'resource-exhausted') {
        // If Blaze plan was just activated, it may take a few minutes
        throw new Error('Firebase rate limit reached. If you just upgraded to Blaze plan, please wait 2-3 minutes for activation. Otherwise, please wait a moment and try again.');
      }
      throw error;
    }
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

  const updateTask = async (taskId: string, text: string) => {
    if (!user) return;
    
    // Validate text
    const trimmedText = text.trim();
    if (!trimmedText || trimmedText.length === 0) {
      throw new Error('Task text cannot be empty');
    }
    if (trimmedText.length > 500) {
      throw new Error('Task text must be 500 characters or less');
    }

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      text: trimmedText,
    });
  };

  const updateTaskDueDate = async (taskId: string, dueDate: number | null) => {
    if (!user) return;

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      dueDate: dueDate || null,
    });
  };

  const toggleSkipRollover = async (taskId: string, skipRollover: boolean) => {
    if (!user) return;

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      skipRollover: skipRollover,
    });
  };

  const updateTaskNotes = async (taskId: string, notes: string) => {
    if (!user) return;

    const startTime = Date.now();
    const taskRef = doc(db, 'tasks', taskId);
    try {
      await updateDoc(taskRef, {
        notes: notes || null,
      });
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[updateTaskNotes] Slow update: ${duration}ms for task ${taskId}`);
      }
    } catch (error) {
      console.error('[updateTaskNotes] Error updating notes:', error);
      throw error;
    }
  };

  const deleteTask = async (taskId: string) => {
    console.log('[deleteTask] Soft deleting task:', taskId);
    console.trace('[deleteTask] Stack trace:'); // This will show WHO called deleteTask
    
    // Soft delete - mark as deleted instead of permanently removing
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      deleted: true,
      deletedAt: Date.now(),
    });
    console.log('[deleteTask] Task marked as deleted:', taskId);
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
    updateTask,
    updateTaskDueDate,
    updateTaskNotes,
    toggleComplete,
    togglePrivacy,
    toggleCommitment,
    toggleSkipRollover,
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
