const CACHE='pl-trains-v2';
const ASSETS=['/','/styles.css','/app.js','/manifest.json','/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{if(e.request.url.includes('/api/'))return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{const c=x.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));return x}))) });
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus'in c)return c.focus()}return clients.openWindow?clients.openWindow('/'):undefined}))});
