const AUTH_CACHE_KEY = "erp_client_auth_token";
export const AUTH_SESSION_EVENT = "erp:auth-session-changed";

export type AuthSessionChangeDetail = {
  token: string | null;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}

function pickFirstString(values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function emitAuthSessionChange(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<AuthSessionChangeDetail>(AUTH_SESSION_EVENT, {
      detail: { token },
    }),
  );
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
export function setAuthSession(token?: string | null): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const value = token?.trim();
  if (!value) {
    clearAuthSession();
    return false;
  }
  window.sessionStorage.setItem(AUTH_CACHE_KEY, value);
  emitAuthSessionChange(value);
  return true;
}

export function clearAuthSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(AUTH_CACHE_KEY);
  emitAuthSessionChange(null);
}

export function getAuthSession(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage.getItem(AUTH_CACHE_KEY);
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthSession()?.trim());
}
