// 公開アセットを変更したら VERSION も更新する。
const VERSION = 'v1';
const PREFIX = `zekki-shell:${self.registration.scope}:`;
const CACHE = PREFIX + VERSION;
const ASSETS = [
  'index.html', 'style.css', 'manifest.webmanifest',
  'js/utils.js', 'js/store.js', 'js/sound.js', 'js/attention.js',
  'js/problems.js', 'js/main.js', 'js/odpt.js', 'js/lasttrain.js', 'js/pwa.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
].map(path => new URL(path, self.registration.scope).href);
const SHELL = new URL('index.html', self.registration.scope).href;
const ROOT = new URL('./', self.registration.scope).href;
const CONFIG = new URL('js/config.js', self.registration.scope).href;

self.addEventListener('install', event => {
  // 全アセットが揃わなければインストール失敗。旧版はそのまま使える。
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll(ASSETS.map(url => new Request(url, { cache: 'reload' })))));
  // skipWaiting は使わない。開いているアラームを更新で中断しない。
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key))
  )));
  // clients.claim やページの強制リロードも行わない。
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== new URL(ROOT).origin) return; // ODPTを含む外部通信は保存しない
  if (url.pathname === new URL(CONFIG).pathname) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }
  const page = request.mode === 'navigate' &&
    (url.pathname === new URL(ROOT).pathname || url.pathname === new URL(SHELL).pathname);
  const key = page ? SHELL : request.url;
  if (!page && !ASSETS.includes(key)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(key);
    return cached || fetch(request);
  }));
});
