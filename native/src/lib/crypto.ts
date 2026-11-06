/**
 * End-to-end encryption primitives for the native app.
 *
 * KEEP IN STEP WITH: utils/crypto.ts (the PWA, WebCrypto). Formats must stay byte-for-byte identical:
 *  - key       : 32 random bytes, exported as standard base64 (with padding) of the RAW key (WebCrypto 'raw' export)
 *  - ciphertext: 'e1:' + base64( iv[12] || ciphertext || gcmTag[16] )   (WebCrypto AES-GCM output already ends with the tag)
 *  - legacy    : the same without the 'e1:' prefix (decrypt only)
 *  - sharedKeyId: `shared_${sorted ids}`
 * `scripts/test_crypto_parity.mts` runs the web module under Node and checks both directions. Never change a format
 * here without changing the PWA, and run that test after any edit.
 *
 * Implementation: @noble/ciphers AES-GCM (pure JS, works in Hermes) + expo-crypto for random bytes.
 */
import { gcm } from '@noble/ciphers/aes.js';

const IV_LENGTH = 12;
const KEY_BYTES = 32; // AES-256
const TAG_BYTES = 16;
const PREFIX = 'e1:';

// ---- random source (injectable so Node tests can run without Expo) ----------------------------------------------
type RandomFn = (n: number) => Uint8Array;
let randomSource: RandomFn | null = null;

export function setRandomSource(fn: RandomFn | null): void {
  randomSource = fn;
}

function randomBytes(n: number): Uint8Array {
  if (randomSource) return randomSource(n);
  try {
    // Lazy require: importing expo-crypto at module load would break Node (tests).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRandomBytes } = require('expo-crypto') as { getRandomBytes: (n: number) => Uint8Array };
    return getRandomBytes(n);
  } catch {
    const c = (globalThis as { crypto?: { getRandomValues?: <T extends ArrayBufferView>(a: T) => T } }).crypto;
    if (c?.getRandomValues) return c.getRandomValues(new Uint8Array(n));
    throw new Error('No secure random source available');
  }
}

// ---- base64 (standard alphabet, padded: same as btoa/atob) --------------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64[i]] = i;

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n\s]/g, '');
  if (clean.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(clean)) throw new Error('Invalid base64');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((clean.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_LOOKUP[clean[i]];
    const c1 = B64_LOOKUP[clean[i + 1]];
    const c2 = clean[i + 2] === '=' ? 0 : B64_LOOKUP[clean[i + 2]];
    const c3 = clean[i + 3] === '=' ? 0 : B64_LOOKUP[clean[i + 3]];
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

// ---- UTF-8 (TextEncoder/TextDecoder exist in Hermes, but keep a tiny fallback) ----------------------------------
function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}
function utf8Decode(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

// ---- key handling ---------------------------------------------------------------------------------------------------
/** A key is just its 32 raw bytes (the web uses a CryptoKey holding the same bytes). */
export type NudgeKey = Uint8Array;

export function generateKey(): NudgeKey {
  return randomBytes(KEY_BYTES);
}

/** Same string the web `exportKey` produces: base64 of the raw 32 bytes. */
export function exportKey(key: NudgeKey): string {
  return bytesToBase64(key);
}

/** Inverse of exportKey; accepts what the web `exportKey` wrote. */
export function importKey(keyData: string): NudgeKey {
  const bytes = base64ToBytes(keyData);
  if (bytes.length !== KEY_BYTES) throw new Error(`Invalid key length: ${bytes.length}`);
  return bytes;
}

// ---- encrypt / decrypt ----------------------------------------------------------------------------------------------
/** Encrypt text. `iv` is only for tests (fixed vectors); production always uses a fresh random IV. */
export function encrypt(text: string, key: NudgeKey, iv?: Uint8Array): string {
  const nonce = iv ?? randomBytes(IV_LENGTH);
  if (nonce.length !== IV_LENGTH) throw new Error('IV must be 12 bytes');
  const sealed = gcm(key, nonce).encrypt(utf8Encode(text)); // ciphertext || 16-byte tag
  const combined = new Uint8Array(IV_LENGTH + sealed.length);
  combined.set(nonce, 0);
  combined.set(sealed, IV_LENGTH);
  return PREFIX + bytesToBase64(combined);
}

/** Decrypt text. Throws on wrong key / corrupt data (callers show a placeholder, like the PWA). */
export function decrypt(encryptedData: string, key: NudgeKey): string {
  const toDecode = encryptedData.startsWith(PREFIX) ? encryptedData.slice(PREFIX.length) : encryptedData;
  const combined = base64ToBytes(toDecode);
  if (combined.length < IV_LENGTH + TAG_BYTES) throw new Error('Ciphertext too short');
  const iv = combined.slice(0, IV_LENGTH);
  const sealed = combined.slice(IV_LENGTH);
  return utf8Decode(gcm(key, iv).decrypt(sealed));
}

/** Same heuristic as the web: 'e1:' prefix, or legacy base64 of at least 36 chars. */
export function isEncrypted(data: string): boolean {
  if (!data || data.length < 20) return false;
  if (data.startsWith(PREFIX)) return true;
  const base64Pattern = /^[A-Za-z0-9+/]+=*$/;
  return base64Pattern.test(data) && data.length >= 36;
}

export function generateSharedKeyId(userId1: string, userId2: string): string {
  const sorted = [userId1, userId2].sort();
  return `shared_${sorted[0]}_${sorted[1]}`;
}

export const SELF_PLACEHOLDER = "Couldn't decrypt";
export const FRIEND_PLACEHOLDER = "[Couldn't decrypt]";
