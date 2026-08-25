"use client";

/**
 * The report structure tree.
 *
 * The canvas is the good way to find an element you can see. This is the way to
 * find one you cannot: an element behind another, one scrolled out of view, one
 * in a collapsed band, or a 6mm-wide field in a 40-element summary. It also
 * makes the document's shape legible at a glance — which bands exist, in what
 * order, over which dataset.
 *
 * Selection is shared with the canvas in both directions, so clicking a row here
 * is exactly the same act as clicking the element on the page.
 */

import { useMemo, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { ElementKind } from "@/features/print-designer/types/template-definition";
import { BAND_LABELS } from "@/features/print-designer/lib/vocabulary";
import { selectBand, selectElement } from "@/features/print-designer/store/designerSlice";
import {
  selectLayoutMode,
  selectOrderedBands,
  selectSelection,
} from "@/features/print-designer/store/selectors";
import styles from "@/features/print-designer/components/designer.module.scss";

const KIND_ICON: Record<ElementKind, string> = {
  TEXT: "T",
  FIELD: "{}",
  LINE: "—",
  RECT: "▭",
  IMAGE: "◧",
  BARCODE: "|||",
  QRCODE: "▦",
  PAGEBREAK: "⤓",
};

export function ReportTree() {
  const dispatch = useAppDispatch();
  const bands = useAppSelector(selectOrderedBands);
  const selection = useAppSelector(selectSelection);
  const layoutMode = useAppSelector(selectLayoutMode);

  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(new Set());

  const isGridMode = layoutMode === "GRID";
  const selectedBandIndex = selection.bandIndex;
  const selectedIds = useMemo(() => new Set(selection.elementIds), [selection.elementIds]);

  // Selecting on the canvas must reveal the row, or the tree contradicts it.
  // Done during render rather than in an effect so the row is never painted
  // hidden for a frame; `lastRevealed` keeps it to the transition, so a user who
  // deliberately collapses the band they are working in stays collapsed.
  const [lastRevealed, setLastRevealed] = useState<number | null>(null);
  if (
    selectedBandIndex !== null &&
    selectedIds.size > 0 &&
    selectedBandIndex !== lastRevealed
  ) {
    setLastRevealed(selectedBandIndex);
    if (collapsed.has(selectedBandIndex)) {
      const next = new Set(collapsed);
      next.delete(selectedBandIndex);
      setCollapsed(next);
    }
  }

  const toggle = (bandIndex: number) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(bandIndex)) {
        next.delete(bandIndex);
      } else {
        next.add(bandIndex);
      }
      return next;
    });
  };

  return (
    <div className={styles.tree}>
      <button
        type="button"
        className={`${styles.treeRow} ${
          selectedBandIndex === null ? styles.treeRowSelected : ""
        }`}
        onClick={() => dispatch(selectBand(null))}
        title="Page setup"
      >
        <span className={styles.treeTwisty}>▾</span>
        <span className={styles.treeIcon}>▤</span>
        <span>Report</span>
        <span className={styles.treeMeta}>{layoutMode.toLowerCase()}</span>
      </button>

      {bands.map((entry) => {
        const isCollapsed = collapsed.has(entry.index);
        const bandSelected = selectedBandIndex === entry.index && selectedIds.size === 0;
        const size = isGridMode
          ? `${entry.band.heightRows ?? 1}r`
          : `${entry.band.heightMm}mm`;

        return (
          <div key={`${entry.band.type}-${entry.index}`}>
            <button
              type="button"
              className={`${styles.treeRow} ${styles.treeRowChild} ${
                bandSelected ? styles.treeRowSelected : ""
              }`}
              style={{ paddingLeft: 14 }}
              onClick={() => dispatch(selectBand(entry.index))}
              onDoubleClick={() => toggle(entry.index)}
              title={entry.band.dataset ? `over ${entry.band.dataset}` : undefined}
            >
              <span
                className={styles.treeTwisty}
                role="presentation"
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(entry.index);
                }}
              >
                {entry.band.elements.length ? (isCollapsed ? "▸" : "▾") : ""}
              </span>
              <span className={styles.treeIcon}>▬</span>
              <span>{BAND_LABELS[entry.band.type]}</span>
              <span className={styles.treeMeta}>
                {entry.band.dataset ? `${entry.band.dataset} · ${size}` : size}
              </span>
            </button>

            {isCollapsed
              ? null
              : entry.band.elements.map((element) => (
                  <button
                    key={element.id}
                    type="button"
                    className={`${styles.treeRow} ${styles.treeRowChild} ${
                      selectedBandIndex === entry.index && selectedIds.has(element.id)
                        ? styles.treeRowSelected
                        : ""
                    }`}
                    style={{ paddingLeft: 34 }}
                    onClick={(event) =>
                      dispatch(
                        selectElement({
                          bandIndex: entry.index,
                          elementId: element.id,
                          additive: event.ctrlKey || event.metaKey || event.shiftKey,
                        }),
                      )
                    }
                    title={element.id}
                  >
                    <span className={styles.treeIcon}>{KIND_ICON[element.kind]}</span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {element.id}
                    </span>
                    {element.visible ? <span className={styles.treeMeta}>cond</span> : null}
                  </button>
                ))}
          </div>
        );
      })}
    </div>
  );
}

export default ReportTree;
