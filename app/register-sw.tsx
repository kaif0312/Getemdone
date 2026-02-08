'use client';

import { useEffect } from 'react';

export default function RegisterServiceWorker() {
  useEffect(() => {
    // Always register service worker (needed for push notifications on iOS)
    // Use firebase-messaging-sw.js which handles both messaging and caching
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/firebase-messaging-sw.js')
          .then((registration) => {
            console.log('✅ Firebase Messaging Service Worker registered:', registration);
            
            // Check if service worker is active
            if (registration.active) {
              console.log('✅ Service Worker is active and ready');
            } else if (registration.installing) {
              console.log('⏳ Service Worker is installing...');
            } else if (registration.waiting) {
              console.log('⏸️ Service Worker is waiting...');
            }
          })
          .catch((error) => {
            console.error('❌ Service Worker registration failed:', error);
          });
      });

      // Listen for service worker updates
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('🔄 Service Worker controller changed - new version active');
      });
    } else {
      console.warn('⚠️ Service Worker not supported in this browser');
    }
  }, []);

  return null;
}
