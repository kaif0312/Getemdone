/**
 * Encryption context. Same API and semantics as hooks/useEncryption.ts (PWA), on top of lib/crypto.ts + lib/keyring.ts.
 * Mounted once under <AuthProvider>. Feature code never touches keys: use the encrypt/decrypt helpers (or the data hooks,
 * which already do it).
 *
 * Rules (do not change without the PWA):
 *  - E2EE_ENABLED false => encryptFor* return the plaintext; decrypt* still read existing 'e1:' data.
 *  - Never use a temporary key on failure; retry loading the real one (2s,4s,8s,16s then every 30s).
 *  - Placeholders: self "Couldn't decrypt", friend "[Couldn't decrypt]".
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { E2EE_ENABLED } from '@/lib/config';
import { FRIEND_PLACEHOLDER, SELF_PLACEHOLDER, decrypt, encrypt, isEncrypted } from '@/lib/crypto';
import { Keyring } from '@/lib/keyring';
import { useAuth } from './useAuth';

export interface EncryptionApi {
  isInitialized: boolean;
  isLoading: boolean;
  encryptForSelf: (text: string) => Promise<string>;
  decryptForSelf: (text: string) => Promise<string>;
  encryptForFriend: (text: string, friendId: string) => Promise<string>;
  decryptFromFriend: (text: string, friendId: string) => Promise<string>;
  /** Tries: own key, task owner's shared key, commenter's shared key. */
  decryptComment: (text: string, taskOwnerId: string, commenterId: string, currentUserId: string) => Promise<string>;
  reloadKeys: () => Promise<void>;
}

const EncryptionContext = createContext<EncryptionApi | null>(null);

export function EncryptionProvider({ children }: { children: React.ReactNode }) {
  const { uid, profile } = useAuth();
  const ring = useRef<Keyring | null>(null);
  const [isInitialized, setInitialized] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const retry = useRef({ n: 0, timer: null as ReturnType<typeof setTimeout> | null });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    ring.current = null;
    setInitialized(false);
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const kr = new Keyring(uid);

    const attempt = async () => {
      try {
        await kr.init();
        if (cancelled) return;
        ring.current = kr;
        retry.current.n = 0;
        setInitialized(true);
        setLoading(false);
      } catch (e) {
        console.warn('[encryption] init failed, will retry', e);
        if (cancelled) return;
        const n = retry.current.n++;
        const delay = n < 4 ? 2000 * Math.pow(2, n) : 30000;
        retry.current.timer = setTimeout(attempt, delay);
        setLoading(false);
      }
    };
    void attempt();
    return () => {
      cancelled = true;
      if (retry.current.timer) clearTimeout(retry.current.timer);
    };
  }, [uid, reloadTick]);

  // Make sure a shared key exists for every friend so their older data stays readable (the PWA does the same).
  const friendsKey = (profile?.friends ?? []).slice().sort().join(',');
  useEffect(() => {
    if (!isInitialized || !ring.current || !friendsKey) return;
    void ring.current.ensureFriendKeys(friendsKey.split(','));
  }, [isInitialized, friendsKey]);

  const encryptForSelf = useCallback(async (text: string) => {
    if (!E2EE_ENABLED || !text) return text;
    const k = ring.current?.master;
    if (!k) return text;
    try {
      return encrypt(text, k);
    } catch {
      return text;
    }
  }, []);

  const decryptForSelf = useCallback(async (text: string) => {
    const k = ring.current?.master;
    if (!k || !text) return text;
    if (!isEncrypted(text)) return text;
    try {
      return decrypt(text, k);
    } catch {
      return SELF_PLACEHOLDER;
    }
  }, []);

  const encryptForFriend = useCallback(async (text: string, friendId: string) => {
    if (!E2EE_ENABLED || !text) return text;
    const k = await ring.current?.getSharedKey(friendId);
    if (!k) return text;
    try {
      return encrypt(text, k);
    } catch {
      return text;
    }
  }, []);

  const decryptFromFriend = useCallback(async (text: string, friendId: string) => {
    if (!text) return text;
    if (!isEncrypted(text)) return text;
    const k = await ring.current?.getSharedKey(friendId);
    if (!k) return FRIEND_PLACEHOLDER;
    try {
      return decrypt(text, k);
    } catch {
      return FRIEND_PLACEHOLDER;
    }
  }, []);

  const decryptComment = useCallback(
    async (text: string, taskOwnerId: string, commenterId: string, currentUserId: string) => {
      void currentUserId;
      if (!text || !isEncrypted(text)) return text;
      const r1 = await decryptForSelf(text);
      if (r1 !== SELF_PLACEHOLDER) return r1;
      const r2 = await decryptFromFriend(text, taskOwnerId);
      if (r2 !== FRIEND_PLACEHOLDER) return r2;
      if (commenterId !== taskOwnerId) {
        const r3 = await decryptFromFriend(text, commenterId);
        if (r3 !== FRIEND_PLACEHOLDER) return r3;
      }
      return FRIEND_PLACEHOLDER;
    },
    [decryptForSelf, decryptFromFriend],
  );

  const reloadKeys = useCallback(async () => setReloadTick((t) => t + 1), []);

  const value = useMemo<EncryptionApi>(
    () => ({ isInitialized, isLoading, encryptForSelf, decryptForSelf, encryptForFriend, decryptFromFriend, decryptComment, reloadKeys }),
    [isInitialized, isLoading, encryptForSelf, decryptForSelf, encryptForFriend, decryptFromFriend, decryptComment, reloadKeys],
  );
  return <EncryptionContext.Provider value={value}>{children}</EncryptionContext.Provider>;
}

export function useEncryption(): EncryptionApi {
  const v = useContext(EncryptionContext);
  if (!v) throw new Error('useEncryption must be used inside <EncryptionProvider>');
  return v;
}
