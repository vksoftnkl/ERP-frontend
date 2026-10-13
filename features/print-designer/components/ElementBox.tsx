"use client";

/**
 * One element on the canvas.
 *
 * Approximate by intent. The canvas cannot reproduce the server's text
 * measurement, script shaping or barcode geometry, and a second renderer that
 * tried would drift from the first — the plan's F1. So: text is drawn with the
 * declared face and size and left to the browser, and everything the browser
 * cannot draw honestly (barcode bars, QR modules, a remote image, a chart's
 * real data) is a labelled placeholder or a sketch at the exact reserved
 * geometry. The PDF preview is authoritative.
 *
 * What the canvas DOES draw faithfully is everything a designer sets by hand:
 * frames and their line styles, fills, bold/italic/underline/strikeout,
 * justification, rotation, inline markup, line styles and arrowheads, and the
 * shape a RECT is. Those are the things a user checks by eye before printing.
 *
 * Memoised on its props because a drag moves one element while 200 others hold
 * still (F3): only the dragged element receives a changing `dragDelta`.
 */

import {
  memo,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  canHaveBorder,
  type ChartElement,
  type LineStyle,
  type ReportElement,
} from "@/features/print-designer/types/template-definition";
import { elementRect } from "@/features/print-designer/lib/geometry";
import { mmToPx, ptToPx } from "@/features/print-designer/lib/units";
import type { CanvasScale } from "@/features/print-designer/lib/grid";
import { substituteSampleValues, type SampleResolver } from "@/features/print-designer/lib/sample-data";
import { parseMarkup, SHIFT_SCALE } from "@/features/print-designer/lib/markup";
import {
  CHART_PALETTE,
  LINE_STYLE_CSS,
  LINE_STYLE_DASH,
} from "@/features/print-designer/lib/vocabulary";
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
  /**
   * True when the band lays out by flow. The canvas still draws design
   * positions -- it has no data to flow with -- so FLOAT is only marked.
   */
  inFlowBand: boolean;
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

/** A CSS border for one line style. Double needs three pixels to show at all. */
function cssBorder(style: LineStyle | undefined, widthPt: number, colour: string, zoom: number): string {
  const lineStyle = style ?? "SOLID";
  const width = Math.max(lineStyle === "DOUBLE" ? 3 : 1, ptToPx(widthPt, zoom));
  return `${width}px ${LINE_STYLE_CSS[lineStyle]} ${colour}`;
}

/** An SVG dash array for one line style, in pixels. */
function svgDash(style: LineStyle | undefined, widthPx: number): string | undefined {
  const pattern = LINE_STYLE_DASH[style ?? "SOLID"];
  if (!pattern.length) {
    return undefined;
  }
  const unit = Math.max(widthPx, 1);
  return pattern.map((step) => step * unit).join(" ");
}

/**
 * The element's frame, as an overlay on its box. An overlay rather than the
 * box's own border, so a RECT keeps its stroke and the frame sits on top of
 * whatever the element draws -- which is the order the engine prints them.
 */
function FrameOverlay({
  element,
  zoom,
  isGridMode,
}: {
  element: ReportElement;
  zoom: number;
  isGridMode: boolean;
}) {
  const border = element.border;
  if (!border || isGridMode || !canHaveBorder(element)) {
    return null;
  }
  if (!border.top && !border.right && !border.bottom && !border.left) {
    return null;
  }
  const spec = cssBorder(border.style, border.widthPt, staticColour(border.color, "#000000"), zoom);
  return (
    <span
      className={styles.elementFrame}
      style={{
        borderTop: border.top ? spec : undefined,
        borderRight: border.right ? spec : undefined,
        borderBottom: border.bottom ? spec : undefined,
        borderLeft: border.left ? spec : undefined,
      }}
    />
  );
}

