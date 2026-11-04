/**
 * Auth + profile. Port of contexts/AuthContext.tsx (same user-doc shape, same friend code alphabet, same whitelist rules).
 *   const { user, uid, profile, loading, signIn, signUp, signInWithToken, signOut, updateProfile } = useAuth();
 * `profile` is the live users/{uid} doc (null until loaded / signed out). `loading` is true until auth AND the first profile
 * snapshot have resolved, so route guards can wait on it.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail, signInWithCustomToken, signInWithEmailAndPassword,
  signOut as fbSignOut, type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, getDocFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@/lib/defaults';
import { setActiveZone } from '@/lib/dates';
import { unregisterPushToken } from '@/lib/push';
import type { UserDoc } from '@/lib/types-extra';

const FRIEND_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alikes, same as the PWA

export function generateFriendCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += FRIEND_CODE_CHARS.charAt(Math.floor(Math.random() * FRIEND_CODE_CHARS.length));
  return code;
}

interface AuthValue {
  user: FirebaseUser | null;
  uid: string | null;
  profile: UserDoc | null;
  loading: boolean;
  /** Beta whitelist state (null = unknown / signed out). Exposed, not enforced: see native/AGENTS.md. */
  isWhitelisted: boolean | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  /** WhatsApp login: Firebase custom token from /api/app/login/poll. */
  signInWithToken: (customToken: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** merge-write to users/{uid} (the doc rules let the owner write any field). */
  updateProfile: (patch: Partial<UserDoc>) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function checkBetaWhitelist(email: string): Promise<boolean> {
  if (!email) return false;
  try {
    return (await getDoc(doc(db, 'betaWhitelist', email.toLowerCase()))).exists();
  } catch {
    return false;
  }
}

/** Auto-whitelist a brand-new user (never re-adds someone whose doc already exists = removed on purpose). */
async function addToWhitelistIfNew(email: string, userDocExists: boolean): Promise<void> {
  if (!email || userDocExists) return;
  const lower = email.toLowerCase();
  try {
    const ref = doc(db, 'betaWhitelist', lower);
    if (!(await getDoc(ref)).exists()) await setDoc(ref, { email: lower, addedAt: Date.now(), autoAdded: true });
  } catch (e) {
    console.warn('[auth] whitelist add failed', e);
  }
}

function newUserDoc(fb: FirebaseUser, displayName?: string): UserDoc {
  return {
    id: fb.uid,
    displayName: displayName || fb.displayName || fb.email?.split('@')[0] || 'Friend',
    email: fb.email || '',
    ...(fb.photoURL ? { photoURL: fb.photoURL } : {}),
    friendCode: generateFriendCode(),
    friends: [],
    createdAt: Date.now(),
    streakData: { currentStreak: 0, longestStreak: 0, lastCompletionDate: '', completionHistory: {}, missedCommitments: {} },
    notificationSettings: DEFAULT_NOTIFICATION_SETTINGS,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserDoc | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [isWhitelisted, setIsWhitelisted] = useState<boolean | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthReady(true);
    if (!u) {
      whitelistChecked.current = '';
      setProfile(null);
      setIsWhitelisted(null);
      setProfileReady(true);
    } else {
      setProfileReady(false);
    }
  }), []);

  const uid = user?.uid ?? null;
  // "Today" everywhere follows users.timezone (else the device zone). Idempotent global write, set before children render.
  setActiveZone(profile?.timezone);

  // One whitelist lookup per email per session, not one per profile snapshot (every streak write re-fires the listener).
  const whitelistChecked = React.useRef<string>('');
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid);
    let cancelled = false;
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        const email = user.email || (snap.exists() ? (snap.data() as UserDoc).email : '');
        if (email) {
          if (whitelistChecked.current !== email.toLowerCase()) {
            whitelistChecked.current = email.toLowerCase();
            let ok = await checkBetaWhitelist(email);
            if (!ok) {
              await addToWhitelistIfNew(email, snap.exists());
              ok = await checkBetaWhitelist(email);
            }
            if (!cancelled) setIsWhitelisted(ok);
          }
        } else if (!cancelled) {
          setIsWhitelisted(null); // WhatsApp-only account: no email to whitelist
        }

        if (snap.exists()) {
          const data = snap.data() as UserDoc;
          if (!data.friendCode) {
            const friendCode = generateFriendCode();
            await setDoc(ref, { friendCode }, { merge: true });
            if (!cancelled) setProfile({ ...data, id: snap.id, friendCode });
          } else if (!cancelled) {
            setProfile({ ...data, id: snap.id });
          }
        } else {
          // A cached "missing" can be stale: confirm on the server before creating (never overwrite a real profile).
          try {
            const server = await getDocFromServer(ref);
            if (server.exists()) {
              if (!cancelled) setProfile({ ...(server.data() as UserDoc), id: server.id });
              if (!cancelled) setProfileReady(true);
              return;
            }
          } catch (e) {
            console.warn('[auth] getDocFromServer failed, creating profile', e);
          }
          const fresh = newUserDoc(user);
          try {
            await setDoc(ref, fresh, { merge: true });
            if (!cancelled) setProfile(fresh);
          } catch (e) {
            console.error('[auth] could not create profile', e);
          }
        }
        if (!cancelled) setProfileReady(true);
      },
      (err) => {
        console.error('[auth] profile listener error', err);
        if (!cancelled) setProfileReady(true);
      },
    );
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    const fresh = newUserDoc(cred.user, displayName.trim());
    fresh.email = email.trim();
    await addToWhitelistIfNew(fresh.email, false);
    await setDoc(doc(db, 'users', cred.user.uid), fresh, { merge: true });
  }, []);

  const signInWithToken = useCallback(async (customToken: string) => {
    await signInWithCustomToken(auth, customToken);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const signOut = useCallback(async () => {
    // Drop this phone's push token first (needs the session), but never let it block signing out.
    if (uid) await Promise.race([unregisterPushToken(uid), new Promise((r) => setTimeout(r, 3000))]);
    await fbSignOut(auth);
  }, [uid]);

  const updateProfile = useCallback(
    async (patch: Partial<UserDoc>) => {
      if (!uid) return;
      await setDoc(doc(db, 'users', uid), patch, { merge: true });
    },
    [uid],
  );

  const value = useMemo<AuthValue>(
    () => ({
      user, uid, profile, loading: !authReady || !profileReady, isWhitelisted,
      signIn, signUp, signInWithToken, resetPassword, signOut, updateProfile,
    }),
    [user, uid, profile, authReady, profileReady, isWhitelisted, signIn, signUp, signInWithToken, resetPassword, signOut, updateProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
