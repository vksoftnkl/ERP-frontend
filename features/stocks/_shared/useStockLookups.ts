"use client";

import { useCallback, useRef, useState } from "react";
import type { ERPDynamicSelectOption } from "@/components/design-system/ui";
import {
  useLazyGetItemOptionsQuery,
  useLazyGetUnitOptionsQuery,
  useLazyGetItemPriceDetailsQuery,
  useLazyGetItemPriceDetailsByBarcodeQuery,
  type ItemPriceDetailsPayload,
} from "@/store/api/lookupsApi";
import { useApi } from "@/hooks/useApi";
import {
  DEFAULT_ITEM_OPTION,
  DEFAULT_GODOWN_OPTION,
  GODOWN_LIST_ENDPOINT,
  GODOWN_LOOKUP_QUERY,
  LOOKUP_SEARCH_DEBOUNCE_MS,
} from "./constants";
import type { LookupKind } from "./types";
import { buildGodownLookupOptions } from "./stock-utils";

type UseStockLookupsOptions = {
  branchId?: string | null;
};

/**
 * Centralises all stock-page lookup loading:
 * item options, godown options, unit options, item price details, barcode lookup.
 *
 * Both opening-stock and physical-stock share the same API calls and debounce
 * pattern — this hook extracts that into one place.
 */
export function useStockLookups({ branchId }: UseStockLookupsOptions = {}) {
  const [itemOptions, setItemOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_ITEM_OPTION]);
  const [godownOptions, setGodownOptions] = useState<ERPDynamicSelectOption[]>([DEFAULT_GODOWN_OPTION]);
  const [unitOptions, setUnitOptions] = useState<ERPDynamicSelectOption[]>([]);

  const itemSearchTimeoutRef = useRef<number | null>(null);
  const godownSearchTimeoutRef = useRef<number | null>(null);
  const batchSearchTimeoutRef = useRef<number | null>(null);
  const reasonSearchTimeoutRef = useRef<number | null>(null);

  const [triggerItemOptions, { isFetching: isItemLookupLoading }] = useLazyGetItemOptionsQuery();
  const [triggerUnitOptions] = useLazyGetUnitOptionsQuery();
  const [triggerItemPriceDetails] = useLazyGetItemPriceDetailsQuery();
  const [triggerItemPriceDetailsByBarcode] = useLazyGetItemPriceDetailsByBarcodeQuery();

  const { run: listGodowns, loading: isGodownLookupLoading } = useApi<unknown>(
    GODOWN_LIST_ENDPOINT,
    { toast: { success: false, error: false } },
  );

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadItemOptions = useCallback(
    async (search = "") => {
      const normalized = search.trim();
      const nextOptions = await triggerItemOptions(
        normalized ? { search: normalized } : undefined,
        true,
      ).unwrap();
      setItemOptions(nextOptions);
    },
    [triggerItemOptions],
  );

  const loadGodownOptions = useCallback(
    async (search = "") => {
      const normalized = search.trim();
      const payload = await listGodowns({
        query: {
          ...GODOWN_LOOKUP_QUERY,
          ...(normalized ? { search: normalized } : {}),
        },
      });
      setGodownOptions(buildGodownLookupOptions(payload, branchId));
    },
    [branchId, listGodowns],
  );

  const loadUnitOptions = useCallback(async () => {
    try {
      const options = await triggerUnitOptions(undefined, true).unwrap();
      setUnitOptions(options);
    } catch {
      setUnitOptions([]);
    }
  }, [triggerUnitOptions]);

  const loadItemDetails = useCallback(
    async (itemId: string): Promise<ItemPriceDetailsPayload | null> => {
      try {
        return await triggerItemPriceDetails({ itemId }, true).unwrap();
      } catch {
        return null;
      }
    },
    [triggerItemPriceDetails],
  );

  const loadItemDetailsByBarcode = useCallback(
    async (barcode: string): Promise<ItemPriceDetailsPayload | null> => {
      const normalized = barcode.trim();
      if (!normalized) return null;
      try {
        return await triggerItemPriceDetailsByBarcode({ barcode: normalized }, true).unwrap();
      } catch {
        return null;
      }
    },
    [triggerItemPriceDetailsByBarcode],
  );

  // ── Debounced search dispatcher ────────────────────────────────────────────

  const handleLookupSearchChange = useCallback(
    (
      lookupKind: LookupKind,
      search: string,
      extras?: {
        onBatchSearch?: (search: string) => void;
        onReasonSearch?: (search: string) => void;
      },
    ) => {
      const timeoutRef =
        lookupKind === "item"
          ? itemSearchTimeoutRef
          : lookupKind === "batch"
            ? batchSearchTimeoutRef
            : lookupKind === "reason"
              ? reasonSearchTimeoutRef
              : godownSearchTimeoutRef;

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        if (lookupKind === "item") {
          void loadItemOptions(search);
        } else if (lookupKind === "batch") {
          extras?.onBatchSearch?.(search);
        } else if (lookupKind === "reason") {
          extras?.onReasonSearch?.(search);
        } else {
          void loadGodownOptions(search);
        }
      }, LOOKUP_SEARCH_DEBOUNCE_MS);
    },
    [loadGodownOptions, loadItemOptions],
  );

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const clearSearchTimeouts = useCallback(() => {
    if (itemSearchTimeoutRef.current !== null) window.clearTimeout(itemSearchTimeoutRef.current);
    if (godownSearchTimeoutRef.current !== null) window.clearTimeout(godownSearchTimeoutRef.current);
    if (batchSearchTimeoutRef.current !== null) window.clearTimeout(batchSearchTimeoutRef.current);
    if (reasonSearchTimeoutRef.current !== null) window.clearTimeout(reasonSearchTimeoutRef.current);
  }, []);

  return {
    // State
    itemOptions,
    godownOptions,
    unitOptions,
    setItemOptions,
    setGodownOptions,
    setUnitOptions,
    // Loading flags
    isItemLookupLoading,
    isGodownLookupLoading,
    // Loaders
    loadItemOptions,
    loadGodownOptions,
    loadUnitOptions,
    loadItemDetails,
    loadItemDetailsByBarcode,
    // Debounced search
    handleLookupSearchChange,
    // Cleanup
    clearSearchTimeouts,
  };
}
