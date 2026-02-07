# Why Different Refresh Types Give Different Results

## The Problem

**Ctrl+R (Normal Refresh)** vs **Ctrl+Shift+R (Hard Refresh)** show different results because:

1. **Service Worker Cache** - Your PWA caches resources for offline use
2. **Browser Cache** - Browser caches static assets
3. **Next.js Cache** - Next.js caches pages and API routes
4. **Hot Module Replacement** - In development, HMR can cause inconsistent states

## What I Fixed

✅ **Service Worker now uses Network-First strategy** - Always tries network first, only uses cache when offline
✅ **Service Worker disabled in development** - No caching during development to prevent confusion
✅ **Firebase requests bypass cache** - API calls always go to network

## How to Clear Cache Manually

### Option 1: Browser DevTools
1. Open DevTools (F12)
2. Go to **Application** tab
3. Click **Clear storage** → **Clear site data**
4. Refresh page

### Option 2: Unregister Service Worker
In browser console:
```javascript
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
  console.log('Service workers unregistered');
});
```

### Option 3: Clear All Caches
In browser console:
```javascript
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
  console.log('All caches cleared');
});
```

## After the Fix

- **Ctrl+R** and **Ctrl+Shift+R** should now behave the same in development
- In production, service worker will cache for offline use (as intended)
- Firebase requests always bypass cache

## Still Seeing Issues?

1. **Hard refresh** (`Ctrl+Shift+R`) to get latest service worker
2. **Clear browser cache** (see above)
3. **Restart dev server**: `npm run dev`
4. **Check console** for service worker messages
