"use client";

/**
 * One element on the canvas.
 *
 * Approximate by intent. The canvas cannot reproduce the server's text
 * measurement, script shaping or barcode geometry, and a second renderer that
 * tried would drift from the first — the plan's F1. So: text is drawn with the
 * declared face and size and left to the browser, and everything the browser
 * cannot draw honestly (barcode bars, QR modules, a remote image) is a labelled
 * placeholder at the exact reserved geometry. The PDF preview is authoritative.
 *
 * Memoised on its props because a drag moves one element while 200 others hold
 * still (F3): only the dragged element receives a changing `dragDelta`.
 */

import { memo, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { ReportElement } from "@/features/print-designer/types/template-definition";
import { elementRect } from "@/features/print-designer/lib/geometry";
import { mmToPx, ptToPx } from "@/features/print-designer/lib/units";
import type { CanvasScale } from "@/features/print-designer/lib/grid";
import { substituteSampleValues, type SampleResolver } from "@/features/print-designer/lib/sample-data";
import styles from "@/features/print-designer/components/designer.module.scss";

export type ElementBoxProps = {
  element: ReportElement;
  zoom: number;
  /**
   * Millimetres per canvas unit. `{x: 1, y: 1}` in GRAPHIC mode; a character
   * cell in GRID mode, where coordinates are columns and rows.
   */
  scale: CanvasScale;
  /**
   * True when the canvas is a character grid.
   *
   * A GRID design has no point sizes — one glyph occupies one cell, and that is
   * the only thing this canvas has to get right. Typesetting a 9pt face into a
   * 1.67mm cell turns a 48-column receipt into unreadable overlap.
   */
  isGridMode: boolean;
  selected: boolean;
  /** Raw `{{ … }}` when true, sample values when false. */
  showExpressions: boolean;
  resolveSample: SampleResolver;
  /** Live gesture offset in millimetres, applied to the selected elements only. */
  dragDelta: { dx: number; dy: number } | null;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, elementId: string) => void;
};

/** A colour that is an expression cannot be resolved here; fall back to ink. */
const staticColour = (value: string | undefined, fallback: string): string =>
  value && !value.includes("{{") ? value : fallback;

function displayText(
  raw: string,
  showExpressions: boolean,
  resolveSample: SampleResolver,
): string {
  return showExpressions ? raw : substituteSampleValues(raw, resolveSample);
}

/**
 * Advance width of a monospace glyph as a fraction of its font size. 0.6 is the
 * ratio for the DejaVu/Liberation/Consolas family the CSS stack resolves to;
 * sizing by it makes one character land in one cell.
 */
const MONO_ADVANCE_RATIO = 0.6;

/**
 * The caption a measure sub-column shows in the canvas sketch.
 *
 * Falls back to the aggregate's own name rather than printing nothing: a
 * designer who has not captioned a measure yet still needs to tell the two
 * sub-columns apart on the canvas, and "sum" beside "count" does that.
 */
function measureCaptionOf(
  element: Extract<ReportElement, { kind: "CROSSTAB" }>,
  index: number,
): string {
  if (index === 0) {
    return element.measureLabel || element.fn;
  }
  const measure = element.extraMeasures?.[index - 1];
  return measure ? measure.label || measure.fn : "\u00a0";
}

