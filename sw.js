const C='chess-amkh-final';
const F=['./','/index.html','/manifest.json','/icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(F)));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim();});
self.addEventListener('fetch',e=>{
  const u=e.request.url;
  if(u.includes('peerjs')||u.includes('unpkg')||u.includes('fonts.g')){
    e.respondWith(caches.match(e.request).then(c=>{if(c)return c;return fetch(e.request).then(r=>{const cl=r.clone();caches.open(C).then(ca=>ca.put(e.request,cl));return r;}).catch(()=>caches.match('/index.html'));}));return;
  }
  e.respondWith(caches.match(e.request).then(c=>{if(c)return c;return fetch(e.request).catch(()=>{if(e.request.mode==='navigate')return caches.match('/index.html');});}));
});