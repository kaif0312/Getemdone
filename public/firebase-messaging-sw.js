// Firebase Cloud Messaging Service Worker
// This file MUST be in the /public folder at the root level for iOS PWA support

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyC1qJw-8ieFSnoAuNKuVdmJmdGpHZx1KTE",
  authDomain: "getemdone-87679.firebaseapp.com",
  projectId: "getemdone-87679",
  storageBucket: "getemdone-87679.firebasestorage.app",
  messagingSenderId: "427240262615",
  appId: "1:427240262615:web:71367e2a2366bd72bcd992"
});

const messaging = firebase.messaging();

// Handle background push notifications
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  // Extract comment text from payload if available
  const commentText = payload.data?.commentText || '';
  const fromUserName = payload.data?.fromUserName || '';
  const notificationId = payload.data?.notificationId || '';
  const type = payload.data?.type || 'default';
  
  // Format notification body to show actual comment text
  let notificationBody = payload.notification?.body || 'You have a new update';
  if (commentText && fromUserName) {
    notificationBody = `${fromUserName}: "${commentText}"`;
  }
  
  const notificationTitle = payload.notification?.title || 'New Notification';
  
  // Use notification ID as tag to prevent duplicates across tabs/windows
  const tag = notificationId ? `${type}-${notificationId}` : payload.data?.tag || 'default';
  
  console.log('[firebase-messaging-sw.js] Showing notification with tag:', tag);
  
  const notificationOptions = {
    body: notificationBody,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: tag, // Same tag = replaces previous notification instead of showing duplicate
    data: payload.data,
    requireInteraction: false,
    vibrate: [100, 50, 100],
    renotify: false, // Don't re-alert if notification with same tag already exists
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification clicked', event);
  
  event.notification.close();
  
  // Navigate to the app or specific task
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if app is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Cache static assets (merged from your original sw.js)
const CACHE_NAME = 'task-accountability-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[firebase-messaging-sw.js] Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[firebase-messaging-sw.js] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Skip non-http(s) requests
  if (!requestUrl.protocol.startsWith('http')) {
    return;
  }
  
  // Skip API and Firebase requests
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('firebase') ||
      event.request.url.includes('googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic' && event.request.method === 'GET') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch((error) => {
              console.warn('[firebase-messaging-sw.js] Failed to cache:', event.request.url);
            });
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || new Response('Offline', { status: 503 });
        });
      })
  );
});
