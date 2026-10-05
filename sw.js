/* =========================================================
   sw.js — Service Worker فوق حرفه‌ای
   مشاوره همراه · نسخه ۱.۰.۰
   =========================================================
   استراتژی‌ها:
   · Precache — فایل‌های حیاتی PWA
   · Stale-While-Revalidate — آیکون‌ها، فونت، استایل
   · Network-First — درخواست‌های سایت rosha-24.ir
   · Cache-First — فایل‌های استاتیک گیت‌هاب
   · Navigation Fallback — بازگشت به index.html
   ========================================================= */

'use strict';

/* =========================================================
   پیکربندی
   ========================================================= */
const VERSION      = '1.0.0';
const BUILD        = '20261005';
const CACHE_STATIC = `mh-static-v${VERSION}-${BUILD}`;
const CACHE_RUNTIME= `mh-runtime-v${VERSION}-${BUILD}`;
const CACHE_SITE   = `mh-site-v${VERSION}-${BUILD}`;
const CACHE_FONTS  = `mh-fonts-v${VERSION}-${BUILD}`;

const ALL_CACHES = [CACHE_STATIC, CACHE_RUNTIME, CACHE_SITE, CACHE_FONTS];

/* =========================================================
   لیست فایل‌های حیاتی (Precache)
   ========================================================= */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.html',
  './offline.html',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

/* =========================================================
   الگوهای تعیین استراتژی
   ========================================================= */
const SITE_ORIGIN   = 'rosha-24.ir';
const FONT_HOSTS    = ['cdn.jsdelivr.net', 'fonts.gstatic.com', 'fonts.googleapis.com'];

const RE_IMAGE = /\.(png|jpg|jpeg|gif|webp|svg|ico|avif)$/i;
const RE_STYLE = /\.css$/i;
const RE_SCRIPT= /\.js$/i;
const RE_FONT  = /\.(woff2?|ttf|otf|eot)$/i;

/* =========================================================
   محدودیت‌ها
   ========================================================= */
const MAX_RUNTIME_ITEMS = 60;
const MAX_FONTS_ITEMS   = 30;

/* =========================================================
   ابزار کمکی: پاسخ خطای آفلاین
   ========================================================= */
function offlineResponse(type) {
  if (type === 'image') {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
        '<rect width="200" height="200" fill="#0D1B2E"/>' +
        '<text x="100" y="110" text-anchor="middle" fill="#C4956A" font-size="18" font-family="sans-serif">آفلاین</text>' +
      '</svg>',
      { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } }
    );
  }
  return new Response('آفلاین', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

/* =========================================================
   ابزار کمکی: پاکسازی کش قدیمی
   ========================================================= */
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys  = await cache.keys();
    if (keys.length <= maxItems) return;

    const toDelete = keys.length - maxItems;
    for (let i = 0; i < toDelete; i++) {
      await cache.delete(keys[i]);
    }
  } catch (e) {
    /* بی‌صدا */
  }
}

/* =========================================================
   استراتژی ۱: Precache + Network-First (برای سایت اصلی)
   ========================================================= */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const fresh = await fetch(request);

    if (fresh && fresh.status === 200 && fresh.type !== 'opaque') {
      cache.put(request, fresh.clone());
      trimCache(cacheName, MAX_RUNTIME_ITEMS);
    }

    return fresh;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;

    // اگر ناوبری بود، صفحه آفلاین را بده
    if (request.mode === 'navigate') {
      const offline = await caches.match('./offline.html');
      if (offline) return offline;
    }

    return offlineResponse('text');
  }
}

/* =========================================================
   استراتژی ۲: Cache-First (برای فایل‌های PWA)
   ========================================================= */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const fresh = await fetch(request);

    if (fresh && fresh.status === 200 && fresh.type === 'basic') {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }

    return fresh;
  } catch (err) {
    return offlineResponse(
      RE_IMAGE.test(request.url) ? 'image' : 'text'
    );
  }
}

/* =========================================================
   استراتژی ۳: Stale-While-Revalidate (آیکون، فونت، CSS)
   ========================================================= */
async function staleWhileRevalidate(request, cacheName, maxItems) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(function (response) {
    if (response && response.status === 200) {
      cache.put(request, response.clone());
      trimCache(cacheName, maxItems);
    }
    return response;
  }).catch(function () {
    return cached || offlineResponse(
      RE_IMAGE.test(request.url) ? 'image' : 'text'
    );
  });

  return cached || fetchPromise;
}

/* =========================================================
   رویداد INSTALL — پیش‌بارگذاری فایل‌های حیاتی
   ========================================================= */
self.addEventListener('install', function (event) {
  event.waitUntil(
    (async function () {
      const cache = await caches.open(CACHE_STATIC);

      // افزودن تک‌تک فایل‌ها (اگر یکی خطا داد، بقیه ادامه یابد)
      await Promise.all(
        PRECACHE_ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('[SW] Precache miss:', url);
          });
        })
      );

      // فعال‌سازی فوری
      await self.skipWaiting();
    })()
  );
});

