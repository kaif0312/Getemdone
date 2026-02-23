'use client';

import { useEffect, useState, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { User, FriendGroup, TaskVisibility } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

export function useFriends() {
  const { user, userData } = useAuth();
  const [friends, setFriends] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable key: only re-fetch when the friends list actually changes (not on every userData update)
  const friendsKey = useMemo(() => {
    const arr = userData?.friends;
    if (!user?.uid || !arr?.length) return null;
    return [...arr].sort().join(',');
  }, [user?.uid, userData?.friends]);

  useEffect(() => {
    // Only clear friends when user is logged out
    if (!user) {
      setFriends([]);
      setLoading(false);
      return;
    }

    // userData not loaded yet — keep previous state, don't clear (avoids flash during auth)
    if (!userData) {
      setLoading(false);
      return;
    }

    // Explicitly empty friends array — user has no friends
    if (!userData.friends || userData.friends.length === 0) {
      setFriends([]);
      setLoading(false);
      return;
    }

    const abortController = new AbortController();
    const friendIds = userData.friends;

    const fetchFriends = async () => {
      const friendsData: User[] = [];

      for (const friendId of friendIds) {
        if (abortController.signal.aborted) return;
        const friendDoc = await getDoc(doc(db, 'users', friendId));
        if (abortController.signal.aborted) return;
        if (friendDoc.exists()) {
          friendsData.push({ id: friendDoc.id, ...friendDoc.data() } as User);
        }
      }

      if (abortController.signal.aborted) return;
      setFriends(friendsData);
      setLoading(false);
    };

    fetchFriends();
    return () => abortController.abort();
  }, [user, friendsKey]);

  const searchUsers = async (email: string): Promise<User | null> => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return null;
    
    const userDoc = snapshot.docs[0];
    return { id: userDoc.id, ...userDoc.data() } as User;
  };

  const searchByFriendCode = async (friendCode: string): Promise<User | null> => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('friendCode', '==', friendCode.toUpperCase()));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return null;
    
    const userDoc = snapshot.docs[0];
    return { id: userDoc.id, ...userDoc.data() } as User;
  };

  const addFriend = async (friendId: string) => {
    if (!user) return;
    
    const userRef = doc(db, 'users', user.uid);
    const friendRef = doc(db, 'users', friendId);
    
    // Add friend to current user's friends list
    await updateDoc(userRef, {
      friends: arrayUnion(friendId)
    });
    
    // Add current user to friend's friends list
    await updateDoc(friendRef, {
      friends: arrayUnion(user.uid)
    });
  };

  const removeFriend = async (friendId: string) => {
    if (!user) return;
    
    const userRef = doc(db, 'users', user.uid);
    const friendRef = doc(db, 'users', friendId);
    
    // Remove friend from current user's friends list
    await updateDoc(userRef, {
      friends: arrayRemove(friendId)
    });
    
    // Remove current user from friend's friends list
    await updateDoc(friendRef, {
      friends: arrayRemove(user.uid)
    });
  };

  const updateFriendGroups = async (groups: FriendGroup[]) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), { friendGroups: groups });
  };

  const updateDefaultVisibility = async (
    visibility: TaskVisibility,
    visibilityList?: string[]
  ) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), {
      defaultVisibility: visibility,
      defaultVisibilityList: visibilityList || [],
    });
  };

  return {
    friends,
    loading,
    searchUsers,
    searchByFriendCode,
    addFriend,
    removeFriend,
    updateFriendGroups,
    updateDefaultVisibility,
  };
}
