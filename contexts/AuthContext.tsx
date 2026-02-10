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
import { doc, setDoc, getDoc, onSnapshot, collection, query, where, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { User, StreakData } from '@/lib/types';

interface AuthContextType {
  user: FirebaseUser | null;
  userData: User | null;
  isWhitelisted: boolean | null;
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
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[AuthContext] Auth state changed, user:', firebaseUser?.uid);
      }
      setUser(firebaseUser);
      
      // Clean up previous snapshot listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }
      
      if (firebaseUser) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[AuthContext] Setting up user data listener for:', firebaseUser.uid);
        }
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
              ...(firebaseUser.photoURL && { photoURL: firebaseUser.photoURL }),
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
              // Use merge: true to preserve any existing fields (like isAdmin, friends, etc.)
              // This is a safety measure in case the document was partially created or has additional fields
              await setDoc(userDocRef, newUserData, { merge: true });
              setUserData(newUserData);
              if (process.env.NODE_ENV === 'development') {
                console.log('[AuthContext] ✅ User document created successfully:', newUserData);
              }
            } catch (error) {
              console.error('[AuthContext] Error creating user document:', error);
            }
          }
          
          // Check whitelist status
          const currentUserData = docSnapshot.exists() ? docSnapshot.data() as User : null;
          // Use email from user document if available, otherwise fall back to Firebase auth email
          // Both should be the same, but user document email is more reliable
          const userEmail = currentUserData?.email || firebaseUser.email;
          
          if (userEmail) {
            const whitelistStatus = await checkBetaWhitelist(userEmail);
            
            if (process.env.NODE_ENV === 'development') {
              console.log('[AuthContext] Auth listener whitelist check:', {
                email: userEmail,
                emailLower: userEmail.toLowerCase(),
                whitelisted: whitelistStatus,
                hasUserData: !!currentUserData,
                userDataEmail: currentUserData?.email,
                firebaseEmail: firebaseUser.email,
                currentIsWhitelisted: isWhitelisted
              });
            }
            
            // Always update isWhitelisted based on current whitelist status
            // This ensures the state is correct even if signIn/signInWithGoogle hasn't set it yet
            // or if the whitelist status changes after sign-in
            setIsWhitelisted(whitelistStatus);
            
            // If user is not whitelisted, don't sign them out immediately
            // Instead, set isWhitelisted to false so AccessRemovedScreen can be shown
            // The user will be signed out when they click "Return to Sign In" on that screen
            if (!whitelistStatus) {
              console.log('[AuthContext] ⚠️ User not whitelisted:', userEmail);
              // Keep user authenticated but mark as not whitelisted
              // AccessRemovedScreen will be shown in app/page.tsx
            }
          } else {
            // No email available - set to false
            console.warn('[AuthContext] ⚠️ No email available for whitelist check');
            setIsWhitelisted(false);
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
        if (process.env.NODE_ENV === 'development') {
          console.log('[AuthContext] No user logged in, clearing userData');
        }
        setUserData(null);
        setIsWhitelisted(null);
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

  // Check if user email is in beta whitelist
  const checkBetaWhitelist = async (email: string): Promise<boolean> => {
    if (!email) return false;
    const emailLower = email.toLowerCase();
    try {
      const whitelistDocRef = doc(db, 'betaWhitelist', emailLower);
      const whitelistDoc = await getDoc(whitelistDocRef);
      return whitelistDoc.exists();
    } catch (error) {
      console.error('[AuthContext] Error checking whitelist:', error);
      return false;
    }
  };

  // Auto-add user to whitelist (for first-time login only)
  // This should NOT be called for existing users who were removed from whitelist
  const addToWhitelist = async (email: string, userId?: string): Promise<void> => {
    if (!email) return;
    const emailLower = email.toLowerCase();
    try {
      const whitelistDocRef = doc(db, 'betaWhitelist', emailLower);
      const whitelistDoc = await getDoc(whitelistDocRef);
      
      // Only add if not already whitelisted
      if (!whitelistDoc.exists()) {
        // Check if user document exists - if it does, this is NOT a first-time user
        // and they should NOT be auto-whitelisted (they were likely removed)
        if (userId) {
          const userDocRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userDocRef);
          
          // If user document exists, this is an existing user who was removed
          // Don't auto-add them back
          if (userDoc.exists()) {
            console.log('[AuthContext] ⚠️ Existing user removed from whitelist - not auto-adding:', emailLower);
            return;
          }
        }
        
        // Only auto-add if this is a truly new user (no user document exists)
        await setDoc(whitelistDocRef, {
          email: emailLower,
          addedAt: Date.now(),
          autoAdded: true, // Flag to indicate auto-whitelisting
        });
        console.log('[AuthContext] ✅ Auto-added new user to whitelist:', emailLower);
      }
    } catch (error) {
      console.error('[AuthContext] Error adding to whitelist:', error);
      // Don't throw - allow login to proceed even if whitelist add fails
    }
  };

  const signIn = async (email: string, password: string) => {
    // Check whitelist BEFORE authentication
    const isWhitelistedBefore = await checkBetaWhitelist(email);
    
    // First authenticate the user
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userId = userCredential.user.uid;
    
    // After authentication, check whitelist again and auto-add if needed (only for new users)
    const isWhitelisted = await checkBetaWhitelist(email);
    if (!isWhitelisted) {
      // Only auto-add if user was not previously whitelisted (new user)
      // If they were whitelisted before and now removed, don't auto-add them back
      if (!isWhitelistedBefore) {
        // This is a new user - auto-add to whitelist
        await addToWhitelist(email, userId);
        // Re-check after adding
        const isWhitelistedAfter = await checkBetaWhitelist(email);
        if (!isWhitelistedAfter) {
          // Sign out if still not whitelisted (shouldn't happen for new users)
          await firebaseSignOut(auth);
          throw new Error('Failed to add you to the whitelist. Please contact an administrator.');
        }
      } else {
        // User was previously whitelisted but now removed - don't auto-add
        // Don't sign out - let them stay authenticated so AccessRemovedScreen can be shown
        // The auth state listener will set isWhitelisted to false, which will trigger the screen
        // Just return without throwing error - the screen will be shown automatically
        return;
      }
    }
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
    // Create Firebase Auth account first
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const userId = userCredential.user.uid;

    // Auto-add to whitelist on first signup (after authentication)
    await addToWhitelist(email);

    // Create user document
    const newUser: User = {
      id: userId,
      displayName,
      email,
      // No photo for email/password sign-up initially - omit photoURL field
      friendCode: generateFriendCode(),
      friends: [],
      createdAt: Date.now(),
    };

      // Use merge: true to preserve any existing fields (like isAdmin, friends, etc.)
      await setDoc(doc(db, 'users', userId), newUser, { merge: true });
      setUserData(newUser);
    
    // Check whitelist status
    const isWhitelisted = await checkBetaWhitelist(email);
    setIsWhitelisted(isWhitelisted);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    
    const email = result.user.email;
    if (!email) {
      await firebaseSignOut(auth);
      throw new Error('Unable to get email from Google account. Please try again.');
    }
    
    // Check whitelist BEFORE proceeding
    const isWhitelistedBefore = await checkBetaWhitelist(email);
    
    const userId = result.user.uid;
    
    // Check whitelist again after getting userId
    const isWhitelisted = await checkBetaWhitelist(email);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[AuthContext] signInWithGoogle whitelist check:', {
        email,
        emailLower: email.toLowerCase(),
        isWhitelisted,
        isWhitelistedBefore,
        userId
      });
    }
    
    if (!isWhitelisted) {
      // Only auto-add if user was not previously whitelisted (new user)
      // If they were whitelisted before and now removed, don't auto-add them back
      if (!isWhitelistedBefore) {
        // This is a new user - auto-add to whitelist
        await addToWhitelist(email, userId);
        // Re-check after adding
        const isWhitelistedAfter = await checkBetaWhitelist(email);
        if (!isWhitelistedAfter) {
          // Sign out if still not whitelisted (shouldn't happen for new users)
          await firebaseSignOut(auth);
          throw new Error('Failed to add you to the whitelist. Please contact an administrator.');
        }
        // User is now whitelisted (auto-added)
        setIsWhitelisted(true);
      } else {
        // User was previously whitelisted but now removed - don't auto-add
        // Don't sign out - let them stay authenticated so AccessRemovedScreen can be shown
        // The auth state listener will set isWhitelisted to false, which will trigger the screen
        // Just return without throwing error - the screen will be shown automatically
        setIsWhitelisted(false);
        return;
      }
    } else {
      // User is whitelisted - explicitly set the state
      setIsWhitelisted(true);
    }
    
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
        email: email,
        ...(result.user.photoURL && { photoURL: result.user.photoURL }), // Store Google profile picture if available
        friendCode: friendCode,
        friends: [],
        createdAt: Date.now(),
      };

      // Use merge: true to preserve any existing fields (like isAdmin, friends, etc.)
      await setDoc(userDocRef, newUser, { merge: true });
      setUserData(newUser);
    } else {
      // Update existing user's photo URL if they signed in with Google
      // This ensures we get the latest profile picture
      if (result.user.photoURL) {
        await setDoc(userDocRef, {
          photoURL: result.user.photoURL
        }, { merge: true });
      }
    }
    
    // Whitelist status already set above, no need to check again
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
    <AuthContext.Provider value={{ user, userData, isWhitelisted, loading, signIn, signUp, signInWithGoogle, signOut, updateStreakData }}>
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
