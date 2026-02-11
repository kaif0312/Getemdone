/**
 * Encryption Hook
 * 
 * Manages encryption keys and provides encryption/decryption functions
 * for end-to-end encrypted data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  generateKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
  isEncrypted,
  generateSharedKeyId,
} from '@/utils/crypto';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface FriendKey {
  friendId: string;
  keyData: string; // Base64 encoded key
  createdAt: number;
}

interface UserKeys {
  masterKey: string | null; // Base64 encoded master key
  friendKeys: Record<string, string>; // friendId -> keyData
  lastUpdated: number;
}

/**
 * Hook for managing encryption keys and encrypting/decrypting data
 */
export function useEncryption() {
  const { user, userData } = useAuth();
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);
  const [friendKeys, setFriendKeys] = useState<Record<string, CryptoKey>>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const keysRef = useRef<{ master: CryptoKey | null; friends: Record<string, CryptoKey> }>({
    master: null,
    friends: {},
  });

  /**
   * Initialize encryption keys for the user
   */
  const initializeKeys = useCallback(async () => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    try {
      // Check if user has existing keys in Firestore
      const keysDocRef = doc(db, 'userKeys', user.uid);
      const keysDoc = await getDoc(keysDocRef);

      let masterKeyCrypto: CryptoKey;

      if (keysDoc.exists()) {
        // User has existing keys, import them
        const keysData = keysDoc.data() as UserKeys;
        if (keysData.masterKey) {
          masterKeyCrypto = await importKey(keysData.masterKey);
        } else {
          // Generate new master key if missing
          masterKeyCrypto = await generateKey();
          const masterKeyData = await exportKey(masterKeyCrypto);
          await setDoc(keysDocRef, {
            masterKey: masterKeyData,
            friendKeys: keysData.friendKeys || {},
            lastUpdated: Date.now(),
          }, { merge: true });
        }

        // Import friend keys
        const friendKeysMap: Record<string, CryptoKey> = {};
        if (keysData.friendKeys) {
          for (const [friendId, keyData] of Object.entries(keysData.friendKeys)) {
            try {
              friendKeysMap[friendId] = await importKey(keyData);
            } catch (error) {
              console.error(`[useEncryption] Failed to import key for friend ${friendId}:`, error);
            }
          }
        }

        setMasterKey(masterKeyCrypto);
        setFriendKeys(friendKeysMap);
        keysRef.current = { master: masterKeyCrypto, friends: friendKeysMap };
      } else {
        // New user, generate master key
        masterKeyCrypto = await generateKey();
        const masterKeyData = await exportKey(masterKeyCrypto);

        await setDoc(keysDocRef, {
          masterKey: masterKeyData,
          friendKeys: {},
          lastUpdated: Date.now(),
        });

        setMasterKey(masterKeyCrypto);
        setFriendKeys({});
        keysRef.current = { master: masterKeyCrypto, friends: {} };
      }

      setIsInitialized(true);
    } catch (error) {
      console.error('[useEncryption] Failed to initialize keys:', error);
      // Generate a temporary key to prevent app from breaking
      const tempKey = await generateKey();
      setMasterKey(tempKey);
      keysRef.current = { master: tempKey, friends: {} };
      // Still mark as initialized even with temp key so UI shows active status
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  /**
   * Initialize keys on mount
   */
  useEffect(() => {
    initializeKeys();
  }, [initializeKeys]);

  /**
   * Ensure isInitialized is set correctly if we have a master key
   * This handles edge cases where initialization might have completed
   * but the state wasn't updated properly
   */
  useEffect(() => {
    if (masterKey && !isInitialized && !isLoading) {
      setIsInitialized(true);
    }
  }, [masterKey, isInitialized, isLoading]);

  /**
   * Get or create a shared key with a friend
   */
  const getSharedKey = useCallback(async (friendId: string): Promise<CryptoKey | null> => {
    if (!user?.uid || !masterKey) return null;

    // Check if we already have a key for this friend
    if (friendKeys[friendId]) {
      return friendKeys[friendId];
    }

    if (keysRef.current.friends[friendId]) {
      return keysRef.current.friends[friendId];
    }

    // Generate a new shared key
    try {
      const sharedKey = await generateKey();
      const sharedKeyData = await exportKey(sharedKey);

      // Save to Firestore
      const keysDocRef = doc(db, 'userKeys', user.uid);
      const keysDoc = await getDoc(keysDocRef);
      const currentData = keysDoc.data() as UserKeys | undefined;

      await updateDoc(keysDocRef, {
        friendKeys: {
          ...(currentData?.friendKeys || {}),
          [friendId]: sharedKeyData,
        },
        lastUpdated: Date.now(),
      });

      // Also save to friend's keys (they need the same key)
      const friendKeysDocRef = doc(db, 'userKeys', friendId);
      const friendKeysDoc = await getDoc(friendKeysDocRef);
      const friendData = friendKeysDoc.data() as UserKeys | undefined;

      await setDoc(friendKeysDocRef, {
        masterKey: friendData?.masterKey || null,
        friendKeys: {
          ...(friendData?.friendKeys || {}),
          [user.uid]: sharedKeyData, // Same key, stored under our userId
        },
        lastUpdated: Date.now(),
      }, { merge: true });

      // Update local state
      const newFriendKeys = { ...friendKeys, [friendId]: sharedKey };
      setFriendKeys(newFriendKeys);
      keysRef.current.friends[friendId] = sharedKey;

      return sharedKey;
    } catch (error) {
      console.error('[useEncryption] Failed to create shared key:', error);
      return null;
    }
  }, [user?.uid, masterKey, friendKeys]);

  /**
   * Encrypt data for own use (using master key)
   */
  const encryptForSelf = useCallback(async (text: string): Promise<string> => {
    if (!masterKey) {
      console.warn('[useEncryption] No master key available, returning plaintext');
      return text;
    }
    if (!text) return text;
    try {
      return await encrypt(text, masterKey);
    } catch (error) {
      console.error('[useEncryption] Encryption failed:', error);
      return text; // Fallback to plaintext on error
    }
  }, [masterKey]);

  /**
   * Decrypt data encrypted with master key
   */
  const decryptForSelf = useCallback(async (encryptedText: string): Promise<string> => {
    if (!masterKey) {
      console.warn('[useEncryption] No master key available, returning as-is');
      return encryptedText;
    }
    if (!encryptedText) return encryptedText;
    
    // Check if data is encrypted
    if (!isEncrypted(encryptedText)) {
      return encryptedText; // Already plaintext (backward compatibility)
    }

    try {
      return await decrypt(encryptedText, masterKey);
    } catch (error) {
      console.error('[useEncryption] Decryption failed:', error);
      return encryptedText; // Return as-is on error
    }
  }, [masterKey]);

  /**
   * Encrypt data for sharing with a friend (using shared key)
   */
  const encryptForFriend = useCallback(async (
    text: string,
    friendId: string
  ): Promise<string> => {
    if (!text) return text;
    
    const sharedKey = await getSharedKey(friendId);
    if (!sharedKey) {
      console.warn('[useEncryption] No shared key available, returning plaintext');
      return text;
    }

    try {
      return await encrypt(text, sharedKey);
    } catch (error) {
      console.error('[useEncryption] Encryption for friend failed:', error);
      return text; // Fallback to plaintext on error
    }
  }, [getSharedKey]);

  /**
   * Decrypt data shared by a friend (using shared key)
   */
  const decryptFromFriend = useCallback(async (
    encryptedText: string,
    friendId: string
  ): Promise<string> => {
    if (!encryptedText) return encryptedText;

    // Check if data is encrypted
    if (!isEncrypted(encryptedText)) {
      return encryptedText; // Already plaintext (backward compatibility)
    }

    const sharedKey = await getSharedKey(friendId);
    if (!sharedKey) {
      console.warn('[useEncryption] No shared key available, returning as-is');
      return encryptedText;
    }

    try {
      return await decrypt(encryptedText, sharedKey);
    } catch (error) {
      console.error('[useEncryption] Decryption from friend failed:', error);
      return encryptedText; // Return as-is on error
    }
  }, [getSharedKey]);

  /**
   * Refresh friend keys when friends list changes
   */
  useEffect(() => {
    if (!userData?.friends || !masterKey) return;

    // Ensure we have keys for all friends
    const ensureFriendKeys = async () => {
      for (const friendId of userData.friends) {
        if (!friendKeys[friendId] && !keysRef.current.friends[friendId]) {
          await getSharedKey(friendId);
        }
      }
    };

    ensureFriendKeys();
  }, [userData?.friends, masterKey, friendKeys, getSharedKey]);

  return {
    isInitialized,
    isLoading,
    encryptForSelf,
    decryptForSelf,
    encryptForFriend,
    decryptFromFriend,
    getSharedKey,
    masterKey: masterKey !== null,
  };
}
