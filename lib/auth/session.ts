const CLIENT_DEVICE_ID_CACHE_KEY = "erp_client_device_id";
const REDUX_SESSION_STORAGE_KEY = "erp_client_redux_state";
export const AUTH_SESSION_EVENT = "erp:auth-session-changed";
export type AuthSessionChangeDetail = {
  token: string | null;
  refreshToken: string | null;
  userId: string | null;
};
type StorageValue = string | number | null | undefined;
type JsonRecord = Record<string, unknown>;
let memoryAuthToken: string | null = null;
let memoryRefreshToken: string | null = null;
let memoryAuthUserId: string | null = null;
function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}
function normalizeStoredValue(value: StorageValue): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
function pickFirstString(values: Array<unknown>): string | null {
  for (const value of values) {
    const normalized = normalizeStoredValue(value as StorageValue);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}
function emitAuthSessionChange(
  token: string | null,
  refreshToken: string | null,
  userId: string | null,
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<AuthSessionChangeDetail>(AUTH_SESSION_EVENT, {
      detail: { token, refreshToken, userId },
    }),
  );
}
function readPersistedAuthState(): JsonRecord | null {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
    return null;
  }
  try {
    const persisted = window.sessionStorage.getItem(REDUX_SESSION_STORAGE_KEY);
    const parsed = persisted ? JSON.parse(persisted) as unknown : null;
    const root = asRecord(parsed);
    return asRecord(root?.auth);
  } catch {
    return null;
  }
}
function writePersistedAuthSession(
  token: string | null,
  refreshToken: string | null,
  userId: string | null,
): void {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
    return;
  }
  try {
    const persisted = window.sessionStorage.getItem(REDUX_SESSION_STORAGE_KEY);
    const root = asRecord(persisted ? JSON.parse(persisted) as unknown : null) ?? {};
    const currentAuth = asRecord(root.auth) ?? {};
    root.auth = {
      ...currentAuth,
      initialized: true,
      isAuthenticated: Boolean(token),
      token,
      refreshToken: token ? refreshToken : null,
      userId: token ? userId : null,
      recentPages: token && Array.isArray(currentAuth.recentPages) ? currentAuth.recentPages : [],
      businessContext: token ? currentAuth.businessContext ?? null : null,
    };
    window.sessionStorage.setItem(REDUX_SESSION_STORAGE_KEY, JSON.stringify(root));
  } catch {
    // Redux state remains the source of truth when persistence is unavailable.
  }
}
export function extractAuthToken(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const root = asRecord(payload);
  if (!root) {
    return null;
  }
  const nestedData = asRecord(root.data);
  const nestedResult = asRecord(root.result);
  return pickFirstString([
    root.token,
    root.accessToken,
    root.access_token,
    root.authToken,
    root.auth_token,
    root.jwt,
    root.id_token,
    nestedData?.token,
    nestedData?.accessToken,
    nestedData?.access_token,
    nestedData?.authToken,
    nestedData?.auth_token,
    nestedData?.jwt,
    nestedData?.id_token,
    nestedResult?.token,
    nestedResult?.accessToken,
    nestedResult?.access_token,
    nestedResult?.authToken,
    nestedResult?.auth_token,
    nestedResult?.jwt,
    nestedResult?.id_token,
  ]);
}

