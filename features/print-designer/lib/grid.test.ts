import { describe, expect, it } from "vitest";
import {
  cellOf,
  columnOverflow,
  gridMetrics,
  gridScale,
} from "@/features/print-designer/lib/grid";
import type { PaperSpec } from "@/features/print-designer/types/template-definition";

const thermal: PaperSpec = {
  code: "T80",
  widthMm: 80,
  heightMm: null,
  orientation: "PORTRAIT",
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  columns: 48,
};

const dotMatrix: PaperSpec = {
  code: "DM80",
  widthMm: 241.3,
  heightMm: 279.4,
  orientation: "PORTRAIT",
  margins: { top: 2, right: 2, bottom: 2, left: 2 },
  columns: 80,
};

describe("gridMetrics", () => {
  it("divides the printable width for a thermal roll", () => {
    const metrics = gridMetrics(thermal);
    expect(metrics.columns).toBe(48);
    expect(metrics.cellWidthMm).toBeCloseTo(76 / 48, 5);
  });

  it("uses the printer's declared pitch for dot matrix", () => {
    // The preset declares 10 CPI, which is 2.54mm — the platen's real pitch,
    // not a figure derived from the paper.
    expect(gridMetrics(dotMatrix).cellWidthMm).toBeCloseTo(2.54, 5);
  });
});

describe("cell geometry", () => {
  it("reads the cell fields when they are present", () => {
    expect(cellOf({ col: 3, row: 4, cols: 6, x: 3, y: 4, w: 6 })).toEqual({
      col: 3,
      row: 4,
      cols: 6,
    });
  });

  it("falls back to x/y/w, which hold CELL counts in GRID mode", () => {
    // The shipped thermal receipt writes `x: 28, w: 20` for "column 28, twenty
    // columns wide". Reading those as millimetres is what collapsed the whole
    // receipt into the first 3mm of the roll.
    expect(cellOf({ x: 28, y: 6, w: 20 })).toEqual({ col: 28, row: 6, cols: 20 });
  });

  it("never reports a zero-column element, which would be unselectable", () => {
    expect(cellOf({ x: 0, y: 0 }).cols).toBe(1);
    expect(cellOf({ x: 0, y: 0, w: 0 }).cols).toBe(1);
  });

  it("reports the column budget an element blows", () => {
    const metrics = gridMetrics(thermal);
    expect(columnOverflow({ col: 40, cols: 8 }, metrics)).toBe(0);
    expect(columnOverflow({ col: 44, cols: 8 }, metrics)).toBe(4);
  });
});

describe("gridScale", () => {
  it("scales a canvas unit to the printer's physical cell", () => {
    const scale = gridScale(gridMetrics(dotMatrix));
    expect(scale.x).toBeCloseTo(2.54, 5);
    expect(scale.y).toBeCloseTo(25.4 / 6, 5);
  });
});
