// Service Worker DJPM 2027 (v4)
// Fitur:
// 1. Memenuhi syarat Installable PWA.
// 2. Network-First untuk Navigasi Dokumen HTML (agar reload selalu menyajikan versi terkini saat online).
// 3. Network-First (fallback cache) untuk skrip /js/ -- skrip ini berisi logika (bukan cuma
//    tampilan), jadi TIDAK boleh stale: dulu dipukul rata dgn ikon/gambar pakai Stale-While-
//    Revalidate, akibatnya perbaikan bug baru butuh hard refresh manual utk tampil (SW selalu
//    menyajikan versi cache lama seketika, baru memperbarui cache di latar belakang utk load
//    BERIKUTNYA -- 1 load selalu tertinggal 1 versi, dan kalau SW_VERSION lupa dinaikkan saat
//    deploy, cache lama itu tidak pernah tergantikan sama sekali).
// 4. Stale-While-Revalidate utk aset statis non-skrip (icons, logo, manifest, css) -- aman basi
//    sebentar demi kecepatan karena tidak mengandung logika.
// 5. MUTLAK BYPASS untuk: request non-GET, endpoint API (/api/), Google Drive/APIs, dan Supabase.
// 6. Otomatis membersihkan cache versi lama saat aktivasi + langsung ambil alih tab yang terbuka
//    (skipWaiting + clients.claim) supaya versi baru aktif tanpa perlu tutup semua tab.

const SW_VERSION = 'djpm-sw-v9';
const STATIC_CACHE_NAME = `djpm-static-${SW_VERSION}`;
const FAST_TIMEOUT_MS = 3000; // 3 detik batas tunggu jaringan sebelum fallback ke cache

// Daftar aset inti shell yang di-precache saat instalasi PWA
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/css/tailwind.css',
  '/logo-medan.png',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache selesai dengan catatan:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('djpm-static-') && name !== STATIC_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/**
 * Helper Network-First dengan Fast Timeout Fallback (3 Detik).
 * Jika jaringan cepat (< 3 dtk): sajikan data segar dari network & perbarui cache.
 * Jika jaringan lambat/macet (> 3 dtk): segera sajikan salinan cache lokal agar UI tidak hang,
 * sementara network fetch tetap berjalan di latar untuk memperbarui cache berikutnya.
 */
function networkFirstDenganTimeout(req, cacheName, timeoutMs, fallbackNavigate) {
  return caches.open(cacheName).then((cache) => {
    let resolved = false;

    return new Promise((resolve) => {
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'default')) {
            cache.put(req, networkResponse.clone()).catch(() => {});
            if (!resolved) {
              resolved = true;
              resolve(networkResponse);
            }
          } else if (networkResponse && networkResponse.status >= 500) {
            cache.match(req).then((cached) => {
              if (!resolved) {
                resolved = true;
                if (cached) {
                  resolve(cached);
                } else if (fallbackNavigate) {
                  caches.match('/index.html').then((indexCached) => resolve(indexCached || networkResponse));
                } else {
                  resolve(networkResponse);
                }
              }
            });
          } else {
            if (!resolved) {
              resolved = true;
              resolve(networkResponse);
            }
          }
        })
        .catch(() => {
          if (!resolved) {
            resolved = true;
            cache.match(req).then((cached) => {
              if (cached) {
                resolve(cached);
              } else if (fallbackNavigate) {
                caches.match('/index.html').then((indexCached) => resolve(indexCached || Response.error()));
              } else {
                resolve(Response.error());
              }
            });
          }
        });

      // Timer fast timeout
      setTimeout(() => {
        if (!resolved) {
          cache.match(req).then((cached) => {
            if (cached && !resolved) {
              resolved = true;
              resolve(cached);
            }
          });
        }
      }, timeoutMs);
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1. MUTLAK BYPASS request non-GET
  if (req.method !== 'GET') {
    return;
  }

  const url = new URL(req.url);

  // 2. MUTLAK BYPASS API internal dan eksternal (Supabase, Google Drive / APIs)
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('google.com') ||
    url.protocol.startsWith('chrome-extension')
  ) {
    return;
  }

  // 3. Navigasi Dokumen HTML: Network-First dengan Fast Timeout 3 Detik (fallback /index.html)
  const isNavigasi = req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html';
  if (isNavigasi && url.origin === self.location.origin) {
    event.respondWith(
      networkFirstDenganTimeout(req, STATIC_CACHE_NAME, FAST_TIMEOUT_MS, true)
    );
    return;
  }

  // 4. Skrip aplikasi (/js/): Network-First dengan Fast Timeout 3 Detik
  const isScriptAsset = url.origin === self.location.origin && url.pathname.startsWith('/js/');
  if (isScriptAsset) {
    event.respondWith(
      networkFirstDenganTimeout(req, STATIC_CACHE_NAME, FAST_TIMEOUT_MS, false)
    );
    return;
  }

  // 5. Aset statis lain (ikon, gambar, css, manifest): di-cache
  const isStaticAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/icons/') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.endsWith('.css') ||
      url.pathname === '/manifest.json');

  if (!isStaticAsset) {
    return;
  }

  // 6. Stale-While-Revalidate untuk aset statis non-skrip (CSS, Ikon, Gambar, Manifest)
  event.respondWith(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.match(req).then((cachedResponse) => {
        const fetchPromise = fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            cache.put(req, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      });
    }).catch(() => fetch(req))
  );
});
