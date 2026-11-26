// HomeTown — service worker : l'app s'ouvre même sans réseau, et chaque nouvelle version est proposée à l'ouverture.
// Pour publier une nouvelle version : changez VERSION (et APP_VERSION dans index.html), puis déposez les fichiers.
const VERSION = '1.3.1';
const CACHE = 'hometown-' + VERSION;
const SHELL = ['./', './index.html', './config.js', './store.js', './manifest.webmanifest',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('hometown-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// v1.3 : notifications envoyées par Supabase (fonction « notify ») ; elles s'affichent même app fermée.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'HomeTown', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag, data: { url: d.url || './' } }));
});
// Toucher une notification : ouvre l'app (ou la remet au premier plan) sur le bon onglet
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.postMessage({ goto: new URL(url).searchParams.get('tab') }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Les données (Supabase) ne passent jamais par le cache.
  if (url.origin !== location.origin && !CDN.test(req.url)) return;
  if (url.origin === location.origin) {
    // Fichiers de l'app : version en cache (celle installée), réseau en secours.
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).catch(() =>
      req.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
    return;
  }
  // Polices, icônes et bibliothèque Supabase : cache, rafraîchi en arrière-plan.
  e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })));
});
