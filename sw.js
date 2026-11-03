/* ==========================================================================
   sw.js · Service Worker（离线可用）
   策略：
   - 导航请求（index.html）：network-first，失败回退缓存 → 保证能拿到新版本
   - 静态资源（css/js/图标/manifest）：stale-while-revalidate → 秒开且后台更新
   - 只缓存同源 GET；跨域与 POST 一律直连
   ========================================================================== */
'use strict';

var VERSION = 'subtrack-v1.2.2';
var CORE = VERSION + '-core';
var RUNTIME = VERSION + '-runtime';

/** 首屏必需资源（缺失任何一个 install 会失败，故保持最小集） */
var CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/platforms.js',
  './js/utils.js',
  './js/store.js',
  './js/ics.js',
  './js/ui.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CORE).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CORE && k !== RUNTIME) return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // 导航：network-first，断网回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CORE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  // 静态资源：stale-while-revalidate
  event.respondWith(
    caches.match(req).then(function (hit) {
      var network = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(RUNTIME).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });

      return hit || network;
    })
  );
});

// 允许页面主动要求更新
self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
