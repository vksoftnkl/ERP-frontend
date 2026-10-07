"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyTheme,
  clearTheme,
  readCachedTheme,
  type EffectiveAppTheme,
  type ThemeTokens,
} from "@/lib/app-theme";

/**
 * Preview (F9): the edited colours on the WHOLE running app, nothing saved —
 * the same `<html>` variables `AppThemeController` paints, written without
 * remembering them, so a reload never keeps a preview.
 *
 * Ending it puts the company's own look back: the `/effective` answer the
 * shell already holds, else this browser's remembered copy, else the compiled
 * colours. Leaving the screen ends it too.
 */
export function useThemePreview(companyId: string | null, effective: EffectiveAppTheme | null | undefined) {
  const [previewing, setPreviewing] = useState(false);
  // The ref is the truth: preview() and endPreview() can run in one tick.
  const previewingRef = useRef(false);
  const restoreRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    restoreRef.current = () => {
      const tokens = effective?.tokens ?? (companyId ? readCachedTheme(companyId)?.tokens : null);
      if (tokens) applyTheme(tokens);
      else clearTheme();
    };
  }, [companyId, effective]);

  const preview = useCallback((tokens: ThemeTokens) => {
    applyTheme(tokens);
    previewingRef.current = true;
    setPreviewing(true);
  }, []);

  const endPreview = useCallback(() => {
    if (!previewingRef.current) return;
    previewingRef.current = false;
    restoreRef.current();
    setPreviewing(false);
  }, []);

  useEffect(
    () => () => {
      if (previewingRef.current) restoreRef.current();
    },
    [],
  );

  return { previewing, preview, endPreview };
}