export function extractRefreshToken(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }
  const nestedData = asRecord(root.data);
  const nestedResult = asRecord(root.result);
  return pickFirstString([
    root.refreshToken,
    root.refresh_token,
    nestedData?.refreshToken,
    nestedData?.refresh_token,
    nestedResult?.refreshToken,
    nestedResult?.refresh_token,
  ]);
}
export function extractAuthUserId(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) {
    return null;
  }
  const nestedData = asRecord(root.data);
  const nestedResult = asRecord(root.result);
  const rootUser = asRecord(root.user);
  const nestedDataUser = asRecord(nestedData?.user);
  const nestedResultUser = asRecord(nestedResult?.user);
  return pickFirstString([
    root.userId,
    root.user_id,
    root.userid,
    root.loginId,
    root.login_id,
    rootUser?.userId,
    rootUser?.user_id,
    rootUser?.id,
    nestedData?.userId,
    nestedData?.user_id,
    nestedData?.userid,
    nestedData?.loginId,
    nestedData?.login_id,
    nestedDataUser?.userId,
    nestedDataUser?.user_id,
    nestedDataUser?.id,
    nestedResult?.userId,
    nestedResult?.user_id,
    nestedResult?.userid,
    nestedResult?.loginId,
    nestedResult?.login_id,
    nestedResultUser?.userId,
    nestedResultUser?.user_id,
    nestedResultUser?.id,
    root.id,
    nestedData?.id,
    nestedResult?.id,
  ]);
}
export function setAuthSession(
  token?: string | null,
  userId?: StorageValue,
  refreshToken?: string | null,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const normalizedToken = normalizeStoredValue(token);
  if (!normalizedToken) {
    clearAuthSession();
    return false;
  }
  const normalizedRefreshToken = normalizeStoredValue(refreshToken);
  const normalizedUserId = normalizeStoredValue(userId);
  memoryAuthToken = normalizedToken;
  memoryRefreshToken = normalizedRefreshToken;
  memoryAuthUserId = normalizedUserId;
  writePersistedAuthSession(normalizedToken, normalizedRefreshToken, normalizedUserId);
  emitAuthSessionChange(normalizedToken, normalizedRefreshToken, normalizedUserId);
  return true;
}
export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  memoryAuthToken = null;
  memoryRefreshToken = null;
  memoryAuthUserId = null;
  writePersistedAuthSession(null, null, null);
  emitAuthSessionChange(null, null, null);
}
export function getAuthSession(): string | null {
  return memoryAuthToken ?? normalizeStoredValue(readPersistedAuthState()?.token as StorageValue);
}
export function getRefreshToken(): string | null {
  return (
    memoryRefreshToken ??
    normalizeStoredValue(readPersistedAuthState()?.refreshToken as StorageValue)
  );
}
export function getAuthUserId(): string | null {
  return memoryAuthUserId ?? normalizeStoredValue(readPersistedAuthState()?.userId as StorageValue);
}
function decodeBase64UrlSegment(segment: string): string | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    if (typeof window !== "undefined" && typeof window.atob === "function") {
      const decoded = window.atob(padded);
      const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}
function decodeJwtPayload(token: string): JsonRecord | null {
  const normalizedToken = token.trim().replace(/^Bearer\s+/i, "");
  const segments = normalizedToken.split(".");
  if (segments.length < 2 || !segments[1]) {
    return null;
  }
  const decodedPayload = decodeBase64UrlSegment(segments[1]);
  if (!decodedPayload) {
    return null;
  }
  try {
    const parsedPayload = JSON.parse(decodedPayload) as unknown;
    return asRecord(parsedPayload);
  } catch {
    return null;
  }
}
export function getAuthSessionId(): string | null {
  const token = getAuthSession();
  if (!token) {
    return null;
  }
  const payload = decodeJwtPayload(token);
  return pickFirstString([payload?.sid, payload?.sessionId, payload?.session_id]);
}
function generateUuid(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const randomValues = window.crypto?.getRandomValues?.(new Uint8Array(16));
  if (!randomValues) {
    return null;
  }
  randomValues[6] = (randomValues[6] & 0x0f) | 0x40;
  randomValues[8] = (randomValues[8] & 0x3f) | 0x80;
  const hex = Array.from(randomValues, (value) => value.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
export function getOrCreateClientDeviceId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const existingId = window.sessionStorage.getItem(CLIENT_DEVICE_ID_CACHE_KEY)?.trim();
  if (existingId) {
    return existingId;
  }
  const nextId =
    typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : generateUuid();
  if (!nextId) {
    return null;
  }
  window.sessionStorage.setItem(CLIENT_DEVICE_ID_CACHE_KEY, nextId);
  return nextId;
}
export function isAuthenticated(): boolean {
  return Boolean(getAuthSession()?.trim());
}
