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
      
      // Function to check what user is currently logged in
      (window as any).whoAmI = () => {
        if (!user) {
          console.log('[whoAmI] No user logged in');
          return null;
        }
        console.log('[whoAmI] Current user:');
        console.log('  - UID:', user.uid);
        console.log('  - Email:', user.email);
        console.log('  - Display Name:', userData?.displayName);
        return {
          uid: user.uid,
          email: user.email,
          displayName: userData?.displayName
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
    console.log('[useTasks] useEffect triggered, user:', user?.uid.substring(0, 8), 'userData:', userData?.displayName);
    
    if (!user || !userData) {
      console.log('[useTasks] No user/userData, clearing tasks');
      setTasks([]);
      setLoading(false);
      return;
    }

    console.log('[useTasks] Setting up listeners for user:', user.uid.substring(0, 8));
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
        console.log('[useTasks] Updating tasks state, total tasks:', sortedTasks.length);
        sortedTasks.forEach(t => {
          console.log('  - Task:', t.id.substring(0, 8), 'User:', t.userName, 'Comments:', t.comments?.length || 0);
        });
        setTasks(sortedTasks);
        setLoading(false);
      }, 300); // 300ms debounce to reduce Firestore reads
    };
    
    // Pre-fetch friend names to avoid async delays during snapshot
    const prefetchFriendNames = async () => {
      console.log('[useTasks] Prefetching friend names, friends count:', userData.friends?.length || 0);
      if (userData.friends && userData.friends.length > 0) {
        const promises = userData.friends.map(async (friendId) => {
          if (!friendNameCache.has(friendId)) {
            try {
              const userDoc = await getDoc(doc(db, 'users', friendId));
              if (userDoc.exists()) {
                const name = (userDoc.data() as User).displayName;
                friendNameCache.set(friendId, name);
                console.log('[useTasks] Cached friend name:', friendId.substring(0, 8), '->', name);
              }
            } catch (error) {
              console.error('Error fetching friend name:', error);
            }
          }
        });
        await Promise.all(promises);
        console.log('[useTasks] Friend names cached, total:', friendNameCache.size);
      }
    };
    
    // Pre-fetch friend names before setting up listeners
    prefetchFriendNames().then(() => {
      console.log('[useTasks] Setting up own tasks query for userId:', user.uid.substring(0, 8));
      
      // Query 1: Get user's own tasks (private + public)
      const ownTasksQuery = query(
        tasksRef,
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      
      console.log('[useTasks] Own tasks query created, starting listener...');

      const unsubOwnTasks = onSnapshot(ownTasksQuery, (snapshot) => {
        console.log('[useTasks] Own tasks snapshot received, total docs:', snapshot.docs.length, 'changes:', snapshot.docChanges().length);
        console.log('[useTasks] All own tasks in snapshot:', snapshot.docs.map(d => ({
          id: d.id.substring(0, 8),
          text: d.data().text.substring(0, 20),
          deleted: d.data().deleted
        })));
        
        // Only process actual changes to reduce reads
        snapshot.docChanges().forEach((change) => {
          const task = { id: change.doc.id, ...change.doc.data() } as Task;
          console.log('[useTasks] Own task change:', change.type, task.id, 'userId:', task.userId, 'Expected:', user.uid, 'Match:', task.userId === user.uid, 'Deleted:', task.deleted);
          
          if (change.type === 'removed') {
            console.log('[useTasks] Task removed from Firestore:', change.doc.id);
            allTasks.delete(change.doc.id);
          } else {
            // Filter out deleted tasks client-side (only if explicitly deleted: true)
            if (task.deleted === true) {
              console.log('[useTasks] Task is soft-deleted, removing from map:', task.id);
              allTasks.delete(change.doc.id);
            } else {
              console.log('[useTasks] Adding/updating task in map:', task.id, 'with userName: You');
              allTasks.set(task.id, { ...task, userName: 'You' });
            }
          }
        });
        
        console.log('[useTasks] Total tasks in map after own tasks update:', allTasks.size);
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
        
        console.log('[useTasks] Setting up friend tasks query for friends:', friendsToQuery.map(f => f.substring(0, 8)));
        
        const friendTasksQuery = query(
          tasksRef,
          where('userId', 'in', friendsToQuery),
          where('isPrivate', '==', false),
          orderBy('createdAt', 'desc')
        );

        const unsubFriendTasks = onSnapshot(friendTasksQuery, (snapshot) => {
          console.log('[useTasks] Friend tasks snapshot received, changes:', snapshot.docChanges().length);
          
          // Only process actual changes to reduce reads
          snapshot.docChanges().forEach((change) => {
            const task = { id: change.doc.id, ...change.doc.data() } as Task;
            console.log('[useTasks] Friend task change:', change.type, task.id, 'User:', task.userId, 'Deleted:', task.deleted, 'Comments:', task.comments?.length || 0);
            
            // CRITICAL FIX: Skip if this is actually OUR task (happens if we added ourselves as friend)
            if (task.userId === user.uid) {
              console.log('[useTasks] Skipping friend task - it is actually OUR task:', task.id);
              return; // Don't process our own tasks as friend tasks
            }
            
            if (change.type === 'removed') {
              console.log('[useTasks] Friend task removed from Firestore:', change.doc.id);
              allTasks.delete(change.doc.id);
            } else {
              // Filter out deleted tasks client-side (only if explicitly deleted: true)
              if (task.deleted === true) {
                console.log('[useTasks] Friend task is soft-deleted, removing from map:', task.id);
                allTasks.delete(change.doc.id);
              } else {
                // Get friend's name from cache
                const userName = friendNameCache.get(task.userId) || 'Unknown';
                console.log('[useTasks] Adding/updating friend task in map:', task.id, 'userName:', userName);
                allTasks.set(task.id, { ...task, userName });
              }
            }
          });
          
          console.log('[useTasks] Total tasks in map after friend tasks update:', allTasks.size);
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
      console.log('[useTasks] Cleaning up listeners');
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      unsubscribers.forEach(unsub => unsub());
      console.log('[useTasks] Cleanup complete, unsubscribed from', unsubscribers.length, 'listeners');
    };
  }, [user, userData]);

  const addTask = async (text: string, isPrivate: boolean) => {
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
    };
    
    console.log('[addTask] Creating new task:', newTask);
    const docRef = await addDoc(collection(db, 'tasks'), newTask);
    console.log('[addTask] Task created successfully with ID:', docRef.id);
    
    // Verify task was created by reading it back
    const verifyDoc = await getDoc(docRef);
    if (verifyDoc.exists()) {
      console.log('[addTask] Verified task exists in Firestore:', verifyDoc.data());
    } else {
      console.error('[addTask] ERROR: Task not found after creation!');
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
