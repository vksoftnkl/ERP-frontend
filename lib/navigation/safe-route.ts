const HTTP_PROTOCOL = "http:";
const HTTPS_PROTOCOL = "https:";
const CONTROL_CHARACTERS_PATTERN = /[\u0000-\u001F]/;
function isHttpProtocol(protocol: string): boolean {
  return protocol === HTTP_PROTOCOL || protocol === HTTPS_PROTOCOL;
}
function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
export function toInternalRoute(route: string | null | undefined): string | null {
  if (!route) {
    return null;
  }
  const candidate = route.trim();
  if (!candidate || CONTROL_CHARACTERS_PATTERN.test(candidate)) {
    return null;
  }
  if (candidate.startsWith("//")) {
    return null;
  }
  if (candidate.startsWith("/")) {
    return candidate;
  }
  if (!isAbsoluteHttpUrl(candidate) || typeof window === "undefined") {
    return null;
  }
  try {
    const currentUrl = new URL(window.location.href);
    const resolvedUrl = new URL(candidate);
    if (!isHttpProtocol(resolvedUrl.protocol)) {
      return null;
    }
    if (resolvedUrl.origin !== currentUrl.origin) {
      return null;
    }
    return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
  } catch {
    return null;
  }
}
export function normalizeInternalRoute(
  route: string | null | undefined,
  fallback = "/"
): string {
  return toInternalRoute(route) ?? fallback;
}
export function canUseClientSideRouting(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  if (!isHttpProtocol(window.location.protocol)) {
    return false;
  }
  try {
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", currentUrl);
    return true;
  } catch {
    return false;
  }
}