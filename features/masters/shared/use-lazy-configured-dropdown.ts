"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicSelectOption,
  ERPDynamicSearchQueryChangeHandler,
  ERPDynamicFieldValueChangeHandler,
  ERPDynamicFieldValueChangePayload,
} from "@/components/design-system/ui/dynamic-modal-form";
import { extractRows } from "@/features/masters/shared/normalizers";
import { getFirstDefinedValue, toDisplayValue } from "@/features/masters/shared/value-mappers";

// Lazy, server-side searchable configured dropdown (fixed.dropdown_details).
// Mirrors configured-grid-sql/run: GET /dropdown-details/run?dropdown_id=<n>&page=1&
// limit=20&search=<q> -> { data: { items, meta } }. dropdown_param is intentionally
// never sent (these dropdowns take no bound params). Nothing is fetched until the field
// is opened; typing re-fetches with a debounce so the server does the filtering.
export const DROPDOWN_RUN_ENDPOINT = "/dropdown-details/run";
export const DROPDOWN_SEARCH_DEBOUNCE_MS = 250;

// The select-field props an ERPDynamicModalField needs to drive a lazy dropdown.
export type LazyDropdownHandlers = {
  onSearchOpenChange: (open: boolean) => void;
  onSearchQueryChange: ERPDynamicSearchQueryChangeHandler;
  onValueChange: ERPDynamicFieldValueChangeHandler;
};

export type UseLazyConfiguredDropdownOptions = {
  // dropdown_id from fixed.dropdown_details (stringified).
  dropdownId: string;
  // Row keys that hold the option value (id) and the option label (name).
  idKeys: readonly string[];
  labelKeys: readonly string[];
  // Head option shown before/while loading and so the field can be cleared.
  // Pass a STABLE reference (module constant) to avoid re-render churn.
  defaultOption?: ERPDynamicSelectOption;
  limit?: number;
  debounceMs?: number;
};

export type UseLazyConfiguredDropdownResult = {
  options: ERPDynamicSelectOption[];
  handlers: LazyDropdownHandlers;
  // Seed the trigger with a saved <id,name> on edit/view before the field is opened
  // (and lazily loaded). Call with empty strings to reset to just the head option.
  seedSelected: (id: string, name: string) => void;
};

const EMPTY_HEAD: ERPDynamicSelectOption = { value: "", label: "" };

function buildRunQuery(dropdownId: string, search: string, limit: number): Record<string, string> {
  const query: Record<string, string> = {
    dropdown_id: dropdownId,
    page: "1",
    limit: String(limit),
  };
  const trimmed = search.trim();
  if (trimmed) {
    query.search = trimmed;
  }
  return query;
}

// Map dropdown-run rows ({ data: { items: [...] } }) to <value,label> options using the
// configured id/label columns. The head option is prepended so the field can be cleared.
function buildOptions(
  payload: unknown,
  idKeys: readonly string[],
  labelKeys: readonly string[],
  head: ERPDynamicSelectOption,
): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  for (const row of extractRows(payload)) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }
    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, idKeys));
    if (!id) {
      continue;
    }
    const label = toDisplayValue(getFirstDefinedValue(source, labelKeys));
    if (!optionMap.has(id)) {
      optionMap.set(id, label || id);
    }
  }
  const options = Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  return [head, ...options];
}

// Keep the currently-selected option visible after a fetch replaces the option list.
function withPinnedOption(
  options: ERPDynamicSelectOption[],
  pinned: ERPDynamicSelectOption | null,
): ERPDynamicSelectOption[] {
  if (!pinned || !pinned.value) {
    return options;
  }
  if (options.some((option) => option.value === pinned.value)) {
    return options;
  }
  return [...options, pinned];
}

export function useLazyConfiguredDropdown({
  dropdownId,
  idKeys,
  labelKeys,
  defaultOption,
  limit = 20,
  debounceMs = DROPDOWN_SEARCH_DEBOUNCE_MS,
}: UseLazyConfiguredDropdownOptions): UseLazyConfiguredDropdownResult {
  const head = defaultOption ?? EMPTY_HEAD;
  // Errors aren't toasted — a failed dropdown fetch shouldn't interrupt the form.
  const { run } = useApi<unknown>(DROPDOWN_RUN_ENDPOINT, { toast: { error: false } });
  const [options, setOptions] = useState<ERPDynamicSelectOption[]>([head]);
  // Mirror of the latest options + the pinned selection so the value handler can resolve
  // a picked label and the selection stays visible after a fetch replaces the list.
  const optionsRef = useRef<ERPDynamicSelectOption[]>([head]);
  const pinnedRef = useRef<ERPDynamicSelectOption | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const applyOptions = useCallback((next: ERPDynamicSelectOption[]) => {
    optionsRef.current = next;
    setOptions(next);
  }, []);
  // Fetch the dropdown's first page (open) or search results (typing). A superseded/
  // aborted request returns undefined and is skipped so it never wipes the latest list.
  const fetchOptions = useCallback(
    async (search: string) => {
      try {
        const payload = await run({ query: buildRunQuery(dropdownId, search, limit) });
        if (payload === undefined) {
          return;
        }
        applyOptions(withPinnedOption(buildOptions(payload, idKeys, labelKeys, head), pinnedRef.current));
      } catch {
        // Keep whatever options are currently shown (e.g. the seeded selection).
      }
    },
    [applyOptions, run, dropdownId, limit, idKeys, labelKeys, head],
  );
  const handlers = useMemo<LazyDropdownHandlers>(
    () => ({
      onSearchOpenChange: (open: boolean) => {
        if (timeoutRef.current != null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (open) {
          void fetchOptions("");
        }
      },
      onSearchQueryChange: (query: string) => {
        if (timeoutRef.current != null) {
          window.clearTimeout(timeoutRef.current);
        }
        const delay = query.trim() ? debounceMs : 0;
        timeoutRef.current = window.setTimeout(() => {
          timeoutRef.current = null;
          void fetchOptions(query);
        }, delay);
      },
      onValueChange: (payload: ERPDynamicFieldValueChangePayload) => {
        const option = optionsRef.current.find((item) => item.value === payload.value);
        pinnedRef.current = option && payload.value ? option : null;
      },
    }),
    [fetchOptions, debounceMs],
  );
  const seedSelected = useCallback(
    (id: string, name: string) => {
      const value = id.trim();
      if (!value) {
        pinnedRef.current = null;
        applyOptions([head]);
        return;
      }
      const option: ERPDynamicSelectOption = { value, label: name.trim() || value };
      pinnedRef.current = option;
      applyOptions([head, option]);
    },
    [applyOptions, head],
  );
  useEffect(() => {
    return () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  return { options, handlers, seedSelected };
}
