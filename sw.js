/* ══════════════════════════════════════
   Service Worker — شطرنج Am-Kh
   استراتيجية: Cache First للأصول الثابتة
   Network First للصفحة الرئيسية
══════════════════════════════════════ */
const SW_VERSION = '1.2';
const CACHE_NAME = `chess-amkh-v6-${SW_VERSION}`;
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon_v2.png?v=2',
  './nour.png',
  // Sound files - critical for offline gameplay
  './move.mp3',
  './capture.mp3',
  './castle.mp3',
  './check.mp3',
  './checkmate.mp3',
  './Error.mp3',
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
    (url.pathname.endsWith('.js') && url.hostname !== location.hostname)
  ) {
    return; /* نترك المتصفح يتعامل معها */
  }

  /* ملفات الصوت — Cache First (ضرورية للعمل Offline) */
  if (url.pathname.match(/\.(mp3|wav|ogg|webm)$/i)) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) {
          console.log('[SW] Serving audio from cache:', url.pathname);
          return cached;
        }
        return fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => {
              c.put(e.request, clone);
              console.log('[SW] Cached audio:', url.pathname);
            });
          }
          return res;
        }).catch(err => {
          console.error('[SW] Failed to fetch audio:', url.pathname, err);
          return new Response('', { status: 503 });
        });
      })
    );
    return;
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

try{
  importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');
  const firebaseConfig={
    apiKey:"AIzaSyCVFjWtbHdXv7HG8IGyTH0Ogv_rZ4jWIVI",
    authDomain:"chess-85a75.firebaseapp.com",
    projectId:"chess-85a75",
    storageBucket:"chess-85a75.firebasestorage.app",
    messagingSenderId:"467677566583",
    appId:"1:467677566583:web:3ab926b218de5095b31872"
  };
  firebase.initializeApp(firebaseConfig);
  const messaging=firebase.messaging();
  messaging.onBackgroundMessage((payload)=>{
    try{
      const n=payload?.notification||{};
      const d=payload?.data||{};
      const title=n.title||d.title||'شطرنج Am-Kh';
      const body=n.body||d.body||'تنبيه جديد';
      const icon=n.icon||d.icon||'./icon_v2.png?v=2';
      const badge=n.badge||d.badge||'./icon_v2.png?v=2';
      const tag=n.tag||d.tag||'chess-fcm';
      self.registration.showNotification(title,{body,icon,badge,tag,data:{...d}});
    }catch(e){}
  });
}catch(e){}

/* ══ Push Notifications (FCM) ══ */
self.addEventListener('push', e => {
  if (!e.data) return;
  try {
    const payload = e.data.json();
    const { title, body, icon, badge, tag, requireInteraction } = payload.notification || payload.data || {};
    const d = payload.data && typeof payload.data === 'object' ? payload.data : {};
    e.waitUntil(
      self.registration.showNotification(title || 'شطرنج Am-Kh', {
        body: body || 'تنبيه جديد',
        icon: icon || './icon_v2.png?v=2',
        badge: badge || './icon_v2.png?v=2',
        tag: tag || 'chess-push',
        requireInteraction: requireInteraction || false,
        silent: false,
        vibrate: [100, 50, 100],
        data: { ...d }
      })
    );
  } catch (err) {
    console.error('[SW] Push error:', err);
  }
});

/* ══ Notification Click ══ */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = (e.notification && e.notification.data && typeof e.notification.data === 'object') ? e.notification.data : {};
  const link = data.link ? String(data.link) : '';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      if (clientList.length > 0) {
        const client = clientList[0];
        client.focus();
        client.postMessage({ type: 'notification-click', tag: e.notification.tag, data });
        return;
      }
      if (link) return clients.openWindow(link);
      clients.openWindow('./');
    })
  );
});

/* ══ Message: force update ══ */
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
