import { toInternalRoute } from "@/lib/navigation/safe-route";

const RECENT_PAGES_CACHE_KEY = "erp_client_recent_pages";
const MAX_RECENT_PAGES = 10;
const EXCLUDED_EXACT_ROUTES = new Set(["/", "/login", "/ui-library", "/erp-advanced-fixed"]);
const EXCLUDED_PREFIX_ROUTES = ["/login/", "/ui-library/", "/erp-advanced-fixed/"];

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

function sanitizeRecentPages(entries: RecentPageEntry[]): RecentPageEntry[] {
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

function persistRecentPages(entries: RecentPageEntry[]): RecentPageEntry[] {
  if (typeof window === "undefined") {
    return entries;
  }

  if (entries.length === 0) {
    window.sessionStorage.removeItem(RECENT_PAGES_CACHE_KEY);
    return entries;
  }

  window.sessionStorage.setItem(RECENT_PAGES_CACHE_KEY, JSON.stringify(entries));
  return entries;
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
  if (typeof window === "undefined") {
    return [];
  }

  const persisted = window.sessionStorage.getItem(RECENT_PAGES_CACHE_KEY);
  if (!persisted) {
    return [];
  }

  try {
    const parsed = JSON.parse(persisted) as unknown;
    if (!Array.isArray(parsed)) {
      window.sessionStorage.removeItem(RECENT_PAGES_CACHE_KEY);
      return [];
    }

    const sanitized = sanitizeRecentPages(parsed as RecentPageEntry[]);
    if (sanitized.length !== parsed.length) {
      persistRecentPages(sanitized);
    }
    return sanitized;
  } catch {
    window.sessionStorage.removeItem(RECENT_PAGES_CACHE_KEY);
    return [];
  }
}

export function upsertRecentPage(entry: RecentPageEntry): RecentPageEntry[] {
  const normalizedEntry = normalizeRecentPageEntry(entry);
  if (!normalizedEntry) {
    return readRecentPages();
  }

  const existingEntries = readRecentPages();
  const nextEntries = sanitizeRecentPages([
    normalizedEntry,
    ...existingEntries.filter((existingEntry) => existingEntry.path !== normalizedEntry.path),
  ]);

  return persistRecentPages(nextEntries);
}

export function clearRecentPagesSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(RECENT_PAGES_CACHE_KEY);
}
