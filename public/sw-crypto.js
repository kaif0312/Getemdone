/**
 * Standalone crypto for service worker - decrypt notification content.
 * Must work in service worker context (no imports, uses importScripts).
 */
(function () {
  const IV_LENGTH = 12;
  const TAG_LENGTH = 128;
  const DB_NAME = 'GetDoneNotificationKeys';
  const STORE_NAME = 'keys';
  const KEY = 'user_keys';

  function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function importKey(keyData) {
    const keyBuffer = base64ToArrayBuffer(keyData);
    return crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt']
    );
  }

  function decrypt(encryptedData, key) {
    const toDecode = encryptedData.startsWith('e1:') ? encryptedData.slice(3) : encryptedData;
    const combined = base64ToArrayBuffer(toDecode);
    const combinedArray = new Uint8Array(combined);
    const iv = combinedArray.slice(0, IV_LENGTH);
    const encrypted = combinedArray.slice(IV_LENGTH);
    return crypto.subtle
      .decrypt(
        { name: 'AES-GCM', iv: iv, tagLength: TAG_LENGTH },
        key,
        encrypted
      )
      .then((decrypted) => new TextDecoder().decode(decrypted));
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    });
  }

  function getKeysFromIndexedDB() {
    return openDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(KEY);
        tx.oncomplete = () => {
          db.close();
          resolve(req.result || null);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });
    });
  }

  /**
   * Decrypt notification content. Returns { taskText, commentText } or null if decryption fails.
   * @param {string} encryptedTaskText
   * @param {string} encryptedCommentText
   * @param {string} fromUserId - the person who encrypted (reactor or commenter)
   */
  self.decryptNotificationContent = async function (
    encryptedTaskText,
    encryptedCommentText,
    fromUserId
  ) {
    if (!encryptedTaskText && !encryptedCommentText) return { taskText: '', commentText: '' };
    if (!fromUserId) return null;

    try {
      const keys = await getKeysFromIndexedDB();
      if (!keys || !keys.friendKeys || !keys.friendKeys[fromUserId]) {
        return null;
      }
      const friendKeyData = keys.friendKeys[fromUserId];
      const key = await importKey(friendKeyData);

      let taskText = '';
      let commentText = '';

      if (encryptedTaskText) {
        try {
          taskText = await decrypt(encryptedTaskText, key);
        } catch {
          taskText = '';
        }
      }
      if (encryptedCommentText) {
        try {
          commentText = await decrypt(encryptedCommentText, key);
        } catch {
          commentText = '';
        }
      }
      return { taskText, commentText };
    } catch (err) {
      console.warn('[sw-crypto] Decrypt failed:', err);
      return null;
    }
  };

  self.isEncrypted = function (str) {
    if (!str || str.length < 20) return false;
    if (str.startsWith('e1:')) return true;
    return /^[A-Za-z0-9+/]+=*$/.test(str) && str.length >= 36;
  };
})();