/**
 * Inline markup, styled run by run from the same parse the server does. The
 * sample values are substituted per segment, AFTER parsing, so a sample name
 * containing "<" is shown as typed -- as the engine prints it.
 */
function MarkupText({
  template,
  showExpressions,
  resolveSample,
  zoom,
}: {
  template: string;
  showExpressions: boolean;
  resolveSample: SampleResolver;
  zoom: number;
}) {
  const segments = useMemo(() => parseMarkup(template), [template]);
  return (
    <>
      {segments.map((segment, index) => {
        const { style } = segment;
        const decorations = [style.underline ? "underline" : "", style.strikeout ? "line-through" : ""]
          .filter(Boolean)
          .join(" ");
        const css: CSSProperties = {
          fontWeight: style.bold === undefined ? undefined : style.bold ? 700 : 400,
          fontStyle: style.italic === undefined ? undefined : style.italic ? "italic" : "normal",
          textDecoration: decorations || undefined,
          color: style.color,
          fontSize: style.sizePt
            ? ptToPx(style.sizePt * (style.shift ? SHIFT_SCALE : 1), zoom)
            : style.shift
              ? `${SHIFT_SCALE}em`
              : undefined,
          verticalAlign: style.shift === "sup" ? "super" : style.shift === "sub" ? "sub" : undefined,
        };
        return (
          <span key={index} style={css}>
            {displayText(segment.template, showExpressions, resolveSample)}
          </span>
        );
      })}
    </>
  );
}

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
  return measure ? measure.label || measure.fn : " ";
}

/** Fixed sample values so the sketch is stable from render to render. */
const SKETCH_VALUES = [
  [3, 5, 2, 4],
  [2, 3, 4, 3],
  [1, 2, 2, 3],
  [4, 1, 3, 2],
];

/**
 * A chart SKETCH: the real categories and values come from the data at render
 * time, so the canvas draws four sample categories in the chart's own type,
 * series colours, title and legend placement. The PDF preview shows the chart.
 */
