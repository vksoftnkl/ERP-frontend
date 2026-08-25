/**
 * GRID-mode metrics and the canvas unit adapter.
 *
 * A GRID template is measured in CHARACTER CELLS, not millimetres — and not
 * only in `col`/`row`/`cols`. The shipped thermal receipt stores `x: 28` for
 * "column 28" and `h: 1` for "one line"; the mm-named fields carry cell counts,
 * mirroring the cell fields exactly. That is the schema's real contract in GRID
 * mode, whatever the field names suggest, and treating those numbers as
 * millimetres collapses a 48-column receipt into the first 3mm of the page.
 *
 * So the canvas works in CANVAS UNITS — millimetres in GRAPHIC mode, cells in
 * GRID mode — and converts to pixels through one scale per axis. Every
 * component below `CanvasViewport` takes that scale and needs to know nothing
 * else about the layout mode.
 */

import type { PaperSpec, PaperPreset } from "@/features/print-designer/types/template-definition";
import { PAPER_PRESETS, findPaperPreset } from "@/features/print-designer/lib/vocabulary";
import { gridCellWidthMm, gridLineHeightMm } from "@/features/print-designer/lib/units";

export type GridMetrics = {
  columns: number;
  rows: number | null;
  cellWidthMm: number;
  lineHeightMm: number;
};

/**
 * Millimetres per canvas unit, per axis.
 *
 * GRAPHIC is the identity: a unit IS a millimetre. GRID scales a cell to its
 * physical size, which is what puts the character grid on a ruler a user can
 * compare with their stationery.
 */
export type CanvasScale = { x: number; y: number };

export const GRAPHIC_SCALE: CanvasScale = { x: 1, y: 1 };

export function gridMetrics(
  paper: PaperSpec,
  presets: readonly PaperPreset[] = PAPER_PRESETS,
): GridMetrics {
  const preset = findPaperPreset(paper.code, presets);
  const columns = paper.columns ?? preset?.columns ?? 80;
  const printableWidth = Math.max(0, paper.widthMm - paper.margins.left - paper.margins.right);

  return {
    columns,
    rows: paper.rows ?? preset?.rows ?? null,
    // A declared CPI is the printer's real pitch; without one the roll's
    // printable width divided by its column count is the best available answer.
    cellWidthMm: gridCellWidthMm({
      widthMm: printableWidth,
      columns,
      cpi: preset?.cpi,
    }),
    lineHeightMm: gridLineHeightMm(),
  };
}

export const gridScale = (metrics: GridMetrics): CanvasScale => ({
  x: metrics.cellWidthMm,
  y: metrics.lineHeightMm,
});

/**
 * Cell coordinates for an element.
 *
 * `col`/`row`/`cols` win when present; the mm-named fields are the fallback and
 * already hold cell counts in GRID mode, so no conversion is involved.
 */
export function cellOf(element: {
  col?: number;
  row?: number;
  cols?: number;
  x: number;
  y: number;
  w?: number;
}): { col: number; row: number; cols: number } {
  return {
    col: Math.round(element.col ?? element.x),
    row: Math.round(element.row ?? element.y),
    cols: Math.max(1, Math.round(element.cols ?? element.w ?? 1)),
  };
}

/**
 * Columns an element consumes past the paper's width, or 0 when it fits.
 * The column budget is the one thing a GRID designer must not get wrong: a
 * field that runs past the last column is silently truncated by the printer.
 */
export function columnOverflow(
  cell: { col: number; cols: number },
  metrics: GridMetrics,
): number {
  return Math.max(0, cell.col + cell.cols - metrics.columns);
}
