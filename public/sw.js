const CACHE_NAME = 'airdraw-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/App.css',
  '/src/index.css',
  '/favicon.png',
  '/favicon.svg',
  '/manifest.json'
];

// Install Event - Pre-cache basic application assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[Service Worker] Pre-cache failed for some assets, continuing anyway:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Stale-while-revalidate for local assets, cache-first for CDN resources
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Check if it's a CDN resource (MediaPipe, Tesseract, KaTeX, mathjs, mermaid, unpkg)
  const isCDN = url.hostname.includes('cdn.jsdelivr.net') || 
                url.hostname.includes('unpkg.com') ||
                url.hostname.includes('fonts.googleapis.com') ||
                url.hostname.includes('fonts.gstatic.com');

  if (isCDN) {
    // Cache First strategy for CDNs - they are versioned and immutable
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }).catch((err) => {
            console.error('[Service Worker] CDN fetch failed:', err);
            return new Response('Offline content unavailable', { status: 503, statusText: 'Offline' });
          });
        });
      })
    );
  } else {
    // Network First / Stale-While-Revalidate for local code files to ensure quick updates
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch((err) => {
          // If network fails, try to return cache, or fallback
          console.warn('[Service Worker] Local network fetch failed:', err);
        });

        return cachedResponse || fetchPromise;
      })
    );
  }
});
