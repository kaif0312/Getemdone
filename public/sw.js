const CACHE_NAME = 'task-accountability-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Fetch event - Network-first strategy (better for development)
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  
  // Skip caching for unsupported schemes (chrome-extension, moz-extension, etc.)
  if (!requestUrl.protocol.startsWith('http')) {
    return; // Let browser handle these normally
  }
  
  // Skip caching for API requests and Firebase
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('firebase') ||
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('chrome-extension://') ||
      event.request.url.includes('moz-extension://') ||
      event.request.url.includes('safari-extension://')) {
    return; // Let browser handle these normally
  }

  event.respondWith(
    // Try network first
    fetch(event.request)
      .then((response) => {
        // If network succeeds, cache and return
        // Only cache GET requests with http/https protocol
        if (response && 
            response.status === 200 && 
            response.type === 'basic' &&
            event.request.method === 'GET' &&
            requestUrl.protocol.startsWith('http')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            try {
              cache.put(event.request, responseToCache);
            } catch (error) {
              // Silently fail if caching is not supported for this request
              console.warn('[SW] Failed to cache:', event.request.url, error);
            }
          });
        }
        return response;
      })
      .catch(() => {
        // Network failed - try cache (offline fallback)
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // No cache either - return offline page or error
          return new Response('Offline - content not available', {
            status: 503,
            statusText: 'Service Unavailable',
          });
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  return self.clients.claim();
});

// Background sync for offline task submission
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tasks') {
    event.waitUntil(syncTasks());
  }
});

async function syncTasks() {
  // Implement background sync logic here
  console.log('Syncing tasks...');
}
