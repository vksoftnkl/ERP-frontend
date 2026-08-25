/**
 * The designer's unit system.
 *
 * The store is always millimetres; pixels exist only inside a render pass or a
 * pointer handler. Every px -> mm conversion goes through `pxToMm` so the zoom
 * factor is applied exactly once — the single call site that risk F2 in the
 * plan exists to protect.
 */

/** CSS pixels per millimetre at the 96 DPI the canvas assumes. */
export const MM_TO_PX = 96 / 25.4;

export const mmToPx = (mm: number, zoom = 1): number => mm * MM_TO_PX * zoom;

export const pxToMm = (px: number, zoom = 1): number => px / (MM_TO_PX * zoom);

/** Store precision: a hundredth of a millimetre, well below any printer. */
export const roundMm = (mm: number): number => Math.round(mm * 100) / 100;

/** Clamp helper used by every geometry commit. */
export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

/**
 * Display form for a millimetre figure: at most two decimals, no trailing
 * zeroes. `8`, not `8.00`, because a property panel of `8.00 4.00 100.00 7.00`
 * is unreadable at a glance.
 */
export function formatMm(mm: number): string {
  const rounded = roundMm(mm);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Character cell size for a GRID paper, in millimetres.
 *
 * Thermal papers declare columns without a CPI: the cell is simply the
 * printable width divided by the column count. Dot matrix declares a real
 * pitch, and 25.4/CPI is the physical truth the printer will use — deriving it
 * from the paper width instead would drift the ruler away from the platen.
 */
export function gridCellWidthMm(options: {
  widthMm: number;
  columns: number;
  cpi?: number;
  marginsMm?: number;
}): number {
  if (options.cpi && options.cpi > 0) {
    return 25.4 / options.cpi;
  }
  const printable = options.widthMm - (options.marginsMm ?? 0);
  return options.columns > 0 ? printable / options.columns : 0;
}

/** Line height for a GRID paper at the standard 6 LPI draft pitch. */
export const GRID_LINES_PER_INCH = 6;

export const gridLineHeightMm = (linesPerInch = GRID_LINES_PER_INCH): number =>
  25.4 / linesPerInch;

/** CSS pixels per point, at 96 DPI. Font sizes are stored in points. */
export const PT_TO_PX = 96 / 72;

export const ptToPx = (points: number, zoom = 1): number => points * PT_TO_PX * zoom;
