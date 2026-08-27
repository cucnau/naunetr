const CACHE_NAME = 'edit-translation-v5';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn-icons-png.flaticon.com/512/1828/1828911.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Dùng map để cache từng asset an toàn, không bị crash nếu có link bị lỗi
      await Promise.allSettled(
        ASSETS.map((asset) => cache.add(asset).catch((err) => {
          console.warn('Không thể cache asset:', asset, err);
        }))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Xóa cache cũ:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bỏ qua các API của Firebase
  if (
    event.request.url.includes('firestore.googleapis.com') ||
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    event.request.url.includes('securetoken.googleapis.com')
  ) {
    return;
  }

  // Đối với tài liệu HTML (index.html, trang chủ, điều hướng), áp dụng chiến lược Network-First
  if (
    event.request.mode === 'navigate' || 
    url.pathname === '/' || 
    url.pathname.endsWith('.html') ||
    url.pathname === '/index.html'
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Lưu bản HTML mới nhất vào cache để dự phòng lúc mất mạng
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // Khi mất mạng hoàn toàn, mới lấy bản index.html từ cache ra dùng
          return caches.match(event.request);
        })
    );
    return;
  }

  // Đối với các file asset JS/CSS do Vite build có chứa hash (ví dụ: index-XXXX.js),
  // chúng là độc nhất nên nếu có trong cache thì trả về luôn, chưa có thì tải từ mạng
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
