/**
 * Tien ich phan vung luu tru cuc bo (LocalStorage va IndexedDB)
 * Ngan chan xung dot du lieu khi nhieu repo duoc deploy tren cung mot domain GitHub Pages (username.github.io/repo1 va username.github.io/repo2)
 */

export function getAppNamespace(): string {
  // 1. Uu tien bien moi truong do nguoi dung cau hinh (trong .env cua tung repo)
  if (import.meta.env.VITE_APP_INSTANCE) {
    return String(import.meta.env.VITE_APP_INSTANCE).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  }

  // 2. Tu dong nhan dien thong minh theo duong dan pathname tren GitHub Pages hoac ten mien
  if (typeof window !== 'undefined' && window.location) {
    // Neu chay tren GitHub Pages: https://username.github.io/<ten-repo>/...
    const pathSegments = window.location.pathname.split('/').filter(Boolean);
    if (pathSegments.length > 0 && !pathSegments[0].includes('.')) {
      return pathSegments[0].toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    }

    // Neu chay o root domain rieng (nhu Vercel, Netlify, custom domain)
    const host = window.location.hostname.toLowerCase();
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      const cleanHost = host.replace(/[^a-z0-9_-]/g, '_').slice(0, 30);
      if (cleanHost) return cleanHost;
    }
  }

  return 'default';
}

/**
 * Tao storage key da duoc phan vung rieng cho tung web/repo
 */
export function getScopedStorageKey(key: string): string {
  const ns = getAppNamespace();
  return `${key}_${ns}`;
}

/**
 * Doc du lieu tu localStorage voi fallback tu khoa cu (tranh mat du lieu nguoi dung)
 */
export function getScopedStorageItem(key: string, legacyKey?: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const scopedKey = getScopedStorageKey(key);
    const value = localStorage.getItem(scopedKey);
    if (value !== null) {
      return value;
    }

    // Fallback 1: Key truc tiep chua co namespace
    const directVal = localStorage.getItem(key);
    if (directVal !== null) {
      try {
        localStorage.setItem(scopedKey, directVal);
      } catch (_) {}
      return directVal;
    }

    // Fallback 2: Legacy key cu neu co
    if (legacyKey) {
      const scopedLegacy = getScopedStorageKey(legacyKey);
      const legacyScopedVal = localStorage.getItem(scopedLegacy);
      if (legacyScopedVal !== null) {
        try {
          localStorage.setItem(scopedKey, legacyScopedVal);
        } catch (_) {}
        return legacyScopedVal;
      }

      const rawLegacyVal = localStorage.getItem(legacyKey);
      if (rawLegacyVal !== null) {
        try {
          localStorage.setItem(scopedKey, rawLegacyVal);
        } catch (_) {}
        return rawLegacyVal;
      }
    }

    return null;
  } catch (e) {
    console.warn(`Loi doc localStorage cho key ${key}:`, e);
    return null;
  }
}

/**
 * Ghi du lieu vao localStorage theo scoped key
 */
export function setScopedStorageItem(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  const scopedKey = getScopedStorageKey(key);
  localStorage.setItem(scopedKey, value);
}

/**
 * Xoa du lieu tu localStorage theo scoped key
 */
export function removeScopedStorageItem(key: string): void {
  if (typeof window === 'undefined') return;
  const scopedKey = getScopedStorageKey(key);
  localStorage.removeItem(scopedKey);
}

/**
 * Lay ten Database IndexedDB duoc cach ly rieng cho tung repo
 */
export function getScopedDbName(): string {
  const ns = getAppNamespace();
  return `AppDB_${ns}`;
}
