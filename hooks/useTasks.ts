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
import { db, storage, auth } from '@/lib/firebase';
import { Task, TaskWithUser, User, Reaction, Comment, Attachment, Subtask } from '@/lib/types';
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
    decryptComment,
    encryptForFriend, 
    decryptFromFriend 
  } = useEncryption();
  // When encryption finishes loading, listener must reconnect so tasks are decrypted (see setupKey)
  const encryptionReady = Boolean(encryptionInitialized);
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
  const lastEncReconnectRef = useRef<number>(0);
  const autoBackfillRanRef = useRef<boolean>(false);
  // Ref so snapshot listener always uses latest encryption (avoids stale closure when key loads later)
  const encryptionRef = useRef({
    encryptionInitialized,
    decryptForSelf,
    decryptFromFriend,
    decryptComment,
  });
  encryptionRef.current = { encryptionInitialized, decryptForSelf, decryptFromFriend, decryptComment };
  
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
    return `${userId || ''}_${userDataId || ''}_${stableFriendsKey}_${reconnectTrigger}_${encryptionReady}`;
  }, [userId, userDataId, stableFriendsKey, reconnectTrigger, encryptionReady]);

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

  // Auto-backfill friendContent when app loads so friends can decrypt older tasks
  useEffect(() => {
    if (!userId || !userDataId || !encryptionInitialized || autoBackfillRanRef.current) return;
    const friends = userData?.friends || [];
    if (friends.length === 0) return;

    const timer = setTimeout(async () => {
      // Abort if user signed out before backfill started
      if (!auth.currentUser || auth.currentUser.uid !== userId) return;
      autoBackfillRanRef.current = true;
      try {
        const q = query(
          collection(db, 'tasks'),
          where('userId', '==', userId),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        let count = 0;

        for (const docSnap of snapshot.docs) {
          const task = { id: docSnap.id, ...docSnap.data() } as Task;
          if (task.deleted || task.isPrivate) continue;

          const existing = task.friendContent || {};
          const missingFriends = friends.filter((f) => !existing[f]);
          let needsTaskBackfill = missingFriends.length > 0;

          const plaintext = needsTaskBackfill ? await decryptForSelf(task.text) : null;
          if (needsTaskBackfill && (!plaintext || plaintext.includes("Couldn't decrypt"))) needsTaskBackfill = false;

          const friendContent: Record<string, string> = { ...existing };
          if (needsTaskBackfill) {
            for (const friendId of missingFriends) {
              friendContent[friendId] = await encryptForFriend(plaintext!, friendId);
            }
          }

          // Backfill comment friendContent: owner comments + friend comments (so all friends can decrypt)
          let updatedComments: Comment[] | undefined;
          if (task.comments?.length && friends.length > 0) {
            const result = await Promise.all(
              task.comments.map(async (comment) => {
                const cExisting = comment.friendContent || {};
                const cMissing = friends.filter((f) => !cExisting[f]);
                if (cMissing.length === 0) return comment;
                let cPlain: string;
                if (comment.userId === userId) {
                  cPlain = await decryptForSelf(comment.text);
                } else {
                  cPlain = await decryptFromFriend(comment.text, comment.userId);
                }
                if (!cPlain || cPlain.includes("[Couldn't decrypt]")) return comment;
                const commentFriendContent: Record<string, string> = { ...cExisting };
                for (const friendId of cMissing) {
                  commentFriendContent[friendId] = await encryptForFriend(cPlain, friendId);
                }
                return { ...comment, friendContent: commentFriendContent };
              })
            );
            if (result.some((c, i) => c !== task.comments![i])) updatedComments = result;
          }

          const updateData: Record<string, unknown> = {};
          if (needsTaskBackfill) updateData.friendContent = friendContent;
          if (updatedComments) updateData.comments = updatedComments;
          if (Object.keys(updateData).length === 0) continue;

          if (!auth.currentUser || auth.currentUser.uid !== userId) return;
          await updateDoc(doc(db, 'tasks', task.id), updateData);
          count++;
        }

        if (count > 0) {
          setReconnectTrigger((prev) => prev + 1);
          if (process.env.NODE_ENV === 'development') {
            console.log('[useTasks] Auto-backfill: updated', count, 'task(s) (tasks + comments for friends)');
          }
        }
      } catch (err) {
        console.error('[useTasks] Auto-backfill failed:', err);
        autoBackfillRanRef.current = false;
      }
    }, 4000); // Wait for encryption + initial snapshot

    return () => clearTimeout(timer);
  }, [userId, userDataId, encryptionInitialized, userData?.friends, decryptForSelf, encryptForFriend]);

  useEffect(() => {
    if (!userId || !userDataId) {
      setTasks([]);
      setLoading(false);
      lastSetupKeyRef.current = '';
      return;
    }
    
    // CRITICAL: Wait for encryption before setting up listeners - prevents showing ciphertext
    // or empty tasks when key loads slowly (e.g. Chrome vs Cursor timing differences)
    if (!encryptionInitialized) {
      setLoading(true);
      return;
    }
    
    // CRITICAL: Only set up listeners if setup key actually changed
    // This prevents infinite loops when userData object reference changes but data is the same
    if (lastSetupKeyRef.current === setupKey) {
      return; // Already set up for this user/friends combination, skip re-setup
    }
    
    // CRITICAL: Prevent concurrent listener setup
    // If listeners are already active, wait a bit before setting up new ones
    if (listenersActiveRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useTasks] ⚠️ Listeners already active, skipping setup to prevent duplicates');
      }
      return;
    }
    
    lastSetupKeyRef.current = setupKey;
    lastEncReconnectRef.current = 0;
    
    // Capture current values to avoid closure issues
    const currentUserId = userId;
    const currentUserDataId = userDataId;
    const currentFriends = userData?.friends || [];
    const currentFriendsKey = stableFriendsKey;
    
    const tasksRef = collection(db, 'tasks');
    const unsubscribers: (() => void)[] = [];
    const allTasks = new Map<string, TaskWithUser>();
    const friendNameCache = new Map<string, string>();
    const migratedForFriendContent = new Set<string>(); // Avoid re-migrating same task
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
        // CRITICAL FIX: Mark listeners as inactive and wait a bit before reconnecting
        // This prevents race conditions with Firestore
        listenersActiveRef.current = false;
        // Use setTimeout to ensure cleanup completes before reconnection
        setTimeout(() => {
          setReconnectTrigger(prev => prev + 1);
        }, 100);
      }
    };
    
    // Network connectivity handlers - reconnect when online
    const handleOnline = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useTasks] 🌐 Network online - checking listeners...');
      }
      // If listeners are not active, reconnect with a delay to prevent race conditions
      if (!listenersActiveRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[useTasks] 🔄 Reconnecting listeners after network restored');
        }
        // Add delay to ensure any pending cleanup completes
        setTimeout(() => {
          setReconnectTrigger(prev => prev + 1);
        }, 200);
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
      const { encryptionInitialized: encReady, decryptForSelf: decrypt, decryptFromFriend: decryptFriend, decryptComment: decryptCommentFn } = encryptionRef.current;
      // Don't overwrite with ciphertext when key isn't ready - wait for reconnect
      if (!encReady) {
        const now = Date.now();
        if (snapshot.docs.length > 0 && now - lastEncReconnectRef.current > 2000) {
          lastEncReconnectRef.current = now;
          setTimeout(() => setReconnectTrigger((prev) => prev + 1), 400);
        }
        scheduleUpdate();
        return;
      }
      // Remove only own tasks from the map so we don't wipe friend tasks
      allTasks.forEach((task, taskId) => {
        if (task.userId === currentUserId) allTasks.delete(taskId);
      });
      // Process full own-tasks snapshot and decrypt every task
      for (const docSnap of snapshot.docs) {
        const task = { id: docSnap.id, ...docSnap.data() } as Task;
        if (task.deleted === true) continue;
        try {
          task.text = await decrypt(task.text);
          if (task.notes) task.notes = await decrypt(task.notes);
          if (task.comments) {
            task.comments = await Promise.all(
              task.comments.map(async (comment) => {
                const toDecrypt = comment.friendContent?.[currentUserId] ?? comment.text;
                return {
                  ...comment,
                  text: await decryptCommentFn(toDecrypt, task.userId, comment.userId, currentUserId),
                };
              })
            );
          }
        } catch (error) {
          console.error('[useTasks] Failed to decrypt task:', error);
        }
        allTasks.set(task.id, { ...task, userName: 'You' });

        // Backfill friendContent for existing public tasks so friends can decrypt
        const needsBackfill = !task.isPrivate &&
          encryptionInitialized &&
          currentFriends.length > 0 &&
          (() => {
            const existing = task.friendContent || {};
            return currentFriends.some((f) => !existing[f]);
          })();

        if (needsBackfill && !migratedForFriendContent.has(task.id)) {
          migratedForFriendContent.add(task.id);
          const plaintext = task.text; // Already decrypted above
          (async () => {
            try {
              const existing = task.friendContent || {};
              const friendContent: Record<string, string> = { ...existing };
              for (const friendId of currentFriends) {
                if (!friendContent[friendId]) {
                  friendContent[friendId] = await encryptForFriend(plaintext, friendId);
                }
              }
              // Backfill comment friendContent: owner comments (friends can't decrypt) + friend comments (other friends can't decrypt)
              let updatedComments: Comment[] | undefined;
              if (task.comments?.length && currentFriends.length > 0) {
                const result = await Promise.all(
                  task.comments.map(async (comment) => {
                    const existing = comment.friendContent || {};
                    const missing = currentFriends.filter((f) => !existing[f]);
                    if (missing.length === 0) return comment;
                    let plain: string;
                    if (comment.userId === currentUserId) {
                      plain = await decryptForSelf(comment.text);
                    } else {
                      plain = await decryptFromFriend(comment.text, comment.userId);
                    }
                    if (!plain || plain.includes("[Couldn't decrypt]")) return comment;
                    const commentFriendContent: Record<string, string> = { ...existing };
                    for (const friendId of missing) {
                      commentFriendContent[friendId] = await encryptForFriend(plain, friendId);
                    }
                    return { ...comment, friendContent: commentFriendContent };
                  })
                );
                const changed = result.some((c, i) => c !== task.comments![i]);
                if (changed) updatedComments = result;
              }
              if (!auth.currentUser || auth.currentUser.uid !== currentUserId) return;
              await updateDoc(doc(db, 'tasks', task.id),
                updatedComments ? { friendContent, comments: updatedComments } : { friendContent });
              if (process.env.NODE_ENV === 'development') {
                console.log('[useTasks] Backfilled friendContent for task:', task.id);
              }
            } catch (err) {
              console.error('[useTasks] Failed to backfill friendContent:', err);
              migratedForFriendContent.delete(task.id);
            }
          })();
        }
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[useTasks] ✅ Snapshot:', snapshot.docs.length, 'tasks');
      }
      isInitialLoad = false;
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
          const { encryptionInitialized: encReady, decryptFromFriend: decryptFriend, decryptComment: decryptCommentFn } = encryptionRef.current;
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
                // Decrypt friend's task data (use encryptionRef for latest state - fixes Chrome vs Cursor timing)
                if (encReady) {
                  try {
                    // Decrypt task text (friends can see public tasks)
                    if (!task.isPrivate) {
                      // Use friendContent[me] if available (encrypted for us); else legacy task.text (won't decrypt)
                      const toDecrypt = task.friendContent?.[currentUserId] ?? task.text;
                      task.text = await decryptFriend(toDecrypt, task.userId);
                      // Decrypt comments (try multiple keys for legacy/incorrectly encrypted data)
                      if (task.comments) {
                        task.comments = await Promise.all(
                          task.comments.map(async (comment) => {
                            const toDecrypt = comment.friendContent?.[currentUserId] ?? comment.text;
                            return {
                              ...comment,
                              text: await decryptCommentFn(toDecrypt, task.userId, comment.userId, currentUserId),
                            };
                          })
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
        // Add delay to prevent race conditions
        setTimeout(() => {
          setReconnectTrigger(prev => prev + 1);
        }, 100);
      }
    }, 30000); // Check every 30 seconds

    return () => {
      // Cleanup listeners - CRITICAL: Do this synchronously to prevent race conditions
      quotaExceeded = false; // Reset circuit breaker on cleanup
      listenersActiveRef.current = false; // Mark as inactive FIRST
      
      // Clear timers
      if (updateTimer) {
        clearTimeout(updateTimer);
      }
      clearInterval(healthCheckInterval);
      
      // Unsubscribe from all listeners
      // CRITICAL: Unsubscribe synchronously to prevent Firestore internal state issues
      const unsubs = [...unsubscribers]; // Copy array to avoid issues during iteration
      unsubs.forEach(unsub => {
        try {
          unsub();
        } catch (error) {
          console.error('[useTasks] Error unsubscribing listener:', error);
        }
      });
      unsubscribers.length = 0; // Clear array
      
      // Remove event listeners
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
        console.log('[useTasks] 🧹 Cleanup: unsubscribed from', unsubs.length, 'listeners');
      }
      
      // Reset setup key on cleanup so effect can run again if needed
      // But only after a small delay to ensure Firestore has processed the unsubscribes
      setTimeout(() => {
        lastSetupKeyRef.current = '';
      }, 50);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, userDataId, stableFriendsKey, setupKey]); // setupKey already includes reconnectTrigger via useMemo

  const addTask = async (text: string, isPrivate: boolean, dueDate?: number | null, scheduledFor?: string | null, recurrence?: import('@/lib/types').Recurrence | null, tags?: string[]) => {
    if (!user) return;

    // Get current max order for user's tasks
    const userTasks = Array.from(tasks).filter(t => t.userId === user.uid && !t.completed);
    const maxOrder = userTasks.length > 0 
      ? Math.max(...userTasks.map(t => t.order || 0))
      : 0;

    // Encrypt task text (owner uses master key)
    const encryptedText = encryptionInitialized ? await encryptForSelf(text) : text;

    // Encrypt for each friend so they can decrypt (public tasks only)
    let friendContent: Record<string, string> | undefined;
    if (!isPrivate && encryptionInitialized && (userData?.friends?.length ?? 0) > 0) {
      friendContent = {};
      for (const friendId of userData!.friends) {
        const enc = await encryptForFriend(text, friendId);
        friendContent[friendId] = enc;
      }
    }

    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const newTask = {
      userId: user.uid,
      text: encryptedText,
      ...(friendContent && Object.keys(friendContent).length > 0 && { friendContent }),
      isPrivate,
      completed: false,
      createdAt: Date.now(),
      completedAt: null,
      order: maxOrder + 1,
      deleted: false, // Explicitly set deleted to false
      ...(dueDate && { dueDate }), // Only include if set
      ...(scheduledFor && { deferredTo: scheduledFor }), // Schedule task for future date
      ...(recurrence && { recurrence: { ...recurrence, startDate: recurrence.startDate || startDate, completedDates: [], skippedDates: [] } }),
      ...(tags && tags.length > 0 && { tags }), // Emoji tags from active filter when adding
    };
    
    try {
      const docRef = await addDoc(collection(db, 'tasks'), newTask);
      console.log('[addTask] ✅ Task created:', docRef.id);
      // Force reconnect so listener re-processes with current key and displays decrypted task
      setTimeout(() => setReconnectTrigger((prev) => prev + 1), 300);
    } catch (error: any) {
      console.error('[addTask] ❌ Failed to create task:', error.message);
      if (error.code === 'resource-exhausted') {
        // If Blaze plan was just activated, it may take a few minutes
        throw new Error('Firebase rate limit reached. If you just upgraded to Blaze plan, please wait 2-3 minutes for activation. Otherwise, please wait a moment and try again.');
      }
      throw error;
    }
  };

  const toggleComplete = async (taskId: string, completed: boolean, task?: Task, dateStr?: string) => {
    const taskRef = doc(db, 'tasks', taskId);

    // Recurring tasks: add date to completedDates when completing
    if (task?.recurrence && completed) {
      const today = new Date();
      const targetStr = dateStr ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const completedDates = [...(task.recurrence.completedDates || []), targetStr];
      await updateDoc(taskRef, {
        recurrence: { ...task.recurrence, completedDates },
      });
      return;
    }

    // Recurring tasks: remove date from completedDates when uncompleting (e.g. from calendar)
    if (task?.recurrence && !completed && dateStr) {
      const completedDates = (task.recurrence.completedDates || []).filter(d => d !== dateStr);
      await updateDoc(taskRef, {
        recurrence: { ...task.recurrence, completedDates },
      });
      return;
    }

    await updateDoc(taskRef, {
      completed,
      completedAt: completed ? Date.now() : null,
    });
  };

  const togglePrivacy = async (taskId: string, isPrivate: boolean) => {
    const taskRef = doc(db, 'tasks', taskId);
    const updateData: Record<string, unknown> = { isPrivate };
    if (isPrivate) {
      updateData.friendContent = {}; // Clear so friends can't decrypt
    } else if (encryptionInitialized && (userData?.friends?.length ?? 0) > 0) {
      const taskDoc = await getDoc(taskRef);
      const task = taskDoc.exists() ? (taskDoc.data() as Task) : null;
      if (task?.text) {
        const plaintext = await decryptForSelf(task.text);
        if (plaintext && !plaintext.includes("Couldn't decrypt")) {
          const friendContent: Record<string, string> = {};
          for (const friendId of userData!.friends) {
            friendContent[friendId] = await encryptForFriend(plaintext, friendId);
          }
          updateData.friendContent = friendContent;
        }
      }
    }
    await updateDoc(taskRef, updateData);
    setTimeout(() => setReconnectTrigger((prev) => prev + 1), 300);
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

    // Encrypt task text (owner uses master key)
    const encryptedText = encryptionInitialized ? await encryptForSelf(trimmedText) : trimmedText;

    const taskRef = doc(db, 'tasks', taskId);
    const updateData: Record<string, unknown> = { text: encryptedText };

    // Encrypt for each friend so they can decrypt (public tasks only - don't leak private task content)
    const taskDoc = await getDoc(taskRef);
    const isPrivate = taskDoc.exists() ? (taskDoc.data() as Task).isPrivate : false;
    if (!isPrivate && encryptionInitialized && (userData?.friends?.length ?? 0) > 0) {
      const friendContent: Record<string, string> = {};
      for (const friendId of userData!.friends) {
        friendContent[friendId] = await encryptForFriend(trimmedText, friendId);
      }
      updateData.friendContent = friendContent;
    }

    await updateDoc(taskRef, updateData);
    // Force reconnect so listener re-processes with current key and displays decrypted task
    setTimeout(() => setReconnectTrigger((prev) => prev + 1), 300);
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

  const updateTaskTags = async (taskId: string, tags: string[]) => {
    if (!user) return;
    if (tags.length > 5) {
      throw new Error('Maximum 5 tags per task');
    }
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, { tags });
  };

  const updateTaskRecurrence = async (taskId: string, recurrence: import('@/lib/types').Recurrence | null, completedDateStr?: string) => {
    if (!user) return;
    const taskRef = doc(db, 'tasks', taskId);
    const taskDoc = await getDoc(taskRef);
    const existing = taskDoc.exists() ? (taskDoc.data() as Task) : null;
    const today = new Date();
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (recurrence) {
      let completedDates = existing?.recurrence?.completedDates ?? [];
      // Converting completed task to recurring: add completion date to completedDates
      if (completedDateStr || (existing?.completed && existing?.completedAt)) {
        const dateToAdd = completedDateStr ?? (() => {
          const d = new Date(existing!.completedAt!);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })();
        if (!completedDates.includes(dateToAdd)) {
          completedDates = [...completedDates, dateToAdd];
        }
      }
      const updateData: Record<string, unknown> = {
        recurrence: {
          ...recurrence,
          startDate: recurrence.startDate || startDate,
          completedDates,
          skippedDates: existing?.recurrence?.skippedDates ?? [],
        },
      };
      if (completedDateStr || (existing?.completed && existing?.completedAt)) {
        updateData.completed = false;
        updateData.completedAt = null;
      }
      await updateDoc(taskRef, updateData);
    } else {
      await updateDoc(taskRef, { recurrence: null });
    }
  };

  const recordRecentlyUsedTag = async (emoji: string) => {
    if (!user) return;
    const current = userData?.recentlyUsedTags || [];
    const without = current.filter((e) => e !== emoji);
    const updated = [emoji, ...without].slice(0, 12);
    await updateDoc(doc(db, 'users', user.uid), { recentlyUsedTags: updated });
  };

  /** Parse notes: lines starting with "- " become subtask titles, rest becomes notes. */
  const parseNotesIntoSubtasks = (notesText: string): { subtaskTitles: string[]; notes: string } => {
    const lines = notesText.split('\n');
    const subtaskTitles: string[] = [];
    const noteLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (trimmed.startsWith('- ')) {
        subtaskTitles.push(trimmed.slice(2).trim() || 'Untitled');
      } else {
        noteLines.push(line);
      }
    }
    const notes = noteLines.join('\n').trim();
    return { subtaskTitles, notes };
  };

  const updateTaskNotes = async (
    taskId: string,
    notes: string,
    existingSubtasks?: Subtask[]
  ) => {
    if (!user) return;

    const { subtaskTitles, notes: parsedNotes } = parseNotesIntoSubtasks(notes);

    // Merge: parsed titles from notes + existing subtasks not in notes (e.g. button-added)
    const existing = existingSubtasks || [];
    const parsedSet = new Set(subtaskTitles);
    const fromParsed: Subtask[] = subtaskTitles.map((title) => {
      const ex = existing.find((e) => e.title === title);
      if (ex) return ex;
      return {
        id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title,
        completed: false,
      };
    });
    const fromExisting = existing.filter((e) => !parsedSet.has(e.title));
    const mergedSubtasks = [...fromParsed, ...fromExisting];

    const encryptedNotes =
      parsedNotes.length > 0
        ? (encryptionInitialized ? await encryptForSelf(parsedNotes) : parsedNotes)
        : null;

    const startTime = Date.now();
    const taskRef = doc(db, 'tasks', taskId);
    try {
      await updateDoc(taskRef, {
        notes: encryptedNotes,
        subtasks: mergedSubtasks,
      });
      const duration = Date.now() - startTime;
      if (duration > 1000) {
        console.warn(`[updateTaskNotes] Slow update: ${duration}ms for task ${taskId}`);
      }
      setTimeout(() => setReconnectTrigger((prev) => prev + 1), 300);
    } catch (error) {
      console.error('[updateTaskNotes] Error updating notes:', error);
      throw error;
    }
  };

  const updateTaskSubtasks = async (taskId: string, subtasks: Subtask[]) => {
    if (!user) return;
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, { subtasks });
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
        reactions: updatedReactions.length > 0 ? updatedReactions : [],
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

    // Firestore rejects undefined - strip from comments before update
    const sanitizedComments = comments.map((c) => {
      const sanitized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(c)) {
        if (v !== undefined) {
          sanitized[k] = Array.isArray(v) ? v.filter((x) => x !== undefined) : v;
        }
      }
      return sanitized;
    });
    await updateDoc(taskRef, { comments: sanitizedComments });

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
            // Decrypt, then encrypt for recipient so only they can read (SW decrypts in browser)
            let plainTaskText = '';
            let plainCommentText = '';
            if (encryptionInitialized && task.text) {
              try {
                if (task.userId === user.uid) {
                  plainTaskText = await decryptForSelf(task.text);
                } else {
                  const toDecrypt = task.friendContent?.[user.uid] ?? task.text;
                  plainTaskText = await decryptFromFriend(toDecrypt, task.userId);
                }
                if (plainTaskText.includes("Couldn't decrypt")) plainTaskText = '';
              } catch {
                plainTaskText = '';
              }
            }
            if (encryptionInitialized && comment.text) {
              try {
                plainCommentText = await decryptComment(comment.text, task.userId, comment.userId, user.uid);
                if (plainCommentText.includes("[Couldn't decrypt]")) plainCommentText = '';
              } catch {
                plainCommentText = '';
              }
            }
            // Encrypt for recipient - only they can decrypt (in-app panel + service worker)
            let taskTextToStore = '';
            let commentTextToStore = '';
            if (encryptionInitialized && commentOwnerId) {
              try {
                if (plainTaskText) {
                  taskTextToStore = await encryptForFriend(plainTaskText.substring(0, 50), commentOwnerId);
                }
                if (plainCommentText) {
                  commentTextToStore = await encryptForFriend(plainCommentText.substring(0, 150), commentOwnerId);
                }
              } catch (encErr) {
                console.warn('[addCommentReaction] Encrypt for notification failed:', encErr);
                // Fallback to plaintext if encryption fails
                taskTextToStore = plainTaskText ? plainTaskText.substring(0, 50) : '';
                commentTextToStore = plainCommentText ? plainCommentText.substring(0, 150) : '';
              }
            } else {
              taskTextToStore = plainTaskText ? plainTaskText.substring(0, 50) : '';
              commentTextToStore = plainCommentText ? plainCommentText.substring(0, 150) : '';
            }
            const fromName = userData.displayName?.trim() || user.displayName || user.email?.split('@')[0] || 'A friend';
            if (process.env.NODE_ENV === 'development') {
              console.log('[addCommentReaction] Notification fromName:', fromName, '| userData.displayName:', userData.displayName);
            }
            const notificationData = {
              userId: commentOwnerId,
              type: 'comment',
              title: `${emoji} ${fromName} reacted to your comment`,
              message: `${fromName} reacted ${emoji} to your comment`,
              taskId: taskId,
              taskText: taskTextToStore,
              fromUserId: user.uid,
              fromUserName: fromName,
              commentText: commentTextToStore,
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
      
      // Pre-fetch task owner doc when commenting on friend's task (for encryption + notification)
      let taskOwnerData: User | null = null;
      if (task.userId !== user.uid) {
        const taskOwnerDocSnap = await getDoc(doc(db, 'users', task.userId));
        taskOwnerData = taskOwnerDocSnap.exists() ? (taskOwnerDocSnap.data() as User) : null;
      }
      
      // Encrypt comment text: own task = encryptForSelf + friendContent for each friend;
      // friend's task = encrypt for task owner + friendContent for each of owner's friends (so all viewers can decrypt)
      const commentText = text.substring(0, 500);
      let encryptedCommentText = commentText;
      let commentFriendContent: Record<string, string> | undefined;

      if (encryptionInitialized) {
        if (task.userId === user.uid) {
          encryptedCommentText = await encryptForSelf(commentText);
          // Encrypt for each friend so they can decrypt owner's comments (owner uses master key, friends can't)
          if (userData.friends?.length) {
            commentFriendContent = {};
            for (const friendId of userData.friends) {
              commentFriendContent[friendId] = await encryptForFriend(commentText, friendId);
            }
          }
        } else {
          encryptedCommentText = await encryptForFriend(commentText, task.userId);
          const ownerFriends = taskOwnerData?.friends || [];
          if (ownerFriends.length > 0) {
            commentFriendContent = {};
            for (const friendId of ownerFriends) {
              if (friendId !== task.userId) {
                commentFriendContent[friendId] = await encryptForFriend(commentText, friendId);
              }
            }
          }
        }
      }

      const newComment: Comment = {
        id: `${user.uid}_${Date.now()}`,
        userId: user.uid,
        userName: userData.displayName,
        ...(userData.photoURL && { photoURL: userData.photoURL }),
        text: encryptedCommentText,
        ...(commentFriendContent && Object.keys(commentFriendContent).length > 0 && { friendContent: commentFriendContent }),
        timestamp: Date.now(),
      };

      comments.push(newComment);
      
      console.log('[addComment] Adding comment to task:', taskId, 'Current comments:', comments.length);
      await updateDoc(taskRef, { comments });
      console.log('[addComment] Comment added successfully');
      // Firestore listener will receive the update in real time; no need to force reconnect (avoids comment box flicker)

      // Create notification for task owner if commenter is a friend
      if (task.userId !== user.uid && taskOwnerData) {
        console.log('[addComment] Task owner is different, checking for notification...');
        
        try {
          const friendCommentsEnabled = taskOwnerData.notificationSettings?.friendComments !== false;
          
          if (friendCommentsEnabled) {
            // Decrypt task, then encrypt for recipient so only they can read (SW decrypts in browser)
            let taskPreview = '';
            if (encryptionInitialized) {
              const toDecrypt = task.friendContent?.[user.uid] ?? task.text;
              if (toDecrypt) {
                try {
                  const plain = await decryptFromFriend(toDecrypt, task.userId);
                  if (plain && !plain.includes("[Couldn't decrypt]")) {
                    taskPreview = plain.substring(0, 50);
                  }
                } catch {
                  // Decryption failed - skip task preview
                }
              }
            } else {
              taskPreview = task.text?.substring(0, 50) ?? '';
            }

            // Encrypt for recipient (task owner)
            let taskTextToStore = '';
            let commentTextToStore = '';
            if (encryptionInitialized && task.userId) {
              try {
                if (taskPreview) {
                  taskTextToStore = await encryptForFriend(taskPreview, task.userId);
                }
                commentTextToStore = await encryptForFriend(text.substring(0, 150), task.userId);
              } catch (encErr) {
                console.warn('[addComment] Encrypt for notification failed:', encErr);
              }
            } else {
              taskTextToStore = taskPreview;
              commentTextToStore = text.substring(0, 150);
            }

            const fromName = userData.displayName?.trim() || user.displayName || user.email?.split('@')[0] || 'A friend';
            if (process.env.NODE_ENV === 'development') {
              console.log('[addComment] Notification fromName:', fromName, '| userData.displayName:', userData.displayName);
            }
            const notificationData = {
              userId: task.userId,
              type: 'comment',
              title: `💬 ${fromName} commented`,
              message: `${fromName} commented on your task`,
              taskId: taskId,
              taskText: taskTextToStore,
              fromUserId: user.uid,
              fromUserName: fromName,
              commentText: commentTextToStore,
              createdAt: Date.now(),
              read: false,
            };
            console.log('[addComment] Creating notification:', { ...notificationData, commentText: '[encrypted]', taskText: taskTextToStore ? '[encrypted]' : '' });
            
            await addDoc(collection(db, 'notifications'), notificationData);
            console.log('[addComment] ✅ Notification created successfully for task owner');
          } else {
            console.log('[addComment] Notifications disabled for task owner');
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

  const deferTask = async (taskId: string, deferToDate: string | null, task?: Task) => {
    if (!user) return;

    const taskRef = doc(db, 'tasks', taskId);

    // Recurring tasks: skip today's instance (add to skippedDates) - doesn't break streak
    if (task?.recurrence && deferToDate) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const skippedDates = [...(task.recurrence.skippedDates || []), todayStr];
      await updateDoc(taskRef, {
        recurrence: { ...task.recurrence, skippedDates },
      });
      return;
    }

    const updateData: Record<string, unknown> = { deferredTo: deferToDate || null };
    if (deferToDate) {
      updateData.completed = false;
      updateData.completedAt = null;
    }
    await updateDoc(taskRef, updateData);
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
        const fromName = userData.displayName?.trim() || user.displayName || user.email?.split('@')[0] || 'A friend';
        if (process.env.NODE_ENV === 'development') {
          console.log('[sendEncouragement] Notification fromName:', fromName, '| userData.displayName:', userData.displayName);
        }
        let commentTextToStore = message;
        if (encryptionInitialized) {
          try {
            commentTextToStore = await encryptForFriend(message.substring(0, 150), friendId);
          } catch (encErr) {
            console.warn('[sendEncouragement] Encrypt for notification failed:', encErr);
          }
        }
        const notificationData = {
          userId: friendId,
          type: 'encouragement',
          title: `💪 ${fromName} sent you encouragement!`,
          message: `${fromName} sent you encouragement`,
          fromUserId: user.uid,
          fromUserName: fromName,
          commentText: commentTextToStore,
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
    updateTaskTags,
    recordRecentlyUsedTag,
    updateTaskSubtasks,
    updateTaskRecurrence,
  };
}
