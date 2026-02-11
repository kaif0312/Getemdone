'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
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
import { db, storage } from '@/lib/firebase';
import { Task, TaskWithUser, User, Reaction, Comment, Attachment } from '@/lib/types';
import { ref, deleteObject } from 'firebase/storage';
import { useAuth } from '@/contexts/AuthContext';
import { updateUserStorageUsage } from '@/utils/storageManager';
import { useEncryption } from '@/hooks/useEncryption';

export function useTasks() {
  const { user, userData } = useAuth();
  const { 
    isInitialized: encryptionInitialized, 
    encryptForSelf, 
    decryptForSelf, 
    encryptForFriend, 
    decryptFromFriend 
  } = useEncryption();
  const [tasks, setTasks] = useState<TaskWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [userStorageUsage, setUserStorageUsage] = useState(0);
  
  // Force reconnection trigger - incrementing this will cause listeners to reconnect
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  
  // Create stable key for friends list to avoid infinite loops
  // Use ref to track last value and only update if contents actually changed
  const lastFriendsKeyRef = useRef<string>('');
  const lastSetupKeyRef = useRef<string>('');
  const lastFriendsContentRef = useRef<string>('');
  const listenersActiveRef = useRef<boolean>(false);
  
  // Calculate friends key only when contents actually change
  // Create a stable string representation of friends for dependency comparison
  // Must use useMemo to ensure hooks are called in the same order every render
  const friendsContentKey = useMemo(() => {
    const friendsArray = userData?.friends || [];
    return friendsArray.length === 0 
      ? '' 
      : [...friendsArray].sort().join(',');
  }, [userData?.friends?.length, userData?.friends ? userData.friends.slice().sort().join(',') : '']);
  
  // Update refs only when content actually changes (inside useMemo to maintain hook order)
  const stableFriendsKey = useMemo(() => {
    // Only update if content actually changed
    if (lastFriendsContentRef.current !== friendsContentKey) {
      lastFriendsContentRef.current = friendsContentKey;
      lastFriendsKeyRef.current = friendsContentKey;
    }
    
    return lastFriendsKeyRef.current;
  }, [friendsContentKey]); // Depend on the stable content key
  
  // Create stable setup key to prevent re-running effect unnecessarily
  // Use stable IDs instead of object references
  // Include reconnectTrigger to force reconnection when needed
  const userId = user?.uid || null;
  const userDataId = userData?.id || null;
  const setupKey = useMemo(() => {
    return `${userId || ''}_${userDataId || ''}_${stableFriendsKey}_${reconnectTrigger}`;
  }, [userId, userDataId, stableFriendsKey, reconnectTrigger]);

  // Debug function to check specific task in Firestore (development only)
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
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
      
      // Function to list all your tasks directly from Firestore (development only)
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
      
      // Function to test emulator connection (development only)
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
      
      // Function to check what user is currently logged in (development only)
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

  // Real-time listener for user storage usage
  useEffect(() => {
    if (!user?.uid) {
      setUserStorageUsage(0);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as User;
        setUserStorageUsage(userData.storageUsed || 0);
      }
    }, (error) => {
      console.error('Error listening to storage usage:', error);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!userId || !userDataId) {
      setTasks([]);
      setLoading(false);
      lastSetupKeyRef.current = '';
      return;
    }
    
    // CRITICAL: Only set up listeners if setup key actually changed
    // This prevents infinite loops when userData object reference changes but data is the same
    if (lastSetupKeyRef.current === setupKey) {
      return; // Already set up for this user/friends combination, skip re-setup
    }
    lastSetupKeyRef.current = setupKey;
    
    // Capture current values to avoid closure issues
    const currentUserId = userId;
    const currentUserDataId = userDataId;
    const currentFriends = userData?.friends || [];
    const currentFriendsKey = stableFriendsKey;
    
    const tasksRef = collection(db, 'tasks');
    const unsubscribers: (() => void)[] = [];
    const allTasks = new Map<string, TaskWithUser>();
    const friendNameCache = new Map<string, string>();
    let updateTimer: NodeJS.Timeout | null = null;
    let isInitialLoad = true; // Track if this is the first snapshot
    let quotaExceeded = false; // Circuit breaker to prevent infinite retries
    
    // Page Visibility API - Pause listeners when tab is hidden to save reads
    // CRITICAL FIX: Reconnect listeners when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[useTasks] 📴 Tab hidden - pausing listeners to save reads');
        }
        // Unsubscribe from all listeners when tab is hidden
        unsubscribers.forEach(unsub => unsub());
        unsubscribers.length = 0;
        listenersActiveRef.current = false;
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('[useTasks] 📱 Tab visible - reconnecting listeners...');
        }
        // CRITICAL FIX: Force reconnection by incrementing reconnectTrigger
        // This will cause the effect to re-run and set up listeners again
        listenersActiveRef.current = false;
        setReconnectTrigger(prev => prev + 1);
      }
    };
    
    // Network connectivity handlers - reconnect when online
    const handleOnline = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useTasks] 🌐 Network online - checking listeners...');
      }
      // If listeners are not active, reconnect
      if (!listenersActiveRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[useTasks] 🔄 Reconnecting listeners after network restored');
        }
        setReconnectTrigger(prev => prev + 1);
      }
    };
    
    const handleOffline = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useTasks] 📴 Network offline');
      }
    };
    
    // Only add event listeners in browser
    let visibilityHandler: (() => void) | null = null;
    let onlineHandler: (() => void) | null = null;
    let offlineHandler: (() => void) | null = null;
    if (typeof window !== 'undefined') {
      visibilityHandler = handleVisibilityChange;
      onlineHandler = handleOnline;
      offlineHandler = handleOffline;
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }
    
    // Debounced update function to prevent flickering and reduce reads
    const scheduleUpdate = () => {
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      updateTimer = setTimeout(() => {
        const sortedTasks = Array.from(allTasks.values()).sort((a, b) => b.createdAt - a.createdAt);
        if (process.env.NODE_ENV === 'development') {
          console.log('[useTasks] 📤 Updating state with', sortedTasks.length, 'tasks');
        }
        setTasks(sortedTasks);
        setLoading(false);
        isInitialLoad = false; // Mark initial load as complete
      }, 100); // Reduced debounce for faster updates
    };
    
    // Pre-fetch friend names to avoid async delays during snapshot
    const prefetchFriendNames = async () => {
      // Prefetch friend names
      if (currentFriends.length > 0) {
        const promises = currentFriends.map(async (friendId) => {
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
      where('userId', '==', currentUserId),
      orderBy('createdAt', 'desc')
    );

    const unsubOwnTasks = onSnapshot(ownTasksQuery, async (snapshot) => {
      if (isInitialLoad) {
        // First load - process all documents
        for (const docSnap of snapshot.docs) {
          const task = { id: docSnap.id, ...docSnap.data() } as Task;
          if (task.deleted !== true) {
            // Decrypt task text and notes
            if (encryptionInitialized) {
              try {
                task.text = await decryptForSelf(task.text);
                if (task.notes) {
                  task.notes = await decryptForSelf(task.notes);
                }
                // Decrypt comments
                if (task.comments) {
                  task.comments = await Promise.all(
                    task.comments.map(async (comment) => ({
                      ...comment,
                      text: await decryptForSelf(comment.text),
                    }))
                  );
                }
              } catch (error) {
                console.error('[useTasks] Failed to decrypt task:', error);
              }
            }
            allTasks.set(task.id, { ...task, userName: 'You' });
          }
        }
        if (process.env.NODE_ENV === 'development') {
          console.log('[useTasks] ✅ Initial load:', snapshot.docs.length, 'tasks');
        }
      } else {
        // Subsequent updates - only process changes
        for (const change of snapshot.docChanges()) {
          const task = { id: change.doc.id, ...change.doc.data() } as Task;
          
          if (change.type === 'removed') {
            allTasks.delete(change.doc.id);
          } else {
            if (task.deleted === true) {
              allTasks.delete(change.doc.id);
            } else {
              // Decrypt task text and notes
              if (encryptionInitialized) {
                try {
                  task.text = await decryptForSelf(task.text);
                  if (task.notes) {
                    task.notes = await decryptForSelf(task.notes);
                  }
                  // Decrypt comments
                  if (task.comments) {
                    task.comments = await Promise.all(
                      task.comments.map(async (comment) => ({
                        ...comment,
                        text: await decryptForSelf(comment.text),
                      }))
                    );
                  }
                } catch (error) {
                  console.error('[useTasks] Failed to decrypt task:', error);
                }
              }
              allTasks.set(task.id, { ...task, userName: 'You' });
            }
          }
        }
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
    listenersActiveRef.current = true;
    if (process.env.NODE_ENV === 'development') {
      console.log('[useTasks] ✅ Own tasks listener set up');
    }

    // Pre-fetch friend names and set up friend tasks listener (can happen async)
    prefetchFriendNames().then(() => {

      // Query 2: Get friends' public tasks (only if there are friends)
      if (currentFriends.length > 0) {
        // Limit to first 10 friends to reduce quota usage
        const maxFriends = Math.min(currentFriends.length, 10);
        const friendsToQuery = currentFriends.slice(0, maxFriends);
        
        // Query for ALL friend tasks (both private and public) to show private counts
        // Note: Security rules will prevent reading private task content, but we can count them
        const friendTasksQuery = query(
          tasksRef,
          where('userId', 'in', friendsToQuery),
          orderBy('createdAt', 'desc')
        );

        const unsubFriendTasks = onSnapshot(friendTasksQuery, async (snapshot) => {
          // Only process actual changes to reduce reads
          for (const change of snapshot.docChanges()) {
            const task = { id: change.doc.id, ...change.doc.data() } as Task;
            
            // CRITICAL FIX: Skip if this is actually OUR task (happens if we added ourselves as friend)
            if (task.userId === currentUserId) {
              return; // Don't process our own tasks as friend tasks
            }
            
            // CRITICAL FIX: Remove tasks from friends who are no longer in our friends list
            if (!currentFriends.includes(task.userId)) {
              if (process.env.NODE_ENV === 'development') {
                console.log('[useTasks] 🗑️ Removing task from removed friend:', task.id, task.userId);
              }
              allTasks.delete(change.doc.id);
              return;
            }
            
            if (change.type === 'removed') {
              allTasks.delete(change.doc.id);
            } else {
              // Filter out deleted tasks client-side (only if explicitly deleted: true)
              if (task.deleted === true) {
                allTasks.delete(change.doc.id);
              } else {
                // Decrypt friend's task data
                if (encryptionInitialized) {
                  try {
                    // Decrypt task text (friends can see public tasks)
                    if (!task.isPrivate) {
                      task.text = await decryptFromFriend(task.text, task.userId);
                      // Decrypt comments
                      if (task.comments) {
                        task.comments = await Promise.all(
                          task.comments.map(async (comment) => ({
                            ...comment,
                            text: await decryptFromFriend(comment.text, comment.userId),
                          }))
                        );
                      }
                    } else {
                      // For private tasks, we can't decrypt (don't have the key)
                      // But we still show them for counting purposes
                      task.text = '[Private Task]';
                    }
                  } catch (error) {
                    console.error('[useTasks] Failed to decrypt friend task:', error);
                  }
                }
                // Get friend's name from cache
                const userName = friendNameCache.get(task.userId) || 'Unknown';
                allTasks.set(task.id, { ...task, userName });
              }
            }
          }
          
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
        listenersActiveRef.current = true;
      }
    });
    
    // CRITICAL FIX: When friends list changes, immediately remove tasks from removed friends
    // Filter current tasks state to remove tasks from friends no longer in the list
    if (currentFriends.length >= 0) {
      const currentFriendIds = new Set(currentFriends);
      let removedAny = false;
      allTasks.forEach((task, taskId) => {
        // Remove tasks from friends who are no longer in the list (but keep our own tasks)
        if (task.userId !== currentUserId && !currentFriendIds.has(task.userId)) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[useTasks] 🗑️ Removing task from removed friend:', taskId, task.userId);
          }
          allTasks.delete(taskId);
          removedAny = true;
        }
      });
      // Schedule update if we removed any tasks
      if (removedAny) {
        scheduleUpdate();
      }
    }

    // Periodic health check - verify listeners are still active
    // Check every 30 seconds if listeners are active, reconnect if not
    const healthCheckInterval = setInterval(() => {
      if (!document.hidden && !listenersActiveRef.current && unsubscribers.length === 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[useTasks] ⚠️ Health check: Listeners inactive, reconnecting...');
        }
        setReconnectTrigger(prev => prev + 1);
      }
    }, 30000); // Check every 30 seconds

    return () => {
      // Cleanup listeners
      quotaExceeded = false; // Reset circuit breaker on cleanup
      listenersActiveRef.current = false;
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      clearInterval(healthCheckInterval);
      unsubscribers.forEach(unsub => unsub());
      if (typeof window !== 'undefined') {
        if (visibilityHandler) {
          document.removeEventListener('visibilitychange', visibilityHandler);
        }
        if (onlineHandler) {
          window.removeEventListener('online', onlineHandler);
        }
        if (offlineHandler) {
          window.removeEventListener('offline', offlineHandler);
        }
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[useTasks] 🧹 Cleanup: unsubscribed from', unsubscribers.length, 'listeners');
      }
      // Reset setup key on cleanup so effect can run again if needed
      lastSetupKeyRef.current = '';
    };
  }, [userId, userDataId, stableFriendsKey, setupKey]); // Use stable IDs and friendsKey to avoid infinite loops

  const addTask = async (text: string, isPrivate: boolean, dueDate?: number | null, scheduledFor?: string | null) => {
    if (!user) return;

    // Get current max order for user's tasks
    const userTasks = Array.from(tasks).filter(t => t.userId === user.uid && !t.completed);
    const maxOrder = userTasks.length > 0 
      ? Math.max(...userTasks.map(t => t.order || 0))
      : 0;

    // Encrypt task text
    const encryptedText = encryptionInitialized ? await encryptForSelf(text) : text;

    const newTask = {
      userId: user.uid,
      text: encryptedText,
      isPrivate,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
      order: maxOrder + 1,
      deleted: false, // Explicitly set deleted to false
      ...(dueDate && { dueDate }), // Only include if set
      ...(scheduledFor && { deferredTo: scheduledFor }), // Schedule task for future date
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

    // Encrypt task text
    const encryptedText = encryptionInitialized ? await encryptForSelf(trimmedText) : trimmedText;

    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      text: encryptedText,
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

    // Encrypt notes
    const encryptedNotes = notes 
      ? (encryptionInitialized ? await encryptForSelf(notes) : notes)
      : null;

    const startTime = Date.now();
    const taskRef = doc(db, 'tasks', taskId);
    try {
      await updateDoc(taskRef, {
        notes: encryptedNotes,
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
    try {
      // Get task data to check for attachments
      const taskDoc = await getDoc(doc(db, 'tasks', taskId));
      
      if (taskDoc.exists()) {
        const task = taskDoc.data() as Task;
        
        // Delete all attachments from storage first
        if (task.attachments && task.attachments.length > 0) {
          const deletePromises = task.attachments.map(async (attachment) => {
            try {
              // Delete main file
              const mainRef = ref(storage, `attachments/${taskId}/${attachment.id}`);
              await deleteObject(mainRef);
              
              // Delete thumbnail if exists
              if (attachment.thumbnailUrl) {
                const thumbRef = ref(storage, `attachments/${taskId}/${attachment.id}_thumb`);
                await deleteObject(thumbRef);
              }
            } catch (error) {
              // File might not exist, log and continue
              console.warn(`Could not delete attachment ${attachment.id}:`, error);
            }
          });
          
          await Promise.all(deletePromises);
        }
      }
      
      // Permanently delete task from database
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (error) {
      console.error('Error permanently deleting task:', error);
      throw error;
    }
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

  const addCommentReaction = async (taskId: string, commentId: string, emoji: string) => {
    if (!user || !userData) return;

    const taskRef = doc(db, 'tasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) return;

    const task = taskDoc.data() as Task;
    const comments = task.comments || [];
    
    // Find the comment
    const commentIndex = comments.findIndex(c => c.id === commentId);
    if (commentIndex === -1) return;

    const comment = comments[commentIndex];
    const reactions = comment.reactions || [];
    
    // Check if user already reacted with this emoji
    const existingReactionIndex = reactions.findIndex(
      r => r.userId === user.uid && r.emoji === emoji
    );

    const isRemovingReaction = existingReactionIndex !== -1;
    const commentOwnerId = comment.userId; // The person who wrote the comment

    if (isRemovingReaction) {
      // Remove reaction if clicking same emoji
      const updatedReactions = reactions.filter(
        (_, index) => index !== existingReactionIndex
      );
      comments[commentIndex] = {
        ...comment,
        reactions: updatedReactions.length > 0 ? updatedReactions : undefined,
      };
    } else {
      // Remove any previous reaction from this user for this comment and add new one
      const updatedReactions = reactions.filter(r => r.userId !== user.uid);
      const newReaction: Reaction = {
        userId: user.uid,
        emoji,
        userName: userData.displayName,
        timestamp: Date.now(),
      };
      updatedReactions.push(newReaction);
      comments[commentIndex] = {
        ...comment,
        reactions: updatedReactions,
      };
    }

    await updateDoc(taskRef, { comments });

    // Create notification for comment owner if reaction was added (not removed) and it's not their own comment
    if (!isRemovingReaction && commentOwnerId !== user.uid) {
      try {
        const commentOwnerRef = doc(db, 'users', commentOwnerId);
        const commentOwnerDoc = await getDoc(commentOwnerRef);
        
        if (commentOwnerDoc.exists()) {
          const commentOwnerData = commentOwnerDoc.data();
          
          // Check if friend comments notifications are enabled (default to true if not set)
          const friendCommentsEnabled = commentOwnerData.notificationSettings?.friendComments !== false;
          
          if (friendCommentsEnabled) {
            // Encrypt notification data
            const encryptedTaskText = encryptionInitialized 
              ? await encryptForFriend(task.text.substring(0, 50), commentOwnerId)
              : task.text.substring(0, 50);
            const encryptedCommentText = encryptionInitialized 
              ? await encryptForFriend(comment.text.substring(0, 150), commentOwnerId)
              : comment.text.substring(0, 150);

            // Create in-app notification
            const notificationData = {
              userId: commentOwnerId,
              type: 'comment',
              title: `${emoji} ${userData.displayName} reacted to your comment`,
              message: `${userData.displayName} reacted ${emoji} to your comment`,
              taskId: taskId,
              taskText: encryptedTaskText, // Encrypted task text
              fromUserId: user.uid,
              fromUserName: userData.displayName,
              commentText: encryptedCommentText, // Encrypted comment text
              createdAt: Date.now(),
              read: false,
            };
            
            await addDoc(collection(db, 'notifications'), notificationData);
            console.log('[addCommentReaction] ✅ Notification created for comment owner');
          } else {
            console.log('[addCommentReaction] Notifications disabled for comment owner');
          }
        }
      } catch (notifError) {
        console.error('[addCommentReaction] ❌ Error creating notification:', notifError);
        // Don't throw - reaction was already saved, just notification failed
      }
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
      
      // Encrypt comment text
      const commentText = text.substring(0, 500);
      const encryptedCommentText = encryptionInitialized 
        ? await encryptForFriend(commentText, task.userId) 
        : commentText;

      const newComment: Comment = {
        id: `${user.uid}_${Date.now()}`,
        userId: user.uid,
        userName: userData.displayName,
        text: encryptedCommentText,
        timestamp: Date.now(),
      };

      comments.push(newComment);
      
      console.log('[addComment] Adding comment to task:', taskId, 'Current comments:', comments.length);
      await updateDoc(taskRef, { comments });
      console.log('[addComment] Comment added successfully');

      // Create notification for task owner if commenter is a friend
      if (task.userId !== user.uid) {
        console.log('[addComment] Task owner is different, checking for notification...');
        
        try {
          const taskOwnerRef = doc(db, 'users', task.userId);
          const taskOwnerDoc = await getDoc(taskOwnerRef);
          
          if (taskOwnerDoc.exists()) {
            const taskOwnerData = taskOwnerDoc.data();
            console.log('[addComment] Task owner data found, notificationSettings:', taskOwnerData.notificationSettings);
            
            // Check if friend comments notifications are enabled (default to true if not set)
            const friendCommentsEnabled = taskOwnerData.notificationSettings?.friendComments !== false;
            console.log('[addComment] Friend comments enabled:', friendCommentsEnabled);
            
            if (friendCommentsEnabled) {
              // Encrypt notification data
              const encryptedTaskText = encryptionInitialized 
                ? await encryptForFriend(task.text.substring(0, 50), task.userId)
                : task.text.substring(0, 50);
              const encryptedCommentText = encryptionInitialized 
                ? await encryptForFriend(text.substring(0, 150), task.userId)
                : text.substring(0, 150);

              // Create in-app notification
              const notificationData = {
                userId: task.userId,
                type: 'comment',
                title: `💬 ${userData.displayName} commented`,
                message: `${userData.displayName} commented on your task`,
                taskId: taskId,
                taskText: encryptedTaskText, // Encrypted task text
                fromUserId: user.uid,
                fromUserName: userData.displayName,
                commentText: encryptedCommentText, // Encrypted comment text
                createdAt: Date.now(),
                read: false,
              };
              console.log('[addComment] Creating notification:', notificationData);
              
              await addDoc(collection(db, 'notifications'), notificationData);
              console.log('[addComment] ✅ Notification created successfully for task owner');
            } else {
              console.log('[addComment] Notifications disabled for task owner');
            }
          } else {
            console.log('[addComment] Task owner document not found');
          }
        } catch (notifError) {
          console.error('[addComment] ❌ Error creating notification:', notifError);
          // Don't throw - comment was already saved, just notification failed
        }
      } else {
        console.log('[addComment] Skipping notification - commenting on own task');
      }
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

  // Add attachment to task
  const addAttachment = async (taskId: string, attachment: Attachment) => {
    if (!user?.uid) return;

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Task not found');
      }

      const currentAttachments = taskDoc.data().attachments || [];
      await updateDoc(taskRef, {
        attachments: [...currentAttachments, attachment]
      });

      // Update user's storage usage
      await updateUserStorageUsage(user.uid, attachment.size);
    } catch (error) {
      console.error('Error adding attachment:', error);
      throw error;
    }
  };

  // Delete attachment from task
  const deleteAttachment = async (taskId: string, attachmentId: string) => {
    if (!user?.uid) return;

    try {
      const taskRef = doc(db, 'tasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Task not found');
      }

      const currentAttachments = (taskDoc.data().attachments || []) as Attachment[];
      const attachmentToDelete = currentAttachments.find(a => a.id === attachmentId);
      
      if (attachmentToDelete) {
        // Delete from storage
        try {
          const mainRef = ref(storage, `attachments/${taskId}/${attachmentId}`);
          await deleteObject(mainRef);
          
          // Delete thumbnail if exists
          if (attachmentToDelete.thumbnailUrl) {
            const thumbRef = ref(storage, `attachments/${taskId}/${attachmentId}_thumb`);
            await deleteObject(thumbRef);
          }
        } catch (storageError) {
          console.warn('Storage delete error (file may not exist):', storageError);
        }
      }

      // Remove from Firestore
      const updatedAttachments = currentAttachments.filter(a => a.id !== attachmentId);
      await updateDoc(taskRef, {
        attachments: updatedAttachments
      });

      // Update user's storage usage (subtract the size)
      if (attachmentToDelete) {
        await updateUserStorageUsage(user.uid, -attachmentToDelete.size);
      }
    } catch (error) {
      console.error('Error deleting attachment:', error);
      throw error;
    }
  };

  // Send encouragement to a friend
  const sendEncouragement = async (friendId: string, message: string) => {
    if (!user || !userData) {
      throw new Error('Must be logged in to send encouragement');
    }

    try {
      console.log('[sendEncouragement] Sending encouragement to friend:', friendId);
      
      // Get friend's data to check notification settings
      const friendDocRef = doc(db, 'users', friendId);
      const friendDoc = await getDoc(friendDocRef);
      
      if (!friendDoc.exists()) {
        throw new Error('Friend not found');
      }
      
      const friendData = friendDoc.data() as User;
      
      // Check if friend has encouragement notifications enabled
      if (friendData.notificationSettings?.enabled && friendData.notificationSettings?.friendEncouragement !== false) {
        const notificationData = {
          userId: friendId,
          type: 'encouragement',
          title: `💪 ${userData.displayName} sent you encouragement!`,
          message: message,
          fromUserId: user.uid,
          fromUserName: userData.displayName,
          commentText: message, // Store the encouragement message
          createdAt: Date.now(),
          read: false,
        };
        
        console.log('[sendEncouragement] Creating notification:', notificationData);
        await addDoc(collection(db, 'notifications'), notificationData);
        console.log('[sendEncouragement] ✅ Encouragement sent successfully!');
      } else {
        console.log('[sendEncouragement] Friend has encouragement notifications disabled');
      }
    } catch (error) {
      console.error('[sendEncouragement] ❌ Error sending encouragement:', error);
      throw error;
    }
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
    addCommentReaction,
    deferTask,
    reorderTasks,
    addAttachment,
    deleteAttachment,
    sendEncouragement,
    userStorageUsage,
  };
}
