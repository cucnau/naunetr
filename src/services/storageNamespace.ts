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
 * Đọc dữ liệu từ localStorage theo phân vùng riêng của repo
 */
export function getScopedStorageItem(key: string, legacyKey?: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const scopedKey = getScopedStorageKey(key);
    const value = localStorage.getItem(scopedKey);
    if (value !== null) {
      return value;
    }

    // Nếu repo chưa có dữ liệu riêng và đang ở 'default' mới đọc fallback key cũ
    const ns = getAppNamespace();
    if (ns === 'default') {
      const directVal = localStorage.getItem(key);
      if (directVal !== null) {
        return directVal;
      }
      if (legacyKey) {
        const rawLegacyVal = localStorage.getItem(legacyKey);
        if (rawLegacyVal !== null) {
          return rawLegacyVal;
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
