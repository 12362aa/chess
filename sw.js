/* ══════════════════════════════════════
   Service Worker — شطرنج Am-Kh
   استراتيجية: Cache First للأصول الثابتة
   Network First للصفحة الرئيسية
══════════════════════════════════════ */
const SW_VERSION = '1.1';
const CACHE_NAME = `chess-amkh-v6-${SW_VERSION}`;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon_v2.png?v=2',
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@300;400;600;700;900&display=swap',
];

/* ══ Install ══ */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      /* نكش الأصول الأساسية فقط — الفونتات الخارجية اختيارية */
      const local = STATIC_ASSETS.filter(u => !u.startsWith('http'));
      return cache.addAll(local).catch(() => {});
    })
  );
  self.skipWaiting();
});

/* ══ Activate ══ */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ══ Fetch ══ */
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* PeerJS و TURN servers — دايماً من الشبكة */
  if (
    url.hostname.includes('peerjs') ||
    url.hostname.includes('metered') ||
    url.hostname.includes('freestun') ||
    url.hostname.includes('openrelay') ||
    url.hostname.includes('xirsys') ||
    url.pathname.endsWith('.js') && url.hostname !== location.hostname
  ) {
    return; /* نترك المتصفح يتعامل معها */
  }

  /* الفونتات من Google — Cache First */
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached || new Response('', { status: 503 }));
      })
    );
    return;
  }

  /* الصفحة الرئيسية — Network First مع Fallback */
  if (
    e.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('.html')
  ) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match('./')))
    );
    return;
  }

  /* باقي الأصول — Cache First */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('', { status: 503 }));
    })
  );
});

/* ══ Message: force update ══ */
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
