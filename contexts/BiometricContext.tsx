'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  supportsBiometric,
  base64UrlDecode,
  base64UrlEncode,
} from '@/lib/biometric';

const SESSION_KEY = 'nudge_biometric_unlocked';
const CREDENTIAL_KEY = 'nudge_biometric_credential_';
const BACKGROUND_REPROMPT_MS = 5 * 60 * 1000; // 5 minutes

type BiometricStatus =
  | 'idle'
  | 'verifying'
  | 'success'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'unavailable';

interface BiometricContextType {
  supportsBiometric: boolean;
  biometricEnabled: boolean;
  credentialId: string | null;
  isLocked: boolean;
  status: BiometricStatus;
  errorMessage: string | null;
  enroll: () => Promise<boolean>;
  disable: () => Promise<void>;
  verify: () => Promise<boolean>;
  unlockWithPassword: (password: string) => Promise<boolean>;
  lock: () => void;
  unlock: () => void;
}

const BiometricContext = createContext<BiometricContextType | undefined>(
  undefined
);

export function BiometricProvider({ children }: { children: React.ReactNode }) {
  const { user, userData } = useAuth();
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [status, setStatus] = useState<BiometricStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const backgroundTimeRef = useRef<number>(Date.now());

  const supports = supportsBiometric();

  // Sync from userData
  useEffect(() => {
    if (!userData) return;
    const enabled = !!userData.biometricEnabled;
    const cid = userData.biometricCredentialId || null;
    setBiometricEnabled(enabled);
    setCredentialId(cid);
  }, [userData?.biometricEnabled, userData?.biometricCredentialId]);

  // Determine if we should show lock screen
  useEffect(() => {
    if (!user || !userData || !supports) return;
    if (!biometricEnabled || !credentialId) return;

    const sessionUnlocked = typeof window !== 'undefined' && sessionStorage.getItem(SESSION_KEY) === '1';
    if (sessionUnlocked) {
      setIsLocked(false);
      return;
    }

    setIsLocked(true);
  }, [user, userData, supports, biometricEnabled, credentialId]);

  // Visibility change: re-prompt after 5+ min in background
  useEffect(() => {
    if (!biometricEnabled || !credentialId || !supports) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        backgroundTimeRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - backgroundTimeRef.current;
        if (elapsed >= BACKGROUND_REPROMPT_MS) {
          sessionStorage.removeItem(SESSION_KEY);
          setIsLocked(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [biometricEnabled, credentialId, supports]);

  const unlock = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(SESSION_KEY, '1');
    }
    setIsLocked(false);
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  const lock = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
    }
    setIsLocked(true);
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  const enroll = useCallback(async (): Promise<boolean> => {
    if (!user || !userData || !supports) return false;

    setStatus('idle');
    setErrorMessage(null);

    try {
      const userId = user.uid;
      const userHandle = new TextEncoder().encode(userId);

      const options: CredentialCreationOptions = {
        publicKey: {
          rp: {
            name: 'Nudge',
            id: typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost',
          },
          user: {
            id: userHandle,
            name: user.email || user.uid,
            displayName: userData.displayName || 'User',
          },
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
        },
      };

      const credential = (await navigator.credentials.create(
        options
      )) as PublicKeyCredential | null;

      if (!credential) {
        setStatus('cancelled');
        return false;
      }

      const rawId = new Uint8Array(credential.rawId);
      const id = base64UrlEncode(rawId);

      const userDocRef = doc(db, 'users', userId);
      await updateDoc(userDocRef, {
        biometricCredentialId: id,
        biometricEnabled: true,
      });

      const storageKey = `${CREDENTIAL_KEY}${userId}`;
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, id);
      }

      setCredentialId(id);
      setBiometricEnabled(true);
      unlock();
      return true;
    } catch (err) {
      console.error('[Biometric] Enrollment error:', err);
      setStatus('failed');
      setErrorMessage('Face ID setup failed');
      return false;
    }
  }, [user, userData, supports, unlock]);

  const disable = useCallback(async () => {
    if (!user) return;

    const userDocRef = doc(db, 'users', user.uid);
    await updateDoc(userDocRef, {
      biometricCredentialId: null,
      biometricEnabled: false,
    });

    if (typeof window !== 'undefined') {
      localStorage.removeItem(`${CREDENTIAL_KEY}${user.uid}`);
      sessionStorage.removeItem(SESSION_KEY);
    }

    setCredentialId(null);
    setBiometricEnabled(false);
    setIsLocked(false);
    setStatus('idle');
    setErrorMessage(null);
  }, [user]);

  const verify = useCallback(async (): Promise<boolean> => {
    if (!credentialId || !supports) {
      setStatus('unavailable');
      return false;
    }

    setStatus('verifying');
    setErrorMessage(null);

    try {
      let credIdBytes: Uint8Array;
      try {
        credIdBytes = base64UrlDecode(credentialId);
      } catch {
        setStatus('unavailable');
        setErrorMessage('Credential not found. Please re-enable Face ID in Settings.');
        return false;
      }

      const options: CredentialRequestOptions = {
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [
            {
              id: new Uint8Array(credIdBytes) as unknown as BufferSource,
              type: 'public-key',
            },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      };

      const credential = (await navigator.credentials.get(
        options
      )) as PublicKeyCredential | null;

      if (!credential) {
        setStatus('cancelled');
        return false;
      }

      setStatus('success');
      // unlock() is called by FaceIDLockScreen after fade-out animation
      return true;
    } catch (err) {
      console.error('[Biometric] Verification error:', err);
      const msg = String(err);
      if (msg.includes('timeout') || msg.includes('Timeout')) {
        setStatus('timeout');
        setErrorMessage('Timed out');
      } else {
        setStatus('failed');
        setErrorMessage('Authentication failed');
      }
      return false;
    }
  }, [credentialId, supports, unlock]);

  const unlockWithPassword = useCallback(
    async (password: string): Promise<boolean> => {
      if (!user?.email) return false;

      setStatus('verifying');
      setErrorMessage(null);

      try {
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(auth.currentUser!, credential);
        setStatus('success');
        // unlock() is called by FaceIDLockScreen after fade-out animation
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus('failed');
        setErrorMessage(msg.includes('wrong-password') ? 'Incorrect password' : 'Authentication failed');
        return false;
      }
    },
    [user, unlock]
  );

  const value: BiometricContextType = {
    supportsBiometric: supports,
    biometricEnabled,
    credentialId,
    isLocked,
    status,
    errorMessage,
    enroll,
    disable,
    verify,
    unlockWithPassword,
    lock,
    unlock,
  };

  return (
    <BiometricContext.Provider value={value}>{children}</BiometricContext.Provider>
  );
}

export function useBiometric() {
  const context = useContext(BiometricContext);
  if (context === undefined) {
    throw new Error('useBiometric must be used within a BiometricProvider');
  }
  return context;
}
