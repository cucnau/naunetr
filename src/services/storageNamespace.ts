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
  // 1. Biến môi trường do build/deploy quy định riêng cho từng repo
  if (import.meta.env.VITE_APP_INSTANCE) {
    return String(import.meta.env.VITE_APP_INSTANCE).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }

  // 2. Nhận diện theo Base URL của Vite (được cấu hình riêng cho từng GitHub repo, ví dụ /repo1/ vs /repo2/)
  if (import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/' && import.meta.env.BASE_URL !== './') {
    const cleanBase = import.meta.env.BASE_URL.replace(/^\/|\/$/g, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (cleanBase) return cleanBase;
  }

  // 3. Tự động nhận diện chính xác theo đường dẫn pathname trên GitHub Pages (https://username.github.io/<ten-repo>/...)
  if (typeof window !== 'undefined' && window.location) {
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0 && !pathSegments[0].includes('.')) {
      return pathSegments[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }
  }

  return 'root_app';
}

/**
 * Tạo storage key đã được phân vùng riêng cho từng web/repo
 */
export function getScopedStorageKey(key: string): string {
  const ns = getAppNamespace();
  return `${key}_${ns}`;
}

/**
 * Đọc dữ liệu từ localStorage theo phân vùng riêng của repo (web nào chỉ đọc đúng của web đó)
 */
export function getScopedStorageItem(key: string, legacyKey?: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const scopedKey = getScopedStorageKey(key);
    // 1. Đọc đúng scoped key của chính web này
    const value = localStorage.getItem(scopedKey);
    if (value !== null && value.trim().length > 0) {
      return value;
    }

    // 2. Chỉ fallback key gốc hoặc legacyKey nếu chưa từng được phân vùng
    const directVal = localStorage.getItem(key);
    if (directVal !== null && directVal.trim().length > 0) {
      try { localStorage.setItem(scopedKey, directVal); } catch (_) {}
      return directVal;
    }

    if (legacyKey) {
      const rawLegacyVal = localStorage.getItem(legacyKey);
      if (rawLegacyVal !== null && rawLegacyVal.trim().length > 0) {
        try { localStorage.setItem(scopedKey, rawLegacyVal); } catch (_) {}
        return rawLegacyVal;
      }
    }

    return null;
  } catch (e) {
    console.warn(`Lỗi đọc localStorage cho key ${key}:`, e);
    return null;
  }
}

/**
 * Tự động tìm kiếm và khôi phục danh sách truyện đúng cho tài khoản đang dùng (targetUid) của chính web này
 */
export function recoverAllCachedNovels(targetUid?: string): Array<{ id: string; name: string }> {
  if (typeof window === 'undefined') return [{ id: 'default', name: 'Truyện mặc định' }];
  
  const novelMap = new Map<string, { id: string; name: string }>();
  const ns = getAppNamespace();

  try {
    const targetKey = targetUid ? `cached_novels_${targetUid}_${ns}` : `cached_novels_list_${ns}`;
    const raw = localStorage.getItem(targetKey) || (targetUid ? localStorage.getItem(`cached_novels_${targetUid}`) : localStorage.getItem('cached_novels_list'));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any) => {
          if (item && typeof item === 'object' && item.id && item.name && typeof item.name === 'string') {
            const cleanName = item.name.trim();
            if (cleanName.length > 0) {
              novelMap.set(item.id, { id: String(item.id), name: cleanName });
            }
          }
        });
      }
    }
  } catch (e) {
    console.warn("Lỗi quét localStorage phục hồi novels:", e);
  }

  // Nếu tìm thấy danh sách truyện hợp lệ của chính tài khoản này
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