function ChartSketch({
  element,
  widthPx,
  heightPx,
  zoom,
  title,
}: {
  element: ChartElement;
  widthPx: number;
  heightPx: number;
  zoom: number;
  title: string;
}) {
  const colourOf = (index: number) =>
    staticColour(element.series[index]?.color, CHART_PALETTE[index % CHART_PALETTE.length]);
  const fontPx = Math.max(6, ptToPx(element.font?.size ?? 7, zoom));
  const titlePx = Math.max(7, ptToPx(element.titleFont?.size ?? 10, zoom));
  const pad = 4;
  const isPie = element.chartType === "PIE";
  const legendEntries = isPie
    ? ["A", "B", "C", "D"].map((label, index) => ({ label, colour: CHART_PALETTE[index] }))
    : element.series.map((series, index) => ({
        label: series.name || `Series ${index + 1}`,
        colour: colourOf(index),
      }));

  let top = pad + (title ? titlePx + 2 : 0);
  let bottom = heightPx - pad;
  let left = pad;
  let right = widthPx - pad;
  const legendHeight = fontPx + 4;
  const legendWidth = Math.min(widthPx * 0.35, 70);
  if (element.showLegend) {
    if (element.legendPosition === "BOTTOM") bottom -= legendHeight;
    else if (element.legendPosition === "TOP") top += legendHeight;
    else if (element.legendPosition === "LEFT") left += legendWidth;
    else right -= legendWidth;
  }
  const plotW = Math.max(1, right - left);
  const plotH = Math.max(1, bottom - top);

  const plot: ReactNode[] = [];
  if (isPie) {
    const values = SKETCH_VALUES[0];
    const total = values.reduce((sum, value) => sum + value, 0);
    const radius = Math.max(2, Math.min(plotW, plotH) / 2 - 1);
    const inner = radius * (element.holeSizePct / 100);
    const cx = left + plotW / 2;
    const cy = top + plotH / 2;
    let angle = 0;
    values.forEach((value, index) => {
      const sweep = (value / total) * Math.PI * 2;
      const point = (r: number, a: number) => `${cx + r * Math.sin(a)} ${cy - r * Math.cos(a)}`;
      const large = sweep > Math.PI ? 1 : 0;
      const d = inner > 0
        ? `M ${point(radius, angle)} A ${radius} ${radius} 0 ${large} 1 ${point(radius, angle + sweep)} L ${point(inner, angle + sweep)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, angle)} Z`
        : `M ${cx} ${cy} L ${point(radius, angle)} A ${radius} ${radius} 0 ${large} 1 ${point(radius, angle + sweep)} Z`;
      plot.push(<path key={index} d={d} fill={CHART_PALETTE[index]} stroke="#ffffff" strokeWidth={1} />);
      angle += sweep;
    });
  } else {
    const series = element.series.length ? element.series : [{ name: "", value: "" }];
    const max = element.chartType === "STACKED_BAR"
      ? Math.max(...[0, 1, 2, 3].map((category) =>
          series.reduce((sum, _s, seriesIndex) => sum + SKETCH_VALUES[seriesIndex % 4][category], 0),
        ))
      : 5;
    const slot = plotW / 4;
    const yOf = (value: number) => bottom - (value / max) * plotH;
    if (element.showGrid) {
      for (let tick = 1; tick <= 4; tick += 1) {
        const y = bottom - (tick / 4) * plotH;
        plot.push(<line key={`grid-${tick}`} x1={left} x2={right} y1={y} y2={y} stroke="#d0d0d0" strokeWidth={0.5} />);
      }
    }
    if (element.chartType === "LINE") {
      series.forEach((_series, seriesIndex) => {
        const values = SKETCH_VALUES[seriesIndex % 4];
        const points = values.map((value, category) => `${left + (category + 0.5) * slot},${yOf(value)}`);
        plot.push(
          <polyline key={`line-${seriesIndex}`} points={points.join(" ")} fill="none" stroke={colourOf(seriesIndex)} strokeWidth={1.5} />,
        );
      });
    } else if (element.chartType === "STACKED_BAR") {
      [0, 1, 2, 3].forEach((category) => {
        let base = 0;
        series.forEach((_series, seriesIndex) => {
          const value = SKETCH_VALUES[seriesIndex % 4][category];
          const y1 = yOf(base);
          const y2 = yOf(base + value);
          plot.push(
            <rect key={`stack-${category}-${seriesIndex}`} x={left + category * slot + slot * 0.2} y={y2} width={slot * 0.6} height={Math.max(0, y1 - y2)} fill={colourOf(seriesIndex)} />,
          );
          base += value;
        });
      });
    } else {
      const group = slot * 0.75;
      const barW = group / series.length;
      series.forEach((_series, seriesIndex) => {
        SKETCH_VALUES[seriesIndex % 4].forEach((value, category) => {
          const y = yOf(value);
          plot.push(
            <rect key={`bar-${category}-${seriesIndex}`} x={left + category * slot + (slot - group) / 2 + seriesIndex * barW} y={y} width={barW * 0.92} height={Math.max(0, bottom - y)} fill={colourOf(seriesIndex)} />,
          );
        });
      });
    }
    plot.push(<line key="axis-x" x1={left} x2={right} y1={bottom} y2={bottom} stroke="#404040" strokeWidth={0.75} />);
    plot.push(<line key="axis-y" x1={left} x2={left} y1={top} y2={bottom} stroke="#404040" strokeWidth={0.75} />);
  }

  const legend: ReactNode[] = [];
  if (element.showLegend) {
    const horizontal = element.legendPosition === "BOTTOM" || element.legendPosition === "TOP";
    let x = horizontal ? pad : element.legendPosition === "LEFT" ? pad : widthPx - pad - legendWidth;
    let y = element.legendPosition === "BOTTOM" ? heightPx - pad - legendHeight + 2 : element.legendPosition === "TOP" ? top - legendHeight : top;
    legendEntries.forEach((entry, index) => {
      legend.push(
        <g key={`legend-${index}`}>
          <rect x={x} y={y + 1} width={fontPx * 0.8} height={fontPx * 0.8} fill={entry.colour} />
          <text x={x + fontPx} y={y + fontPx * 0.85} fontSize={fontPx} fill={staticColour(element.legendColor, "#000000")}>
            {entry.label}
          </text>
        </g>,
      );
      if (horizontal) {
        x += fontPx * (entry.label.length * 0.6 + 2.5);
      } else {
        y += fontPx + 2;
      }
    });
  }

  return (
    <svg width={widthPx} height={heightPx} className={styles.elementSvg}>
      {element.background ? (
        <rect width={widthPx} height={heightPx} fill={staticColour(element.background, "transparent")} />
      ) : null}
      {title ? (
        <text x={widthPx / 2} y={pad + titlePx * 0.85} fontSize={titlePx} fontWeight={700} textAnchor="middle" fill={staticColour(element.titleColor, "#000000")}>
          {title}
        </text>
      ) : null}
      {plot}
      {legend}
    </svg>
  );
}

