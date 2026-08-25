"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/store/hooks";
import type { ReportElement } from "@/features/print-designer/types/template-definition";
import {
  elementPatched,
  type ElementPatch,
} from "@/features/print-designer/store/designerSlice";

/**
 * One dispatcher for every element property edit.
 *
 * Every section needs the same three arguments — which band, which elements,
 * what changed — and getting the element id list wrong is how a multi-selection
 * edit silently applies to one element. Centralising it means a section only
 * decides WHAT to change.
 */
export function useElementPatch(bandIndex: number | null, elementIds: readonly string[]) {
  const dispatch = useAppDispatch();

  return useCallback(
    (patch: ElementPatch, label?: string, coalesceKey?: string) => {
      if (bandIndex === null || !elementIds.length) {
        return;
      }
      dispatch(
        elementPatched({
          bandIndex,
          elementIds: [...elementIds],
          patch,
          label,
          coalesceKey,
        }),
      );
    },
    [bandIndex, dispatch, elementIds],
  );
}

/**
 * Per-element patches, for properties that must MERGE rather than replace.
 *
 * `style` and `font` are nested objects: patching the selection with one
 * object would give every element the first element's whole style. This builds
 * a patch per element from that element's own current value, so setting the
 * colour of six differently-sized elements changes six colours and nothing else.
 */
export function useElementPatchEach(bandIndex: number | null, elements: readonly ReportElement[]) {
  const dispatch = useAppDispatch();

  return useCallback(
    (build: (element: ReportElement) => ElementPatch, label?: string, coalesceKey?: string) => {
      if (bandIndex === null) {
        return;
      }
      for (const element of elements) {
        dispatch(
          elementPatched({
            bandIndex,
            elementIds: [element.id],
            patch: build(element),
            label,
            coalesceKey,
          }),
        );
      }
    },
    [bandIndex, dispatch, elements],
  );
}
