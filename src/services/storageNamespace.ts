/**
 * Tiện ích phân vùng lưu trữ cục bộ (LocalStorage và IndexedDB)
 * Ngăn chặn xung đột dữ liệu khi nhiều web/repo chạy trên cùng một domain GitHub Pages (username.github.io/repo1 và username.github.io/repo2)
 */

// Tự động dọn dẹp các key lạ/rác mà phiên bản trước vô tình tạo ra
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    ['chiVietDeviceId', 'chiVietAppScope', 'chiVietSingleSession', 'chiVietHistory'].forEach(k => {
      if (localStorage.getItem(k) !== null) {
        localStorage.removeItem(k);
      }
    });
  } catch (_) {}
}

export function getAppNamespace(): string {
  // 1. Ưu tiên biến môi trường do người dùng cấu hình (trong .env của từng repo: VITE_APP_INSTANCE=web1)
  if (import.meta.env.VITE_APP_INSTANCE) {
    return String(import.meta.env.VITE_APP_INSTANCE).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }

  // 2. Cho phép người dùng tùy chọn đặt namespace riêng trong localStorage nếu cần
  if (typeof window !== 'undefined') {
    try {
      const custom = localStorage.getItem('app_workspace_scope');
      if (custom && custom.trim()) {
        return custom.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      }
    } catch (_) {}
  }

  // 3. Tự động nhận diện thông minh theo đường dẫn pathname trên GitHub Pages: https://username.github.io/<ten-repo>/...
  if (typeof window !== 'undefined' && window.location) {
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    // Nếu chạy trên GitHub Pages dạng /<ten-repo>/
    if (pathSegments.length > 0 && !pathSegments[0].includes('.')) {
      return pathSegments[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }

    // Nếu chạy ở host riêng (như Vercel, Netlify, custom domain, hoặc localhost)
    const host = window.location.hostname.toLowerCase();
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      const cleanHost = host.replace(/[^a-z0-9_-]/g, '_').slice(0, 30);
      if (cleanHost) return cleanHost;
    }
  }

  return 'default';
}

/**
 * Tạo storage key đã được phân vùng riêng cho từng web/repo
 */
export function getScopedStorageKey(key: string): string {
  const ns = getAppNamespace();
  return `${key}_${ns}`;
}

/**
 * Đọc dữ liệu từ localStorage theo phân vùng riêng của repo, tự động fallback và di trú từ mọi key cũ
 */
export function getScopedStorageItem(key: string, legacyKey?: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const scopedKey = getScopedStorageKey(key);
    const value = localStorage.getItem(scopedKey);
    if (value !== null && value.trim().length > 0) {
      return value;
    }

    // 1. Fallback tìm key gốc không có namespace
    const directVal = localStorage.getItem(key);
    if (directVal !== null && directVal.trim().length > 0) {
      try { localStorage.setItem(scopedKey, directVal); } catch (_) {}
      return directVal;
    }

    // 2. Fallback legacyKey nếu có
    if (legacyKey) {
      const rawLegacyVal = localStorage.getItem(legacyKey);
      if (rawLegacyVal !== null && rawLegacyVal.trim().length > 0) {
        try { localStorage.setItem(scopedKey, rawLegacyVal); } catch (_) {}
        return rawLegacyVal;
      }
    }

    // 3. Fallback key với hậu tố _default
    const defaultVal = localStorage.getItem(`${key}_default`);
    if (defaultVal !== null && defaultVal.trim().length > 0) {
      try { localStorage.setItem(scopedKey, defaultVal); } catch (_) {}
      return defaultVal;
    }

    // 4. Quét toàn bộ localStorage để tìm bất kỳ key nào chứa key
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey && (storageKey.startsWith(key) || storageKey.includes(key))) {
        const foundVal = localStorage.getItem(storageKey);
        if (foundVal !== null && foundVal.trim().length > 0) {
          try { localStorage.setItem(scopedKey, foundVal); } catch (_) {}
          return foundVal;
        }
      }
    }

    return null;
  } catch (e) {
    console.warn(`Lỗi đọc localStorage cho key ${key}:`, e);
    return null;
  }
}

/**
 * Tự động tìm kiếm và khôi phục danh sách truyện đúng cho tài khoản đang dùng (targetUid)
 * Ngăn chặn tuyệt đối việc khôi phục nhầm truyện của tài khoản khác
 */
export function recoverAllCachedNovels(targetUid?: string): Array<{ id: string; name: string }> {
  if (typeof window === 'undefined') return [{ id: 'default', name: 'Truyện mặc định' }];
  
  const novelMap = new Map<string, { id: string; name: string }>();

  try {
    if (targetUid) {
      // Khi đã đăng nhập: CHỈ đọc cache của chính targetUid này
      const userKeyPrefix = `cached_novels_${targetUid}`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(userKeyPrefix)) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                  if (item && typeof item === 'object' && item.id && item.name && typeof item.name === 'string') {
                    novelMap.set(item.id, { id: String(item.id), name: String(item.name).trim() });
                  }
                });
              }
            }
          } catch (_) {}
        }
      }
    } else {
      // Khi chưa đăng nhập (khách): Chỉ đọc key cached_novels_list, TUYỆT ĐỐI BỎ QUA các key của tài khoản khác (cached_novels_<uid>)
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k === 'cached_novels_list' || k.startsWith('cached_novels_list_'))) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                parsed.forEach((item: any) => {
                  if (item && typeof item === 'object' && item.id && item.name && typeof item.name === 'string') {
                    novelMap.set(item.id, { id: String(item.id), name: String(item.name).trim() });
                  }
                });
              }
            }
          } catch (_) {}
        }
      }
    }
  } catch (e) {
    console.warn("Lỗi quét localStorage phục hồi novels:", e);
  }

  // Nếu tìm thấy danh sách truyện của chính tài khoản này
  if (novelMap.size > 0) {
    if (novelMap.size > 1 && novelMap.has('default') && novelMap.get('default')?.name === 'Truyện mặc định') {
      novelMap.delete('default');
    }
    const recovered = Array.from(novelMap.values());
    try {
      const saveKey = targetUid ? `cached_novels_${targetUid}` : 'cached_novels_list';
      const scopedKey = getScopedStorageKey(saveKey);
      localStorage.setItem(scopedKey, JSON.stringify(recovered));
    } catch (_) {}
    return recovered;
  }

  return [{ id: 'default', name: 'Truyện mặc định' }];
}

/**
 * Ghi dữ liệu vào localStorage theo scoped key
 */
export function setScopedStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  const scopedKey = getScopedStorageKey(key);
  localStorage.setItem(scopedKey, value);
}

/**
 * Xóa dữ liệu từ localStorage theo scoped key
 */
export function removeScopedStorageItem(key: string): void {
  if (typeof window === 'undefined') return;
  const scopedKey = getScopedStorageKey(key);
  localStorage.removeItem(scopedKey);
}

/**
 * Lấy tên Database IndexedDB được cách ly riêng cho từng repo
 */
export function getScopedDbName(): string {
  const ns = getAppNamespace();
  return `AppDB_${ns}`;
}
