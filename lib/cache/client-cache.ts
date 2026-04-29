"use client";

const LEGACY_CLIENT_CACHE_NAME = "erp_client_app_cache_v1";
const LOCAL_STORAGE_PREFIX = "erp_client_cache:";
const SESSION_STORAGE_PREFIX = "erp_client_session:";

const memoryCache = new Map<string, string>();

function canUseCookies(): boolean {
  return typeof document !== "undefined";
}

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function encodeCookiePart(value: string): string {
  return encodeURIComponent(value);
}

function decodeCookiePart(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function getExpiredCookieAttributes(): string {
  const attributes = [`Path=/`, `SameSite=Lax`, `Max-Age=0`];
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

function readSessionStorageValue(key: string): string | null {
  if (!canUseSessionStorage()) {
    return null;
  }
  try {
    const value = window.sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${key}`);
    return value?.trim() ? value : null;
  } catch {
    return null;
  }
}

function expireCookieValue(key: string): void {
  if (!canUseCookies()) {
    return;
  }
  document.cookie = [
    `${encodeCookiePart(key)}=`,
    getExpiredCookieAttributes(),
  ].join("; ");
}

function setSessionStorageValue(key: string, value: string): void {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    window.sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${key}`, value);
  } catch {
    // Memory remains available when sessionStorage is blocked or full.
  }
}

function removeSessionStorageValue(key: string): void {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    window.sessionStorage.removeItem(`${SESSION_STORAGE_PREFIX}${key}`);
  } catch {
    // Nothing else to do when sessionStorage removal is blocked.
  }
}

function removeLegacyLocalStorageValue(key: string): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${key}`);
  } catch {
    // Nothing else to do when localStorage cleanup is blocked.
  }
}

function clearLegacyClientCache(): void {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index);
        if (key?.startsWith(LOCAL_STORAGE_PREFIX)) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Legacy cleanup is best effort.
    }
  }
  if (canUseCookies()) {
    document.cookie.split("; ").forEach((entry) => {
      const [rawName] = entry.split("=");
      const cookieName = decodeCookiePart(rawName ?? "");
      if (cookieName?.startsWith("erp_client_")) {
        expireCookieValue(cookieName);
      }
    });
  }
}

export function hydrateClientCache(): Promise<void> {
  if (typeof window !== "undefined" && typeof window.caches !== "undefined") {
    void window.caches.delete(LEGACY_CLIENT_CACHE_NAME);
  }
  clearLegacyClientCache();
  return Promise.resolve();
}

export function getClientCacheItem(key: string): string | null {
  const storageValue = readSessionStorageValue(key);
  if (storageValue !== null) {
    memoryCache.set(key, storageValue);
    return storageValue;
  }
  return memoryCache.get(key) ?? null;
}

export async function setClientCacheItem(key: string, value: string): Promise<void> {
  memoryCache.set(key, value);
  setSessionStorageValue(key, value);
  removeLegacyLocalStorageValue(key);
  expireCookieValue(key);
}

export async function removeClientCacheItem(key: string): Promise<void> {
  memoryCache.delete(key);
  removeSessionStorageValue(key);
  removeLegacyLocalStorageValue(key);
  expireCookieValue(key);
}
