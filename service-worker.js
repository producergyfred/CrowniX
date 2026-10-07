/* Cache-first offline service worker. Bump VERSION when files change. */
const VERSION = 'crownix-v7';

const FILES = [
  './',
  './index.html',
  './style.css',
  './engine.js',
  './core.js',
  './audio.js',
  './profile.js',
  './fx.js',
  './board.js',
  './game.js',
  './screens.js',
  './app.js',
  './manifest.json'
];

/* Icons are cached too, but a missing icon must never break installation. */
const ICONS = [
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon.ico'
];


self.addEventListener('install', e => {

  e.waitUntil(
    caches.open(VERSION)
      .then(c =>
        c.addAll(FILES).then(() =>
          Promise.all(ICONS.map(f => c.add(f).catch(() => {})))
        )
      )
      .then(() => self.skipWaiting())
  );
});


self.addEventListener('activate', e => {

  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(n => n !== VERSION)
            .map(n => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});


self.addEventListener('fetch', e => {

  const req = e.request;

  /* Only handle same-origin GET requests; never touch cross-origin resources. */
  if (
    req.method !== 'GET' ||
    new URL(req.url).origin !== self.location.origin
  ) {
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true })
      .then(cached =>
        cached ||
        fetch(req).catch(() =>
          req.mode === 'navigate'
            ? caches.match('./index.html')
            : Response.error()
        )
      )
  );
});
