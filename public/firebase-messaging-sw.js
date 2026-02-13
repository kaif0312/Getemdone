// Firebase Cloud Messaging Service Worker
// This file MUST be in the /public folder at the root level for iOS PWA support

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');
importScripts('/sw-crypto.js');

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

// Track shown notifications to prevent duplicates
const shownNotifications = new Set();

// Handle background push notifications
messaging.onBackgroundMessage(async (payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const data = payload.data || {};
  let commentText = data.commentText || '';
  let taskText = data.taskText || '';
  const fromUserName = data.fromUserName || '';
  const fromUserId = data.fromUserId || '';
  const notificationId = data.notificationId || '';
  const type = data.type || 'default';
  
  // Decrypt if content is encrypted (e1: prefix or base64)
  if (typeof self.decryptNotificationContent === 'function' && fromUserId) {
    const encTask = taskText && self.isEncrypted && self.isEncrypted(taskText) ? taskText : '';
    const encComment = commentText && self.isEncrypted && self.isEncrypted(commentText) ? commentText : '';
    if (encTask || encComment) {
      try {
        const decrypted = await self.decryptNotificationContent(encTask, encComment, fromUserId);
        if (decrypted) {
          if (decrypted.taskText) taskText = decrypted.taskText;
          if (decrypted.commentText) commentText = decrypted.commentText;
          console.log('[firebase-messaging-sw.js] Decryption succeeded for fromUserId:', fromUserId);
        } else {
          console.warn('[firebase-messaging-sw.js] Decryption returned null (no keys for fromUserId):', fromUserId);
        }
      } catch (err) {
        console.warn('[firebase-messaging-sw.js] Decrypt failed:', err);
      }
    }
  }
  
  // Create unique tag for this notification
  const tag = notificationId ? `${type}-${notificationId}` : `${type}-${Date.now()}`;
  
  // Check if we've already shown this notification (prevent duplicates)
  if (shownNotifications.has(tag)) {
    console.log('[firebase-messaging-sw.js] Notification already shown, skipping duplicate:', tag);
    return;
  }
  
  // Check if a notification with this tag already exists (prevent duplicates across service worker instances)
  const existingNotifications = await self.registration.getNotifications({ tag: tag });
  if (existingNotifications.length > 0) {
    console.log('[firebase-messaging-sw.js] Notification with tag already exists, skipping duplicate:', tag);
    // Mark as shown to prevent future duplicates
    shownNotifications.add(tag);
    return;
  }
  
  // Mark as shown
  shownNotifications.add(tag);
  
  // Clean up old tags (keep only last 100 to prevent memory issues)
  if (shownNotifications.size > 100) {
    const firstTag = shownNotifications.values().next().value;
    shownNotifications.delete(firstTag);
  }
  
  // Format notification body - never show ciphertext
  // Data-only messages: title/body come from payload.data (no payload.notification)
  const fallbackBody = data.body || payload.notification?.body || 'You have a new update';
  let notificationBody = fallbackBody;
  const stillEncrypted = (s) => s && typeof s === 'string' && (
    s.startsWith('e1:') || (s.length >= 30 && /^[A-Za-z0-9+/]+=*$/.test(s))
  );
  if (commentText && fromUserName && !stillEncrypted(commentText) && !stillEncrypted(taskText)) {
    const taskSuffix = taskText ? ` on "${taskText}"` : '';
    notificationBody = `${fromUserName}: "${commentText}"${taskSuffix}`;
  } else if (stillEncrypted(commentText) || stillEncrypted(taskText)) {
    notificationBody = fromUserName ? `${fromUserName} sent you a message` : 'You have a new notification';
  }
  
  const notificationTitle = data.title || payload.notification?.title || 'New Notification';
  
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
    silent: false, // Ensure notification is shown
  };

  // Show notification and handle any errors
  return self.registration.showNotification(notificationTitle, notificationOptions)
    .then(() => {
      console.log('[firebase-messaging-sw.js] ✅ Notification shown successfully');
    })
    .catch((error) => {
      console.error('[firebase-messaging-sw.js] ❌ Error showing notification:', error);
      // Remove from set if showing failed so it can be retried
      shownNotifications.delete(tag);
    });
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
