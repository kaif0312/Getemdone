/**
 * Key management for E2EE, Firestore side. Port of the key handling in hooks/useEncryption.ts (initializeKeys, getSharedKey).
 * Documents: userKeys/{uid} = { masterKey: base64|null, friendKeys: { [friendId]: base64 }, lastUpdated }.
 * The shared key for a pair is stored in BOTH users' docs (own.friendKeys[friend] and friend.friendKeys[me]) and is the same
 * 32 bytes. Rules (firestore.rules userKeys): a friend may only touch friendKeys.<their uid> of your doc.
 * KEEP IN STEP with hooks/useEncryption.ts. Pure crypto lives in crypto.ts.
 */
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { exportKey, generateKey, importKey, type NudgeKey } from './crypto';

interface UserKeysDoc {
  masterKey: string | null;
  friendKeys: Record<string, string>;
  lastUpdated: number;
}

export class Keyring {
  master: NudgeKey | null = null;
  friends: Record<string, NudgeKey> = {};

  constructor(readonly uid: string) {}

  /**
   * Load (or create) the user's keys. Throws on any failure: callers retry, and must NEVER fall back to a temporary key
   * (that would encrypt/decrypt with the wrong key and hide the user's data), exactly like the PWA.
   */
  async init(): Promise<void> {
    const ref = doc(db, 'userKeys', this.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as UserKeysDoc;
      if (data.masterKey) {
        this.master = importKey(data.masterKey);
      } else {
        this.master = generateKey();
        await setDoc(ref, { masterKey: exportKey(this.master), friendKeys: data.friendKeys || {}, lastUpdated: Date.now() }, { merge: true });
      }
      const friends: Record<string, NudgeKey> = {};
      for (const [friendId, keyData] of Object.entries(data.friendKeys || {})) {
        try {
          friends[friendId] = importKey(keyData);
        } catch (e) {
          console.warn(`[keyring] bad key for friend ${friendId}`, e);
        }
      }
      this.friends = friends;
    } else {
      this.master = generateKey();
      await setDoc(ref, { masterKey: exportKey(this.master), friendKeys: {}, lastUpdated: Date.now() });
      this.friends = {};
    }
  }

  /** Get or create the shared key with a friend (checks their doc first: they may have created it when encrypting for us). */
  async getSharedKey(friendId: string): Promise<NudgeKey | null> {
    if (!this.master) return null;
    if (this.friends[friendId]) return this.friends[friendId];

    try {
      const friendSnap = await getDoc(doc(db, 'userKeys', friendId));
      const theirs = (friendSnap.data() as UserKeysDoc | undefined)?.friendKeys?.[this.uid];
      if (theirs) {
        const key = importKey(theirs);
        this.friends[friendId] = key;
        return key;
      }
    } catch (err) {
      console.warn('[keyring] could not read friend keys doc', err);
    }

    try {
      const key = generateKey();
      const keyData = exportKey(key);

      const ownRef = doc(db, 'userKeys', this.uid);
      const ownSnap = await getDoc(ownRef);
      const own = ownSnap.data() as UserKeysDoc | undefined;
      await updateDoc(ownRef, { friendKeys: { ...(own?.friendKeys || {}), [friendId]: keyData }, lastUpdated: Date.now() });

      const friendRef = doc(db, 'userKeys', friendId);
      const friendSnap = await getDoc(friendRef);
      const friend = friendSnap.data() as UserKeysDoc | undefined;
      await setDoc(
        friendRef,
        { masterKey: friend?.masterKey || null, friendKeys: { ...(friend?.friendKeys || {}), [this.uid]: keyData }, lastUpdated: Date.now() },
        { merge: true },
      );

      this.friends[friendId] = key;
      return key;
    } catch (error) {
      console.error('[keyring] failed to create shared key', error);
      return null;
    }
  }

  /** Make sure a shared key exists for every friend (so older data from them can be read). Sequential on purpose. */
  async ensureFriendKeys(friendIds: string[]): Promise<void> {
    for (const id of friendIds) {
      if (!this.friends[id]) await this.getSharedKey(id);
    }
  }
}
