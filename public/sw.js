// Service worker: makes the app work without a network (on a plane).
//
// Everything the app needs is cached on the first visit: the page, styles,
// scripts, icons and the puzzle library. Requests go to the network first so
// updates arrive as soon as there is a connection; if the network fails or
// takes longer than 3 s, the cached copy is used.
//
// Profile calls (/api/users/...) are never cached here. The app keeps its own
// copy of the profile and the game in progress in localStorage, and queues
// finished games until the server can be reached.

const CACHE = 'sudoku-v2';

// Keep in sync with public/ (test/pwa.test.js checks it).
const PRECACHE = [
  '/',
  '/css/style.css',
  '/js/boot.js',
  '/js/main.js',
  '/js/landing.js',
  '/js/profile.js',
  '/js/board-view.js',
  '/js/entry.js',
  '/js/pages.js',
  '/js/look.js',
  '/js/engine.js',
  '/js/game-state.js',
  '/js/stats.js',
  '/js/api.js',
  '/js/dom.js',
  '/js/generator-worker.js',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/api/library',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(request), timeout(3000)]);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw new Error('offline and not cached');
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/library') return;

  // "/" and "/<username>" are the same page; one cached copy serves both.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, '/'));
    return;
  }
  event.respondWith(networkFirst(req, url.pathname));
});
