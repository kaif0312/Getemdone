'use client';

import { useEffect, useState } from 'react';
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
import { User } from '@/lib/types';
import { useAuth } from '@/contexts/AuthContext';

export function useFriends() {
  const { user, userData } = useAuth();
  const [friends, setFriends] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !userData || !userData.friends || userData.friends.length === 0) {
      setFriends([]);
      setLoading(false);
      return;
    }

    const fetchFriends = async () => {
      const friendsData: User[] = [];
      
      for (const friendId of userData.friends) {
        const friendDoc = await getDoc(doc(db, 'users', friendId));
        if (friendDoc.exists()) {
          friendsData.push({ id: friendDoc.id, ...friendDoc.data() } as User);
        }
      }
      
      setFriends(friendsData);
      setLoading(false);
    };

    fetchFriends();
  }, [user, userData]);

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

  return {
    friends,
    loading,
    searchUsers,
    searchByFriendCode,
    addFriend,
    removeFriend,
  };
}
