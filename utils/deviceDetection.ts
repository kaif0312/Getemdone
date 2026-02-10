/**
 * Device detection utilities for iOS and PWA/standalone mode
 */

/**
 * Detects if the user is on an iOS device
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  // Check for iOS devices
  const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
  
  // Also check for iPad on iOS 13+ which reports as Mac
  const isIPadOS = 
    navigator.maxTouchPoints > 0 && 
    /macintosh/.test(userAgent) &&
    'ontouchend' in document;

  return isIOSDevice || isIPadOS;
}

/**
 * Detects if the user is on an Android device
 */
export function isAndroid(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  // Check for Android devices
  return /android/.test(userAgent);
}

/**
 * Detects if the app is running in standalone mode (installed as PWA)
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;

  // Check if running in standalone mode
  const isStandaloneMode = 
    // Standard way
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari specific
    (window.navigator as any).standalone === true ||
    // Check if document referrer is empty (opened from home screen)
    document.referrer.includes('android-app://');

  return isStandaloneMode;
}

/**
 * Checks if the user needs to install the app (iOS user not in standalone mode)
 */
export function needsInstallation(): boolean {
  return isIOS() && !isStandalone();
}

/**
 * Checks if Android user needs to install the app (Android user not in standalone mode)
 */
export function needsAndroidInstallation(): boolean {
  return isAndroid() && !isStandalone();
}

/**
 * Detects if the user is on Safari browser
 */
export function isSafari(): boolean {
  if (typeof window === 'undefined') return false;

  const userAgent = window.navigator.userAgent.toLowerCase();
  const isSafariBrowser = 
    /safari/.test(userAgent) && 
    !/chrome|chromium|crios|fxios/.test(userAgent);

  return isSafariBrowser;
}

/**
 * Gets a friendly device name
 */
export function getDeviceName(): string {
  if (!isIOS()) return 'Device';

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  if (/ipad/.test(userAgent)) return 'iPad';
  if (/iphone/.test(userAgent)) return 'iPhone';
  if (/ipod/.test(userAgent)) return 'iPod';
  
  // Check for iPad on iOS 13+
  if (navigator.maxTouchPoints > 0 && /macintosh/.test(userAgent)) {
    return 'iPad';
  }

  return 'iOS Device';
}

/**
 * Detects browser type
 */
export function getBrowserName(): string {
  if (typeof window === 'undefined') return 'Unknown';

  const userAgent = window.navigator.userAgent.toLowerCase();
  
  if (/chrome|chromium|crios/.test(userAgent)) return 'Chrome';
  if (/firefox|fxios/.test(userAgent)) return 'Firefox';
  if (/safari/.test(userAgent)) return 'Safari';
  if (/edg/.test(userAgent)) return 'Edge';
  if (/opera|opr/.test(userAgent)) return 'Opera';

  return 'Unknown';
}

/**
 * Checks if push notifications are supported
 */
export function isPushNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false;

  // iOS Safari doesn't support push notifications unless in standalone mode
  if (isIOS() && !isStandalone()) {
    return false;
  }

  // Check if Push API is available
  return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Gets installation instructions based on device and browser
 */
export function getInstallInstructions(): string[] {
  const device = getDeviceName();
  const browser = getBrowserName();

  if (isIOS()) {
    if (browser === 'Safari') {
      return [
        `Open this page in Safari (if not already)`,
        `Tap the Share button at the bottom of the screen`,
        `Scroll down and tap "Add to Home Screen"`,
        `Tap "Add" to confirm`,
        `Open the app from your home screen`,
      ];
    } else {
      return [
        `Open this page in Safari browser`,
        `Tap the Share button at the bottom`,
        `Select "Add to Home Screen"`,
        `Tap "Add" to confirm`,
      ];
    }
  }

  // Default instructions
  return [
    'Open the menu in your browser',
    'Look for "Install app" or "Add to Home Screen"',
    'Follow the prompts to install',
  ];
}

/**
 * Stores that user has dismissed the install prompt
 */
export function setInstallPromptDismissed() {
  if (typeof window === 'undefined') return;
  localStorage.setItem('installPromptDismissed', 'true');
}

/**
 * Checks if user has dismissed the install prompt before
 */
export function hasInstallPromptBeenDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('installPromptDismissed') === 'true';
}

/**
 * Clears the install prompt dismissed flag
 */
export function clearInstallPromptDismissed() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('installPromptDismissed');
}
