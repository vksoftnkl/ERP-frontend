import { toInternalRoute } from "@/lib/navigation/safe-route";
const REDUX_SESSION_STORAGE_KEY = "erp_client_redux_state";
const MAX_RECENT_PAGES = 10;
const EXCLUDED_EXACT_ROUTES = new Set(["/", "/home", "/login", "/ui-library", "/erp-data-demo"]);
const EXCLUDED_PREFIX_ROUTES = ["/login/", "/ui-library/", "/erp-data-demo/"];
export type RecentPageEntry = {
  path: string;
  label: string;
};
type JsonRecord = Record<string, unknown>;
function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as JsonRecord;
}
function normalizeRecentPageEntry(value: unknown): RecentPageEntry | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const path = toInternalRoute(typeof record.path === "string" ? record.path : null);
  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (!path || !label || !isTrackableRecentPagePath(path)) {
    return null;
  }
  return { path, label };
}
export function sanitizeRecentPages(entries: RecentPageEntry[]): RecentPageEntry[] {
  const deduped: RecentPageEntry[] = [];
  const seenPaths = new Set<string>();
  for (const entry of entries) {
    const normalized = normalizeRecentPageEntry(entry);
    if (!normalized || seenPaths.has(normalized.path)) {
      continue;
    }
    deduped.push(normalized);
    seenPaths.add(normalized.path);
    if (deduped.length >= MAX_RECENT_PAGES) {
      break;
    }
  }
  return deduped;
}
export function isTrackableRecentPagePath(pathname: string | null | undefined): boolean {
  const path = toInternalRoute(pathname);
  if (!path) {
    return false;
  }
  if (EXCLUDED_EXACT_ROUTES.has(path)) {
    return false;
  }
  return !EXCLUDED_PREFIX_ROUTES.some((prefix) => path.startsWith(prefix));
}
export function readRecentPages(): RecentPageEntry[] {
  if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
    return [];
  }
  try {
    const persisted = window.sessionStorage.getItem(REDUX_SESSION_STORAGE_KEY);
    const parsed = persisted ? JSON.parse(persisted) as { auth?: { recentPages?: unknown } } : null;
    return Array.isArray(parsed?.auth?.recentPages)
      ? sanitizeRecentPages(parsed.auth.recentPages as RecentPageEntry[])
      : [];
  } catch {
    return [];
  }
}
export function upsertRecentPage(
  entry: RecentPageEntry,
  existingEntries: RecentPageEntry[] = readRecentPages(),
): RecentPageEntry[] {
  const normalizedEntry = normalizeRecentPageEntry(entry);
  if (!normalizedEntry) {
    return sanitizeRecentPages(existingEntries);
  }
  return sanitizeRecentPages([
    normalizedEntry,
    ...existingEntries.filter((existingEntry) => existingEntry.path !== normalizedEntry.path),
  ]);
}
export function clearRecentPagesSession(): RecentPageEntry[] {
  return [];
}