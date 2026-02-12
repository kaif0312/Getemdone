/**
 * Persist encryption keys to IndexedDB for service worker to decrypt push notifications.
 * Keys are stored when the app loads so the SW can decrypt notifications when the app is closed.
 */

const DB_NAME = 'GetDoneNotificationKeys';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const KEY = 'user_keys';

export interface StoredKeys {
  userId: string;
  masterKey: string | null;
  friendKeys: Record<string, string>;
  updatedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function persistKeysForSW(
  userId: string,
  keysData: { masterKey: string | null; friendKeys: Record<string, string> }
): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const data: StoredKeys = {
      userId,
      masterKey: keysData.masterKey,
      friendKeys: keysData.friendKeys || {},
      updatedAt: Date.now(),
    };
    store.put(data, KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('[notificationKeys] Failed to persist keys for SW:', err);
  }
}

export async function getKeysForSW(): Promise<StoredKeys | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return req.result || null;
  } catch {
    return null;
  }
}