function ElementBoxComponent({
  element,
  zoom,
  scale,
  isGridMode,
  inFlowBand,
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

  const floats = inFlowBand && element.positionType === "FLOAT";
  const closesUp = inFlowBand && element.removeLineWhenBlank === true;

  const className = [
    styles.element,
    selected ? styles.elementSelected : "",
    element.visible ? styles.elementHidden : "",
    floats ? styles.elementFloat : "",
  ]
    .filter(Boolean)
    .join(" ");

  const common = {
    onPointerDown: handlePointerDown,
    "data-element-id": element.id,
    title: [
      element.id,
      element.group ? `in ${element.group}` : "",
      element.visible ? `conditional: ${element.visible}` : "",
      floats ? "floats" : "",
      closesUp ? "removes its line when blank" : "",
      element.stretchWithBand ? "stretches with its band" : "",
    ]
      .filter(Boolean)
      .join(" — "),
  } as const;

  const frameOverlay = <FrameOverlay element={element} zoom={zoom} isGridMode={isGridMode} />;

  switch (element.kind) {
    case "TEXT":
    case "FIELD": {
      const font = element.font ?? {};
      const cellPx = toPxX(1);
      const rotation = isGridMode ? 0 : (element.rotation ?? 0);
      const sideways = rotation === 90 || rotation === 270;
      const justify = element.align === "justify" && !isGridMode;
      const decorations = [font.underline ? "underline" : "", font.strikeout ? "line-through" : ""]
        .filter(Boolean)
        .join(" ");
      const justifyContent =
        element.align === "center" ? "center" : element.align === "right" ? "flex-end" : "flex-start";
      const alignItems =
        element.vAlign === "middle" ? "center" : element.vAlign === "bottom" ? "flex-end" : "flex-start";

      const style: CSSProperties = {
        ...frame,
        display: rotation ? "block" : "flex",
        justifyContent,
        alignItems,
        padding: !isGridMode && element.style?.padding ? mmToPx(element.style.padding, zoom) : 0,
        fontFamily: isGridMode || font.family === "NotoSansMono" ? "var(--pd-mono)" : "inherit",
        fontSize: isGridMode ? cellPx / MONO_ADVANCE_RATIO : ptToPx(font.size ?? 9, zoom),
        fontWeight: font.bold ? 700 : 400,
        fontStyle: font.italic ? "italic" : "normal",
        textDecoration: decorations || "none",
        color: staticColour(element.style?.color, "#17222e"),
        background: staticColour(element.style?.fill, "transparent"),
        lineHeight: isGridMode ? `${toPxY(1)}px` : 1.15,
        textAlign: justify ? "justify" : (element.align as CSSProperties["textAlign"]),
      };

      const content =
        element.markup && !isGridMode ? (
          <MarkupText
            template={element.value}
            showExpressions={showExpressions}
            resolveSample={resolveSample}
            zoom={zoom}
          />
        ) : (
          displayText(element.value, showExpressions, resolveSample) || " "
        );

      // `width: 100%` only when justified: a justified line has to reach the
      // box's far edge, while every other alignment is done by the flex box.
      const text = (
        <span
          className={styles.elementText}
          style={justify ? { width: "100%", textAlignLast: "left" } : undefined}
        >
          {content}
        </span>
      );

      let body: ReactNode = text;
      if (rotation) {
        // A box with the sides swapped, centred on the element and turned:
        // the same thing the PDF renderer does.
        const boxW = toPxX(rect.w);
        const boxH = toPxY(rect.h);
        const innerW = sideways ? boxH : boxW;
        const innerH = sideways ? boxW : boxH;
        body = (
          <span
            className={styles.elementRotated}
            style={{
              left: (boxW - innerW) / 2,
              top: (boxH - innerH) / 2,
              width: innerW,
              height: innerH,
              justifyContent,
              alignItems,
              transform: `rotate(${rotation}deg)`,
            }}
          >
            {text}
          </span>
        );
      }

      return (
        <div
          {...common}
          className={`${className} ${element.wrap ? styles.elementWrap : ""}`}
          style={style}
        >
          {body}
          {element.highlights?.length ? (
            <span
              className={styles.elementBadge}
              title={`Conditional formatting: ${element.highlights.map((rule) => rule.when).join("; ")}`}
            >
              ◆
            </span>
          ) : null}
          {frameOverlay}
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

      // An SVG over the line's box, padded so a thick stroke and its
      // arrowheads are not clipped. The padding also widens the hit area, so a
      // 0.5pt rule is still something a mouse can catch.
      const colour = staticColour(element.style?.stroke ?? element.style?.color, "#17222e");
      const widthPx = Math.max(1, ptToPx(element.widthPt || 0.5, zoom));
      const arrowed = element.arrowStart || element.arrowEnd;
      const headPx = mmToPx(element.arrowSizeMm ?? 2.5, zoom);
      const pad = Math.ceil(Math.max(widthPx * 2, arrowed ? headPx : 0, 3));
      const x1 = toPxX(element.x1 - rect.x) + pad;
      const y1 = toPxY(element.y1 - rect.y) + pad;
      const x2 = toPxX(element.x2 - rect.x) + pad;
      const y2 = toPxY(element.y2 - rect.y) + pad;
      const length = Math.hypot(x2 - x1, y2 - y1);
      const ux = length ? (x2 - x1) / length : 0;
      const uy = length ? (y2 - y1) / length : 0;
      const pull = arrowed ? Math.min(headPx * 0.8, length / 2) : 0;
      const sx = element.arrowStart ? x1 + ux * pull : x1;
      const sy = element.arrowStart ? y1 + uy * pull : y1;
      const ex = element.arrowEnd ? x2 - ux * pull : x2;
      const ey = element.arrowEnd ? y2 - uy * pull : y2;
      const head = (tipX: number, tipY: number, dirX: number, dirY: number) => {
        const half = Math.max(headPx * 0.4, widthPx);
        const baseX = tipX - dirX * headPx;
        const baseY = tipY - dirY * headPx;
        return `${tipX},${tipY} ${baseX - dirY * half},${baseY + dirX * half} ${baseX + dirY * half},${baseY - dirX * half}`;
      };
      const lineStyle = element.style?.lineStyle;
      const offset = lineStyle === "DOUBLE" ? widthPx + 0.5 : 0;

      return (
        <div
          {...common}
          className={`${styles.element} ${selected ? styles.elementSelected : ""}`}
          style={{
            left: toPxX(rect.x + offsetX) - pad,
            top: toPxY(rect.y + offsetY) - pad,
            width: toPxX(rect.w) + pad * 2,
            height: toPxY(rect.h) + pad * 2,
          }}
        >
          <svg className={styles.elementSvg} width="100%" height="100%">
            {offset ? (
              <>
                <line x1={sx - uy * offset} y1={sy + ux * offset} x2={ex - uy * offset} y2={ey + ux * offset} stroke={colour} strokeWidth={widthPx} />
                <line x1={sx + uy * offset} y1={sy - ux * offset} x2={ex + uy * offset} y2={ey - ux * offset} stroke={colour} strokeWidth={widthPx} />
              </>
            ) : (
              <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={colour} strokeWidth={widthPx} strokeDasharray={svgDash(lineStyle, widthPx)} />
            )}
            {element.arrowEnd && length ? <polygon points={head(x2, y2, ux, uy)} fill={colour} /> : null}
            {element.arrowStart && length ? <polygon points={head(x1, y1, -ux, -uy)} fill={colour} /> : null}
          </svg>
        </div>
      );
    }

    case "RECT": {
      const shape = isGridMode ? "RECT" : (element.shape ?? "RECT");
      const strokeWidthPt = element.style?.strokeWidthPt ?? 0.5;
      const stroke = staticColour(element.style?.stroke, "#17222e");
      const fill = staticColour(element.style?.fill, "transparent");
      if (shape === "RECT") {
        return (
          <div
            {...common}
            className={className}
            style={{
              ...frame,
              background: fill,
              border: cssBorder(element.style?.lineStyle, strokeWidthPt, stroke, zoom),
              borderRadius: isGridMode ? 0 : mmToPx(element.radiusMm, zoom),
            }}
          >
            {frameOverlay}
          </div>
        );
      }
      // Shapes are inset by half the stroke so the box does not clip them.
      const w = toPxX(rect.w);
      const h = toPxY(rect.h);
      const strokePx = Math.max(1, ptToPx(strokeWidthPt, zoom));
      const inset = strokePx / 2;
      const shapeProps = {
        fill,
        stroke,
        strokeWidth: strokePx,
        strokeDasharray: svgDash(element.style?.lineStyle, strokePx),
      };
      return (
        <div {...common} className={className} style={frame}>
          <svg className={styles.elementSvg} width={w} height={h}>
            {shape === "ELLIPSE" ? (
              <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - inset)} ry={Math.max(0, h / 2 - inset)} {...shapeProps} />
            ) : shape === "TRIANGLE" ? (
              <polygon points={`${w / 2},${inset} ${w - inset},${h - inset} ${inset},${h - inset}`} {...shapeProps} />
            ) : (
              <polygon points={`${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}`} {...shapeProps} />
            )}
          </svg>
          {frameOverlay}
        </div>
      );
    }

    case "IMAGE":
      return (
        <div {...common} className={`${className} ${styles.elementPlaceholder}`} style={frame}>
          {`IMAGE ${element.fit.toLowerCase()}`}
          {frameOverlay}
        </div>
      );

    case "BARCODE":
      return (
        <div {...common} className={`${className} ${styles.elementPlaceholder}`} style={frame}>
          {`${element.symbology.toUpperCase()}${element.showText ? " + text" : ""}`}
          {frameOverlay}
        </div>
      );

    case "QRCODE":
      return (
        <div {...common} className={`${className} ${styles.elementPlaceholder}`} style={frame}>
          {`QR ${element.errorCorrection}`}
          {frameOverlay}
        </div>
      );

    case "CHART":
      return (
        <div {...common} className={`${className} ${styles.elementChart}`} style={frame}>
          <ChartSketch
            element={element}
            widthPx={toPxX(rect.w)}
            heightPx={toPxY(rect.h)}
            zoom={zoom}
            title={displayText(element.title, showExpressions, resolveSample)}
          />
          {frameOverlay}
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
