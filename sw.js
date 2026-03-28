const CACHE = 'bogeys-v9';
const ASSETS = ['/', '/index.html', '/app.js', '/styles.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Pass Firebase, Google Fonts, and CDN requests straight to network
  if (url.includes('firebaseapp') || url.includes('googleapis') ||
      url.includes('gstatic') || url.includes('firestore')) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
