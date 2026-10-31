// Service Worker: macht Merkwerk offline nutzbar.
// Alle Pfade sind relativ, damit die App unter livelli.github.io/merkwerk/ funktioniert.
const CACHE_VERSION = '0.2.0';
const CACHE = `merkwerk-${CACHE_VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/fonts.css',
  'js/app.js',
  'js/db.js',
  'js/version.js',
  'js/store.js',
  'js/views.js',
  'js/importer.js',
  'js/backup.js',
  'js/speech.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'fonts/plex-mono-latin-0bc96c.woff2',
  'fonts/plex-mono-latin-1b581b.woff2',
  'fonts/plex-mono-latin-ext-93cfae.woff2',
  'fonts/plex-mono-latin-ext-a73533.woff2',
  'fonts/plex-sans-latin-868a23.woff2',
  'fonts/plex-sans-latin-ext-632855.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) =>
    // cache: 'reload' umgeht den Browser-Cache, damit ein Update wirklich neue Dateien bekommt.
    c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k.startsWith('merkwerk') && k !== CACHE)
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== self.location.origin) return;

  // Seitenaufrufe: App-Gerüst aus dem Cache, damit sie offline startet.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      return (await cache.match('index.html')) || fetch(req);
    })());
    return;
  }

  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    return hit || fetch(req);
  })());
});
