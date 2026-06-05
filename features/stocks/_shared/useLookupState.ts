"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LookupCellState, LookupKind } from "./types";

/**
 * Manages the open/close state of a single lookup cell dropdown.
 *
 * Both opening-stock and physical-stock share this exact pattern:
 * - One lookup cell open at a time
 * - A shared search query string
 * - Click-outside to close
 * - Refs for each cell's root element
 */
export function useLookupState() {
  const [openLookupCell, setOpenLookupCell] = useState<LookupCellState | null>(null);
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");
  const lookupRootRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // ── Click-outside to close ─────────────────────────────────────────────────

  useEffect(() => {
    if (!openLookupCell) return;

    const handlePointerDown = (event: MouseEvent) => {
      const activeRoot = lookupRootRefs.current[openLookupCell.key];
      if (activeRoot?.contains(event.target as Node)) return;
      setOpenLookupCell(null);
      setLookupSearchQuery("");
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [openLookupCell]);

  // ── Toggle ─────────────────────────────────────────────────────────────────

  const handleLookupToggle = useCallback(
    (
      cellKey: string,
      lookupKind: LookupKind,
      onOpen?: () => void,
    ) => {
      const isClosing = openLookupCell?.key === cellKey;
      setOpenLookupCell(isClosing ? null : { key: cellKey, kind: lookupKind });
      setLookupSearchQuery("");
      if (!isClosing) {
        onOpen?.();
      }
    },
    [openLookupCell?.key],
  );

  const closeLookup = useCallback(() => {
    setOpenLookupCell(null);
    setLookupSearchQuery("");
  }, []);

  return {
    openLookupCell,
    setOpenLookupCell,
    lookupSearchQuery,
    setLookupSearchQuery,
    lookupRootRefs,
    handleLookupToggle,
    closeLookup,
  };
}
