'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { 
  User as FirebaseUser, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { User, StreakData } from '@/lib/types';

interface AuthContextType {
  user: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateStreakData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log('[AuthContext] Auth state changed, user:', firebaseUser?.uid);
      setUser(firebaseUser);
      
      // Clean up previous snapshot listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }
      
      if (firebaseUser) {
        console.log('[AuthContext] Setting up user data listener for:', firebaseUser.uid);
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        
        // Set up real-time listener for user data
        unsubscribeSnapshot = onSnapshot(userDocRef, async (docSnapshot) => {
          if (docSnapshot.exists()) {
            const userData = docSnapshot.data() as User;
            
            // If user doesn't have a friend code (existing user), add one
            if (!userData.friendCode) {
              const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
              let friendCode = '';
              for (let i = 0; i < 6; i++) {
                friendCode += chars.charAt(Math.floor(Math.random() * chars.length));
              }
              
              await setDoc(userDocRef, { ...userData, friendCode }, { merge: true });
              setUserData({ ...userData, friendCode });
            } else {
              setUserData(userData);
            }
          } else {
            console.error('[AuthContext] ❌ User document does NOT exist in Firestore!');
            console.error('[AuthContext] Creating user document now...');
            
            // Create user document if it doesn't exist
            const newUserData: User = {
              id: firebaseUser.uid,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              email: firebaseUser.email || '',
              friendCode: (() => {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                let code = '';
                for (let i = 0; i < 6; i++) {
                  code += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return code;
              })(),
              friends: [],
              createdAt: Date.now(),
              streakData: {
                currentStreak: 0,
                longestStreak: 0,
                lastCompletionDate: '',
                completionHistory: {},
                missedCommitments: {},
              },
            };
            
            try {
              await setDoc(userDocRef, newUserData);
              setUserData(newUserData);
              console.log('[AuthContext] ✅ User document created successfully:', newUserData);
            } catch (error) {
              console.error('[AuthContext] Error creating user document:', error);
            }
          }
          setLoading(false);
        }, (error) => {
          console.error("[AuthContext] Error in user data listener:", error);
          if (error.code === 'resource-exhausted') {
            console.error('[AuthContext] 🚨 QUOTA EXCEEDED - App will not work until quota resets');
            // Don't alert, just show in console to avoid annoying the user
            setUserData(null); // Clear userData to show loading state
          }
          setLoading(false);
        });
      } else {
        console.log('[AuthContext] No user logged in, clearing userData');
        setUserData(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const generateFriendCode = () => {
    // Generate a 6-character alphanumeric code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar chars
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const userId = userCredential.user.uid;

    // Create user document in Firestore
    const newUser: User = {
      id: userId,
      displayName,
      email,
      friendCode: generateFriendCode(),
      friends: [],
      createdAt: Date.now(),
    };

    await setDoc(doc(db, 'users', userId), newUser);
    setUserData(newUser);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const userId = result.user.uid;

    // Check if user document exists
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      // Generate friend code
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let friendCode = '';
      for (let i = 0; i < 6; i++) {
        friendCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      
      // Create new user document
      const newUser: User = {
        id: userId,
        displayName: result.user.displayName || 'User',
        email: result.user.email || '',
        friendCode: friendCode,
        friends: [],
        createdAt: Date.now(),
      };

      await setDoc(userDocRef, newUser);
      setUserData(newUser);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserData(null);
  };

  const updateStreakData = useCallback(async () => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    const tasksRef = collection(db, 'tasks');
    
    // Get ALL tasks (not just completed) to calculate completion percentage
    const allTasksQuery = query(tasksRef, where('userId', '==', user.uid));
    const allTasksSnapshot = await getDocs(allTasksQuery);
    
    // Build task counts per day: total tasks and completed tasks
    // For each day, count all tasks that were "active" (should be shown) on that day
    const dailyTaskCounts: { [date: string]: { total: number; completed: number } } = {};
    
    // Helper to get date string
    const getDateStr = (timestamp: number): string => {
      const date = new Date(timestamp);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };
    
    const todayDate = new Date();
    const todayStr = getDateStr(todayDate.getTime());
    
    allTasksSnapshot.forEach((doc) => {
      const task = doc.data();
      
      // Skip deleted tasks
      if (task.deleted === true) return;
      
      const createdDateStr = getDateStr(task.createdAt);
      
      // For completed tasks, count them on the day they were completed
      if (task.completed && task.completedAt) {
        const completedDateStr = getDateStr(task.completedAt);
        
        // Count as completed on completion date
        if (!dailyTaskCounts[completedDateStr]) {
          dailyTaskCounts[completedDateStr] = { total: 0, completed: 0 };
        }
        dailyTaskCounts[completedDateStr].completed++;
        
        // Also count as total task on completion date (if created before or on that day)
        if (createdDateStr <= completedDateStr) {
          dailyTaskCounts[completedDateStr].total++;
        }
      } else if (!task.completed) {
        // For incomplete tasks, count them on days they were "active"
        // A task is active on a day if:
        // 1. Created on that day, OR
        // 2. Created before and should rollover (not skipRollover, not deferred to future)
        
        // Check if task should be counted on its creation day
        if (!dailyTaskCounts[createdDateStr]) {
          dailyTaskCounts[createdDateStr] = { total: 0, completed: 0 };
        }
        dailyTaskCounts[createdDateStr].total++;
        
        // If task was created before today and should rollover, count it on today
        if (createdDateStr < todayStr) {
          // Check if task should rollover (similar to shouldShowInTodayView logic)
          if (!task.skipRollover) {
            // Check if deferred to future
            if (task.deferredTo && task.deferredTo > todayStr) {
              // Don't count on today
            } else {
              // Task should rollover - count on today
              if (!dailyTaskCounts[todayStr]) {
                dailyTaskCounts[todayStr] = { total: 0, completed: 0 };
              }
              dailyTaskCounts[todayStr].total++;
            }
          }
        }
      }
    });
    
    // Build completion history - only count days with >= 70% completion
    const completionHistory: { [date: string]: number } = {};
    
    Object.entries(dailyTaskCounts).forEach(([dateStr, counts]) => {
      if (counts.total > 0) {
        const completionPercentage = (counts.completed / counts.total) * 100;
        // Only count day if >= 70% of tasks are completed
        if (completionPercentage >= 70) {
          completionHistory[dateStr] = counts.completed;
        }
      }
    });

    // Build missed commitments history
    const missedCommitments: { [date: string]: number } = {};
    
    // Query for committed tasks that were not completed
    const committedQuery = query(
      tasksRef, 
      where('userId', '==', user.uid), 
      where('committed', '==', true), 
      where('completed', '==', false)
    );
    
    const committedSnapshot = await getDocs(committedQuery);
    
    // todayStr already defined above
    committedSnapshot.forEach((doc) => {
      const task = doc.data();
      // Only count as missed if the task was created before today and not deferred to a future date
      const createdDate = new Date(task.createdAt);
      const createdDateStr = `${createdDate.getFullYear()}-${String(createdDate.getMonth() + 1).padStart(2, '0')}-${String(createdDate.getDate()).padStart(2, '0')}`;
      
      // If task is deferred to today or future, don't count as missed yet
      if (task.deferredTo && task.deferredTo >= todayStr) {
        return;
      }
      
      // If task was created before today and not completed, it's a missed commitment
      if (createdDateStr < todayStr) {
        missedCommitments[createdDateStr] = (missedCommitments[createdDateStr] || 0) + 1;
      }
    });

    // Calculate streak
    // Note: today and todayStr already defined above for missed commitments
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let lastCompletionDate = '';
    
    // Sort dates in descending order
    const sortedDates = Object.keys(completionHistory).sort((a, b) => b.localeCompare(a));
    
    // Calculate current streak (working backwards from today)
    let checkDate = new Date(todayDate);
    let foundGap = false;
    
    while (!foundGap) {
      const checkDateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
      
      if (completionHistory[checkDateStr]) {
        currentStreak++;
        lastCompletionDate = checkDateStr;
      } else if (checkDateStr === todayStr) {
        // Today is allowed to have no completions (streak continues)
        // Do nothing, just continue checking
      } else {
        // Gap found (neither today nor a completion day)
        foundGap = true;
      }
      
      checkDate.setDate(checkDate.getDate() - 1);
      
      // Safety limit: don't check more than 365 days
      if (currentStreak > 365) break;
    }
    
    // Calculate longest streak
    if (sortedDates.length > 0) {
      tempStreak = 1;
      longestStreak = 1;
      
      for (let i = 0; i < sortedDates.length - 1; i++) {
        const currentDate = new Date(sortedDates[i]);
        const nextDate = new Date(sortedDates[i + 1]);
        
        // Check if dates are consecutive
        const diffInDays = Math.floor((currentDate.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffInDays === 1) {
          tempStreak++;
          longestStreak = Math.max(longestStreak, tempStreak);
        } else {
          tempStreak = 1;
        }
      }
    }

    const streakData: StreakData = {
      currentStreak,
      longestStreak,
      lastCompletionDate,
      completionHistory,
      missedCommitments,
    };

    // Update user document with streak data
    await setDoc(userDocRef, { streakData }, { merge: true });
    
    // Update local state
    if (userData) {
      setUserData({ ...userData, streakData });
    }
  }, [user, userData]);

  return (
    <AuthContext.Provider value={{ user, userData, loading, signIn, signUp, signInWithGoogle, signOut, updateStreakData }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
