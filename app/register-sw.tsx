'use client';

import { useEffect } from 'react';

export default function RegisterServiceWorker() {
  useEffect(() => {
    // Always register service worker immediately (needed for push notifications on iOS)
    // Use firebase-messaging-sw.js which handles both messaging and caching
    if ('serviceWorker' in navigator) {
      // Register immediately, don't wait for window.load
      const registerSW = async () => {
        try {
          // Check if already registered
          const existingRegistration = await navigator.serviceWorker.getRegistration();
          if (existingRegistration) {
            console.log('✅ Service Worker already registered');
            // Activate it if it's waiting
            if (existingRegistration.waiting) {
              existingRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            return;
          }

          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
            scope: '/',
          });
          
          console.log('✅ Firebase Messaging Service Worker registered:', registration);
          
          // Wait for service worker to be ready
          if (registration.installing) {
            console.log('⏳ Service Worker is installing...');
            registration.installing.addEventListener('statechange', (e: any) => {
              if (e.target.state === 'activated') {
                console.log('✅ Service Worker activated and ready');
              }
            });
          } else if (registration.waiting) {
            console.log('⏸️ Service Worker is waiting, activating...');
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          } else if (registration.active) {
            console.log('✅ Service Worker is active and ready');
          }
          
          // Ensure service worker is controlling the page
          if (registration.active && !navigator.serviceWorker.controller) {
            console.log('🔄 Service Worker active but not controlling, reloading...');
            window.location.reload();
          }
        } catch (error) {
          console.error('❌ Service Worker registration failed:', error);
        }
      };

      // Register immediately
      registerSW();

      // Also register on load as fallback
      window.addEventListener('load', registerSW);

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
