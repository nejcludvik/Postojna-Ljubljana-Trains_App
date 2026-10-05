const CACHE='pl-trains-v3';
const ASSETS=['/','/styles.css','/app.js','/manifest.json','/icon.svg'];

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),
  self.clients.claim()
])));
self.addEventListener('fetch',e=>{
  if(e.request.url.includes('/api/'))return;
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(x=>{
    const c=x.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));return x;
  })));
});

self.addEventListener('push',e=>{
  let data={};
  try{data=e.data?e.data.json():{}}catch{data={body:e.data?.text()||''}}
  const title=data.title||'Train update';
  const options={
    body:data.body||'There is an update for one of your saved trains.',
    tag:data.tag||'train-update',
    icon:'/icon.svg',
    badge:'/icon.svg',
    renotify:true,
    data:{url:data.url||'/'}
  };
  e.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const target=e.notification.data?.url||'/';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if('focus'in c){c.navigate?.(target);return c.focus()}}
    return clients.openWindow?clients.openWindow(target):undefined;
  }));
});
