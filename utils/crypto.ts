/**
 * End-to-End Encryption (E2EE) Utilities
 * 
 * Uses Web Crypto API for client-side encryption/decryption
 * All sensitive data is encrypted before being sent to Firebase
 */

// Encryption algorithm: AES-GCM (authenticated encryption)
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256; // 256-bit keys
const IV_LENGTH = 12; // 96-bit IV for GCM
const TAG_LENGTH = 128; // 128-bit authentication tag

/**
 * Generate a random encryption key
 */
export async function generateKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a key from a password using PBKDF2
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  // Ensure salt is a proper BufferSource by creating a new Uint8Array from the buffer
  const saltBuffer = new Uint8Array(salt.buffer, salt.byteOffset, salt.byteLength);

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random salt for key derivation
 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Export a key to a base64 string for storage
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64(exported);
}

/**
 * Import a key from a base64 string
 */
export async function importKey(keyData: string): Promise<CryptoKey> {
  const keyBuffer = base64ToArrayBuffer(keyData);
  return await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt text data
 */
export async function encrypt(
  text: string,
  key: CryptoKey
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Generate a random IV for each encryption
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  
  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv,
      tagLength: TAG_LENGTH,
    },
    key,
    data
  );
  
  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  // Return with version prefix so we can reliably detect encrypted data (including short strings)
  return 'e1:' + arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypt text data
 */
export async function decrypt(
  encryptedData: string,
  key: CryptoKey
): Promise<string> {
  try {
    // Strip version prefix if present (e1: = encrypted format v1)
    const toDecode = encryptedData.startsWith('e1:') ? encryptedData.slice(3) : encryptedData;
    // Convert base64 to ArrayBuffer
    const combined = base64ToArrayBuffer(toDecode);
    const combinedArray = new Uint8Array(combined);
    
    // Extract IV and encrypted data
    const iv = combinedArray.slice(0, IV_LENGTH);
    const encrypted = combinedArray.slice(IV_LENGTH);
    
    // Decrypt the data
    const decrypted = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
        tagLength: TAG_LENGTH,
      },
      key,
      encrypted
    );
    
    // Convert to string
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    // Rethrow original so caller can handle (e.g. show placeholder instead of ciphertext)
    throw error;
  }
}

/**
 * Check if a string is encrypted (version prefix or legacy base64 format)
 */
export function isEncrypted(data: string): boolean {
  if (!data || data.length < 20) return false;
  // New format: explicit prefix (catches short encrypted strings like "Buy milk")
  if (data.startsWith('e1:')) return true;
  // Legacy format: base64 with min length (IV 12 + tag 16 + 1 byte = 29 bytes = 39 base64 chars)
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  return base64Pattern.test(data) && data.length >= 36;
}

/**
 * Helper: Convert ArrayBuffer to base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper: Convert base64 to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate a shared key ID for friend relationships
 */
export function generateSharedKeyId(userId1: string, userId2: string): string {
  // Always sort IDs to ensure consistent key ID regardless of order
  const sorted = [userId1, userId2].sort();
  return `shared_${sorted[0]}_${sorted[1]}`;
}
