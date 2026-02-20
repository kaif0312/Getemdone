/**
 * Biometric / WebAuthn detection for Face ID on iOS.
 * WebAuthn triggers Face ID on supported iOS devices (iPhone X+, iOS 16+)
 * when the app is installed as PWA or in Safari.
 */

export const isIOS = (): boolean =>
  typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

export const hasWebAuthn = (): boolean =>
  typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

export const supportsBiometric = (): boolean => isIOS() && hasWebAuthn();

/** Base64url decode for credential ID */
export function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Base64url encode for credential ID */
export function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
