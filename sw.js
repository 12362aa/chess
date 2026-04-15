/* ══════════════════════════════════════════════
   sw.js — Service Worker للعمل أوفلاين
   شطرنج Am-Kh
══════════════════════════════════════════════ */
const CACHE_NAME = 'chess-amkh-v1';

/* الملفات الأساسية التي تُخزَّن فور التثبيت */
const CORE_FILES = [
  './',
  './index.html',
  './icon.svg',
  './manifest.json',
];

/* مصادر CDN تُخزَّن عند أول طلب */
const CDN_PATTERNS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com/peerjs',
];

/* ── تثبيت: خزّن الملفات الأساسية ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_FILES).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

/* ── تفعيل: احذف الكاش القديم ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── اعتراض الطلبات ── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  /* تجاهل طلبات غير GET */
  if (event.request.method !== 'GET') return;

  /* تجاهل WebSocket و PeerJS signaling */
  if (url.includes('peerjs.com') || url.startsWith('ws')) return;

  /* الصفحة الرئيسية: شبكة أولاً ثم كاش */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* CDN (فونتات، PeerJS): كاش أولاً ثم شبكة */
  const isCDN = CDN_PATTERNS.some(p => url.includes(p));
  if (isCDN) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request)
          .then(res => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  /* بقية الطلبات: كاش أولاً */
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
      )
  );
});
