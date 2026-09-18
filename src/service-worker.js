const VERSION = '__APP_VERSION__';
const CACHE_PREFIX = 'lens-log-app-';
const LEGACY_CACHE_PREFIX = 'lens-log-v';
const CACHE = `${CACHE_PREFIX}${VERSION}`;
const SHELL = [
  '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png',
  '/fonts/Geist-Variable.woff2', '/fonts/GeistMono-Variable.woff2',
  '/fonts/OFL-Geist.txt', '/THIRD_PARTY_LICENSES.txt'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const pageRequest = new Request('/', { cache: 'reload' });
    const page = await fetch(pageRequest);
    if (!page.ok) throw new Error(`App shell request failed (${page.status})`);
    const html = await page.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path.startsWith('/assets/'));
    await cache.put('/', page);
    await cache.addAll([...SHELL, ...assets]);
    // Do not skip waiting here. The running app may contain unsaved field values.
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => (key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)) && key !== CACHE)
      .map((key) => caches.delete(key)));
    // Activation is either the first install or explicitly requested in the UI.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Server state must always come from the network and must never enter Cache Storage.
  if (url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request, { cache: 'no-store' });
        if (response.ok) await (await caches.open(CACHE)).put('/', response.clone());
        return response;
      } catch {
        const cached = await caches.match('/');
        if (cached) return cached;
        throw new Error('Lens Log is unavailable offline because its app shell is not cached.');
      }
    })());
    return;
  }

  const cacheable = url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname);
  if (!cacheable) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await (await caches.open(CACHE)).put(event.request, response.clone());
    return response;
  })());
});
