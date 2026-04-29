const DEFAULT_API_PORT = "3010";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, "");
}

function resolveLoopbackHostname(hostname: string): string {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") {
    return "127.0.0.1";
  }
  return hostname;
}

function resolveDefaultApiBase(): string {
  if (typeof window === "undefined") {
    return `https://localhost:${DEFAULT_API_PORT}/api/v1`;
  }

  const protocol = window.location.protocol === "http:" ? "http:" : "https:";
  const apiHostname = resolveLoopbackHostname(window.location.hostname);
  return `${protocol}//${apiHostname}:${DEFAULT_API_PORT}/api/v1`;
}

export function resolveApiBase(): string {
  const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE?.trim();
  if (!configuredApiBase) {
    return resolveDefaultApiBase();
  }

  if (typeof window === "undefined") {
    return trimTrailingSlash(configuredApiBase);
  }

  try {
    const resolvedUrl = new URL(configuredApiBase);
    const currentHostname = window.location.hostname;
    const resolvedHostname = resolvedUrl.hostname.toLowerCase();
    const resolvedIsLocal = LOCAL_HOSTNAMES.has(resolvedHostname);
    const currentIsLocal = LOCAL_HOSTNAMES.has(currentHostname.toLowerCase());

    if (resolvedIsLocal && !currentIsLocal) {
      resolvedUrl.hostname = currentHostname;
    }

    if (window.location.protocol === "http:" && resolvedUrl.protocol === "https:") {
      resolvedUrl.protocol = "http:";
    }

    return trimTrailingSlash(resolvedUrl.toString());
  } catch {
    return trimTrailingSlash(configuredApiBase);
  }
}
export const API_BASE = resolveApiBase();
function extractMessage(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => extractMessage(entry))
      .filter((entry) => entry.length > 0)
      .join(", ")
      .trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = ["message", "error", "detail", "title", "errors"] as const;
    for (const key of preferredKeys) {
      const nested = extractMessage(record[key]);
      if (nested) {
        return nested;
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
}
export function extractApiErrorMessage(value: unknown, fallback = "Something went wrong"): string {
  const extracted = extractMessage(value);
  return extracted || fallback;
}
export function getRequestPathname(requestUrl: string): string {
  const trimmedUrl = requestUrl.trim();
  if (!trimmedUrl) {
    return "";
  }
  try {
    return new URL(trimmedUrl, "http://localhost").pathname.toLowerCase();
  } catch {
    return trimmedUrl.toLowerCase().split("?")[0];
  }
}
export function isLoginEndpoint(requestUrl: string): boolean {
  const pathname = getRequestPathname(requestUrl);
  return pathname === "/auth/login" || pathname.endsWith("/auth/login");
}
export function getAuthHeaderValue(token?: string | null): string | null {
  const normalized = token?.trim();
  if (!normalized) {
    return null;
  }

  return normalized.startsWith("Bearer ") ? normalized : `Bearer ${normalized}`;
}
