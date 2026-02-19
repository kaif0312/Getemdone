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
import { persistKeysForSW } from '@/lib/notificationKeys';
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
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | number | null>(null);
  const keysRef = useRef<{ master: CryptoKey | null; friends: Record<string, CryptoKey> }>({
    master: null,
    friends: {},
  });

  /**
   * Initialize encryption keys for the user.
   * Never use a temporary key on failure - that would encrypt/decrypt with the wrong key and hide user data.
   */
  const initializeKeys = useCallback(async (isRetry = false) => {
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
        retryCountRef.current = 0;
        // Persist keys for service worker to decrypt push notifications
        persistKeysForSW(user.uid, {
          masterKey: keysData.masterKey,
          friendKeys: keysData.friendKeys || {},
        });
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
        retryCountRef.current = 0;
        persistKeysForSW(user.uid, {
          masterKey: masterKeyData,
          friendKeys: {},
        });
      }

      setIsInitialized(true);
    } catch (error) {
      console.error('[useEncryption] Failed to initialize keys:', error);
      // Do NOT use a temporary key - that would make existing data unreadable (wrong key).
      setMasterKey(null);
      keysRef.current = { master: null, friends: {} };
      setIsInitialized(false);
      // Retry loading the real key with backoff (2s, 4s, 8s, 16s, then every 30s)
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      const n = retryCountRef.current;
      retryCountRef.current = n + 1;
      const delay = n < 4 ? 2000 * Math.pow(2, n) : 30000;
      if (typeof window !== 'undefined') {
        retryTimeoutRef.current = window.setTimeout(() => {
          retryTimeoutRef.current = null;
          initializeKeys(true);
        }, delay);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user?.uid]);

  /**
   * Reload encryption key from Firestore (e.g. after "Reload encryption key" in Settings)
   */
  const reloadKeys = useCallback(async () => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    retryCountRef.current = 0;
    setMasterKey(null);
    setFriendKeys({});
    keysRef.current = { master: null, friends: {} };
    setIsInitialized(false);
    setIsLoading(true);
    await initializeKeys(false);
  }, [initializeKeys]);

  /**
   * Initialize keys on mount; clear retry timeout on unmount
   */
  useEffect(() => {
    initializeKeys(false);
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
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

    // Check friend's doc before creating - they may have created the key when encrypting for us
    try {
      const friendKeysDocRef = doc(db, 'userKeys', friendId);
      const friendKeysDoc = await getDoc(friendKeysDocRef);
      const friendData = friendKeysDoc.data() as UserKeys | undefined;
      const friendKeyData = friendData?.friendKeys?.[user.uid];
      if (friendKeyData) {
        const sharedKey = await importKey(friendKeyData);
        setFriendKeys(prev => ({ ...prev, [friendId]: sharedKey }));
        keysRef.current.friends[friendId] = sharedKey;
        return sharedKey;
      }
    } catch (err) {
      console.warn('[useEncryption] Could not read friend keys doc:', err);
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
    } catch {
      // Wrong key, corrupted data, or not actually encrypted - show placeholder instead of ciphertext
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useEncryption] Decryption failed (key mismatch or corrupted). Showing placeholder.');
      }
      return "Couldn't decrypt";
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
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useEncryption] No shared key for friend', friendId, '- showing placeholder');
      }
      return "[Couldn't decrypt]";
    }

    try {
      return await decrypt(encryptedText, sharedKey);
    } catch {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useEncryption] Decryption from friend failed. Showing placeholder.');
      }
      return "[Couldn't decrypt]";
    }
  }, [getSharedKey]);

  const SELF_PLACEHOLDER = "Couldn't decrypt";
  const FRIEND_PLACEHOLDER = "[Couldn't decrypt]";

  /**
   * Decrypt a comment with fallback strategies (handles legacy/incorrectly encrypted comments)
   */
  const decryptComment = useCallback(async (
    encryptedText: string,
    taskOwnerId: string,
    commenterId: string,
    currentUserId: string
  ): Promise<string> => {
    if (!encryptedText) return encryptedText;
    if (!isEncrypted(encryptedText)) return encryptedText;

    // Try 1: master key (own comment on own task, or legacy)
    const r1 = await decryptForSelf(encryptedText);
    if (r1 !== SELF_PLACEHOLDER) return r1;

    // Try 2: shared key with task owner (comment on friend's task)
    const r2 = await decryptFromFriend(encryptedText, taskOwnerId);
    if (r2 !== FRIEND_PLACEHOLDER) return r2;

    // Try 3: shared key with commenter (friend's comment on own task)
    if (commenterId !== taskOwnerId) {
      const r3 = await decryptFromFriend(encryptedText, commenterId);
      if (r3 !== FRIEND_PLACEHOLDER) return r3;
    }

    return FRIEND_PLACEHOLDER;
  }, [decryptForSelf, decryptFromFriend]);

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

  /**
   * Re-persist keys to IndexedDB when friendKeys change (e.g. after ensureFriendKeys adds new keys).
   * This ensures the service worker can decrypt push notifications from friends.
   */
  useEffect(() => {
    if (!user?.uid || !isInitialized) return;

    const repersist = async () => {
      try {
        const keysDocRef = doc(db, 'userKeys', user.uid);
        const keysDoc = await getDoc(keysDocRef);
        if (keysDoc.exists()) {
          const keysData = keysDoc.data() as UserKeys;
          persistKeysForSW(user.uid, {
            masterKey: keysData.masterKey ?? null,
            friendKeys: keysData.friendKeys || {},
          });
        }
      } catch (err) {
        console.warn('[useEncryption] Failed to re-persist keys for SW:', err);
      }
    };

    repersist();
  }, [user?.uid, isInitialized, friendKeys]);

  /**
   * Re-persist keys when app becomes visible (user switches back to tab).
   * Ensures keys are fresh for SW decryption after background fetch.
   */
  useEffect(() => {
    if (!user?.uid || !isInitialized || typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        getDoc(doc(db, 'userKeys', user.uid))
          .then((keysDoc) => {
            if (keysDoc.exists()) {
              const keysData = keysDoc.data() as UserKeys;
              persistKeysForSW(user.uid, {
                masterKey: keysData.masterKey ?? null,
                friendKeys: keysData.friendKeys || {},
              });
            }
          })
          .catch((err) => console.warn('[useEncryption] Visibility persist failed:', err));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.uid, isInitialized]);

  return {
    isInitialized,
    isLoading,
    encryptForSelf,
    decryptForSelf,
    decryptComment,
    encryptForFriend,
    decryptFromFriend,
    getSharedKey,
    masterKey: masterKey !== null,
    reloadKeys,
  };
}