function ElementBoxComponent({
  element,
  zoom,
  scale,
  isGridMode,
  selected,
  showExpressions,
  resolveSample,
  dragDelta,
  onPointerDown,
}: ElementBoxProps) {
  const rect = elementRect(element);
  const offsetX = dragDelta?.dx ?? 0;
  const offsetY = dragDelta?.dy ?? 0;

  const toPxX = (units: number) => mmToPx(units * scale.x, zoom);
  const toPxY = (units: number) => mmToPx(units * scale.y, zoom);

  const frame: CSSProperties = {
    left: toPxX(rect.x + offsetX),
    top: toPxY(rect.y + offsetY),
    width: toPxX(rect.w),
    height: toPxY(rect.h),
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onPointerDown(event, element.id);
  };

  const className = [
    styles.element,
    selected ? styles.elementSelected : "",
    element.visible ? styles.elementHidden : "",
  ]
    .filter(Boolean)
    .join(" ");

  const common = {
    onPointerDown: handlePointerDown,
    "data-element-id": element.id,
    title: element.visible ? `${element.id} — conditional: ${element.visible}` : element.id,
  } as const;

  switch (element.kind) {
    case "TEXT":
    case "FIELD": {
      const font = element.font ?? {};
      const cellPx = toPxX(1);
      const style: CSSProperties = {
        ...frame,
        display: "flex",
        justifyContent:
          element.align === "center" ? "center" : element.align === "right" ? "flex-end" : "flex-start",
        alignItems:
          element.vAlign === "middle" ? "center" : element.vAlign === "bottom" ? "flex-end" : "flex-start",
        padding: !isGridMode && element.style?.padding ? mmToPx(element.style.padding, zoom) : 0,
        fontFamily: isGridMode || font.family === "NotoSansMono" ? "var(--pd-mono)" : "inherit",
        fontSize: isGridMode ? cellPx / MONO_ADVANCE_RATIO : ptToPx(font.size ?? 9, zoom),
        fontWeight: font.bold ? 700 : 400,
        fontStyle: font.italic ? "italic" : "normal",
        textDecoration: font.underline ? "underline" : "none",
        color: staticColour(element.style?.color, "#17222e"),
        background: staticColour(element.style?.fill, "transparent"),
        lineHeight: isGridMode ? `${toPxY(1)}px` : 1.15,
        textAlign: element.align,
      };
      return (
        <div
          {...common}
          className={`${className} ${element.wrap ? styles.elementWrap : ""}`}
          style={style}
        >
          {displayText(element.value, showExpressions, resolveSample) || " "}
        </div>
      );
    }

    case "LINE": {
      if (isGridMode) {
        // A GRID rule is not a hairline, it is a row of repeated characters —
        // '=' or '-' — and showing it as one is the difference between a
        // receipt that looks like its printout and one that does not.
        const columns = Math.max(1, Math.round(rect.w) + 1);
        return (
          <div
            {...common}
            className={className}
            style={{
              ...frame,
              width: toPxX(columns),
              height: toPxY(1),
              fontFamily: "var(--pd-mono)",
              fontSize: toPxX(1) / MONO_ADVANCE_RATIO,
              lineHeight: `${toPxY(1)}px`,
              color: staticColour(element.style?.stroke ?? element.style?.color, "#17222e"),
            }}
          >
            {(element.gridChar || "-").repeat(columns)}
          </div>
        );
      }
      // Stored as two endpoints; drawn as a thin box so a horizontal rule at
      // 0.5pt is still visible at 50% zoom.
      const horizontal = Math.abs(element.y2 - element.y1) <= Math.abs(element.x2 - element.x1);
      const thickness = Math.max(1, ptToPx(element.widthPt || 0.5, zoom));
      return (
        <div
          {...common}
          className={`${styles.element} ${selected ? styles.elementSelected : ""}`}
          style={{
            left: toPxX(rect.x + offsetX),
            top: toPxY(rect.y + offsetY),
            width: horizontal ? Math.max(toPxX(rect.w), 1) : thickness,
            height: horizontal ? thickness : Math.max(toPxY(rect.h), 1),
            background: staticColour(element.style?.stroke ?? element.style?.color, "#17222e"),
          }}
        />
      );
    }

    case "RECT":
      return (
        <div
          {...common}
          className={className}
          style={{
            ...frame,
            background: staticColour(element.style?.fill, "transparent"),
            border: `${Math.max(1, ptToPx(element.style?.strokeWidthPt ?? 0.5, zoom))}px solid ${staticColour(
              element.style?.stroke,
              "#17222e",
            )}`,
            borderRadius: isGridMode ? 0 : mmToPx(element.radiusMm, zoom),
          }}
        />
      );

    case "IMAGE":
      return (
        <div {...common} className={`${className} ${styles.elementPlaceholder}`} style={frame}>
          {`IMAGE ${element.fit.toLowerCase()}`}
        </div>
      );

    case "BARCODE":
      return (
        <div {...common} className={`${className} ${styles.elementPlaceholder}`} style={frame}>
          {`${element.symbology.toUpperCase()}${element.showText ? " + text" : ""}`}
        </div>
      );

    case "QRCODE":
      return (
        <div {...common} className={`${className} ${styles.elementPlaceholder}`} style={frame}>
          {`QR ${element.errorCorrection}`}
        </div>
      );

    case "CROSSTAB": {
      // A SKETCH, not a preview. The real table's column count and height come
      // from the data, so drawing three sample column groups at the declared
      // row pitch is the most honest thing the canvas can do: it shows where
      // the table starts, how wide it is and how tall one row is, and says
      // plainly that the rest is decided at render.
      //
      // What it does draw truthfully is the SHAPE the designer chose: one
      // header row per column level (plus one for the measure captions), and
      // one label column per row level. Those are the two things a nested
      // crosstab changes about the geometry, and the two the designer has to
      // be able to see before a render.
      const columnLevels = 1 + (element.extraColumnBys?.length ?? 0);
      const measures = 1 + (element.extraMeasures?.length ?? 0);
      const rowLevels = 1 + (element.extraRowBys?.length ?? 0);
      const headerRows = columnLevels + (measures > 1 ? 1 : 0);

      const headerPx = Math.max(toPxY(element.headerHeightMm), 6);
      const rowPx = Math.max(toPxY(element.rowHeightMm), 5);
      const labelPx = toPxX(Math.min(element.rowHeaderWidthMm, rect.w));
      const bodyPx = Math.max(0, toPxX(rect.w) - labelPx);
      const sampleLeaves = element.showRowTotals ? 4 : 3;
      const sampleColumns = sampleLeaves * measures;
      const columnPx = bodyPx / sampleColumns;
      const rowsThatFit = Math.max(
        1,
        Math.floor((toPxY(rect.h) - headerPx * headerRows) / rowPx),
      );
      const isTotals = (leaf: number) => element.showRowTotals && leaf === sampleLeaves - 1;

      return (
        <div
          {...common}
          className={`${className} ${styles.elementCrosstab}`}
          style={{
            ...frame,
            border: `1px solid ${staticColour(element.style?.stroke, "#17222e")}`,
            color: staticColour(element.style?.color, "#17222e"),
            fontSize: ptToPx(element.font?.size ?? 8, zoom),
          }}
        >
          {Array.from({ length: columnLevels }, (_unused, level) => (
            <div
              key={`level-${level}`}
              className={styles.crosstabHeader}
              style={{
                height: headerPx,
                background: staticColour(element.headerFill, "rgba(23,34,46,0.08)"),
              }}
            >
              <span style={{ width: labelPx }}>
                {/* The corner caption belongs above the labels it names, which
                    is the BOTTOM header row. */}
                {level === headerRows - 1
                  ? displayText(element.corner, showExpressions, resolveSample) || "\u00a0"
                  : "\u00a0"}
              </span>
              {Array.from({ length: sampleLeaves }, (_column, leaf) => (
                <span
                  key={leaf}
                  style={{ width: columnPx * measures }}
                  className={styles.crosstabColumnHead}
                >
                  {isTotals(leaf) ? (level === 0 ? element.totalsLabel : "\u00a0") : "\u2026"}
                </span>
              ))}
            </div>
          ))}
          {measures > 1 ? (
            <div
              className={styles.crosstabHeader}
              style={{
                height: headerPx,
                background: staticColour(element.headerFill, "rgba(23,34,46,0.08)"),
              }}
            >
              <span style={{ width: labelPx }}>
                {displayText(element.corner, showExpressions, resolveSample) || "\u00a0"}
              </span>
              {Array.from({ length: sampleColumns }, (_column, index) => (
                <span key={index} style={{ width: columnPx }} className={styles.crosstabColumnHead}>
                  {measureCaptionOf(element, index % measures)}
                </span>
              ))}
            </div>
          ) : null}
          {Array.from({ length: Math.min(rowsThatFit, 12) }, (_unused, index) => (
            <div key={index} className={styles.crosstabRow} style={{ height: rowPx }}>
              {Array.from({ length: rowLevels }, (_column, level) => (
                <span
                  key={level}
                  style={{ width: labelPx / rowLevels }}
                  className={styles.crosstabRowHead}
                >
                  {index === 0
                    ? displayText(
                        level === 0
                          ? element.rowBy
                          : (element.extraRowBys?.[level - 1]?.expression ?? ""),
                        showExpressions,
                        resolveSample,
                      )
                    : "\u00a0"}
                </span>
              ))}
              {Array.from({ length: sampleColumns }, (_column, column) => (
                <span key={column} style={{ width: columnPx }}>
                  {index === 0 && column === 0
                    ? displayText(element.measure, showExpressions, resolveSample)
                    : "\u00a0"}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    }

    case "PAGEBREAK":
      return (
        <div
          {...common}
          className={`${className} ${styles.elementPagebreak}`}
          style={{ ...frame, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {element.when ? "BREAK IF" : "PAGE BREAK"}
        </div>
      );
  }
}

export const ElementBox = memo(ElementBoxComponent);

export default ElementBox;