/* =========================================================
   رویداد ACTIVATE — پاکسازی کش‌های قدیمی + فعال‌سازی
   ========================================================= */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    (async function () {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(function (key) { return !ALL_CACHES.includes(key); })
          .map(function (key) { return caches.delete(key); })
      );

      // فعال‌سازی فوری کنترل کلاینت‌ها
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(function () {});
      }

      await self.clients.claim();
    })()
  );
});

/* =========================================================
   رویداد FETCH — هدایت درخواست‌ها به استراتژی مناسب
   ========================================================= */
self.addEventListener('fetch', function (event) {
  const req = event.request;

  // فقط GET
  if (req.method !== 'GET') return;

  // درخواست‌های کروم‌اکستنشن و بقیه را رها کن
  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;
  if (url.protocol === 'chrome-extension:') return;

  /* =======================================================
     ۱. درخواست‌های سایت اصلی (rosha-24.ir)
     ======================================================= */
  if (url.hostname === SITE_ORIGIN || url.hostname.endsWith('.' + SITE_ORIGIN)) {
    event.respondWith(networkFirst(req, CACHE_SITE));
    return;
  }

  /* =======================================================
     ۲. فونت‌ها (jsdelivr + Google Fonts)
     ======================================================= */
  if (FONT_HOSTS.some(function (host) { return url.hostname === host; })) {
    event.respondWith(staleWhileRevalidate(req, CACHE_FONTS, MAX_FONTS_ITEMS));
    return;
  }

  /* =======================================================
     ۳. فایل‌های خود PWA (همان دامنه گیت‌هاب)
     ======================================================= */
  if (url.origin === self.location.origin) {

    // ناوبری (صفحه‌ها)
    if (req.mode === 'navigate') {
      event.respondWith(
        (async function () {
          try {
            return await fetch(req);
          } catch (err) {
            const cached = await caches.match(req);
            if (cached) return cached;

            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;

            return offlineResponse('text');
          }
        })()
      );
      return;
    }

    // آیکون‌ها، CSS، JS → Cache-First
    if (RE_IMAGE.test(url.pathname) || RE_STYLE.test(url.pathname) || RE_SCRIPT.test(url.pathname)) {
      event.respondWith(cacheFirst(req, CACHE_STATIC));
      return;
    }

    // بقیه → Stale-While-Revalidate
    event.respondWith(staleWhileRevalidate(req, CACHE_STATIC, MAX_RUNTIME_ITEMS));
    return;
  }

  /* =======================================================
     ۴. بقیه دامنه‌ها → Stale-While-Revalidate
     ======================================================= */
  event.respondWith(staleWhileRevalidate(req, CACHE_RUNTIME, MAX_RUNTIME_ITEMS));
});

/* =========================================================
   رویداد MESSAGE — ارتباط با صفحه
   ========================================================= */
self.addEventListener('message', function (event) {
  const data = event.data || {};

  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }).then(function () {
        if (event.source) {
          event.source.postMessage({ type: 'CACHE_CLEARED' });
        }
      })
    );
    return;
  }

  if (data.type === 'GET_VERSION') {
    if (event.source) {
      event.source.postMessage({
        type: 'VERSION',
        version: VERSION,
        build: BUILD
      });
    }
    return;
  }
});

/* =========================================================
   رویداد SYNC — همگام‌سازی پس‌زمینه
   ========================================================= */
self.addEventListener('sync', function (event) {
  if (event.tag === 'sync-tickets') {
    event.waitUntil(
      (async function () {
        // اینجا می‌توانید تیکت‌های در انتظار را ارسال کنید
        // (فعلاً خالی)
      })()
    );
  }
});

/* =========================================================
   رویداد PUSH — نوتیفیکیشن Push
   ========================================================= */
self.addEventListener('push', function (event) {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    payload = { title: 'مشاوره همراه', body: event.data.text() };
  }

  const title   = payload.title || 'مشاوره همراه';
  const options = {
    body: payload.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-72.png',
    dir: 'rtl',
    lang: 'fa',
    vibrate: [100, 50, 100],
    data: payload.data || {},
    actions: payload.actions || []
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* =========================================================
   رویداد NOTIFICATIONCLICK — کلیک روی نوتیفیکیشن
   ========================================================= */
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url)
    || './app.html';

  event.waitUntil(
    (async function () {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      // اگر پنجره باز است، فوکوس کن
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(url);
          }
          return;
        }
      }

      // در غیر این صورت پنجره جدید باز کن
      if (clients.openWindow) {
        await clients.openWindow(url);
      }
    })()
  );
});

/* =========================================================
   پایان sw.js
   ========================================================= */
