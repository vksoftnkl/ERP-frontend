"use client";

type SearchParamsLike = {
  toString(): string;
};

export type BuildRecordHistoryHrefParams = {
  screenName: string | null | undefined;
  recordPk: string | number | null | undefined;
  displayName?: string | null | undefined;
  returnTo?: string | null | undefined;
};

function normalizeQueryValue(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveRecordHistoryDisplayName(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized) {
        return normalized;
      }
      continue;
    }

    if (typeof value === "number" || typeof value === "bigint") {
      return String(value);
    }
  }

  return null;
}

export function buildRecordHistoryReturnTo(
  pathname: string,
  searchParams?: SearchParamsLike | null,
): string {
  const normalizedPathname = pathname.trim() || "/master";
  const search = searchParams?.toString();
  const normalizedSearch = search?.trim();
  return normalizedSearch ? `${normalizedPathname}?${normalizedSearch}` : normalizedPathname;
}

export function buildRecordHistoryHref({
  screenName,
  recordPk,
  displayName,
  returnTo,
}: BuildRecordHistoryHrefParams): string | null {
  const normalizedScreenName = normalizeQueryValue(screenName);
  const normalizedRecordPk = normalizeQueryValue(recordPk);

  if (!normalizedScreenName || !normalizedRecordPk) {
    return null;
  }

  const params = new URLSearchParams({
    screen_name: normalizedScreenName,
    record_pk: normalizedRecordPk,
  });

  const normalizedDisplayName = normalizeQueryValue(displayName);
  if (normalizedDisplayName) {
    params.set("display_name", normalizedDisplayName);
  }

  const normalizedReturnTo = normalizeQueryValue(returnTo);
  if (normalizedReturnTo) {
    params.set("return_to", normalizedReturnTo);
  }

  return `/master/record-history?${params.toString()}`;
}
