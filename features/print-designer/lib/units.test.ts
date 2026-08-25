import { describe, expect, it } from "vitest";
import {
  MM_TO_PX,
  gridCellWidthMm,
  gridLineHeightMm,
  mmToPx,
  ptToPx,
  pxToMm,
  roundMm,
} from "@/features/print-designer/lib/units";

/**
 * The plan's F2: pointer maths must survive a non-100% zoom. Every one of these
 * is a round trip through the single conversion pair, because that is the
 * property the drag handlers depend on.
 */
describe("units", () => {
  it("converts millimetres to pixels at 96 DPI", () => {
    expect(mmToPx(25.4)).toBeCloseTo(96, 6);
    expect(MM_TO_PX).toBeCloseTo(3.779528, 5);
  });

  it("round-trips px -> mm at every zoom level", () => {
    for (const zoom of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
      for (const mm of [0, 0.5, 8, 37.4, 210]) {
        expect(pxToMm(mmToPx(mm, zoom), zoom)).toBeCloseTo(mm, 6);
      }
    }
  });

  it("applies zoom exactly once", () => {
    // A 10mm span at 200% must be twice its 100% width, not four times.
    expect(mmToPx(10, 2)).toBeCloseTo(mmToPx(10, 1) * 2, 6);
    expect(pxToMm(100, 2)).toBeCloseTo(pxToMm(100, 1) / 2, 6);
  });

  it("stores to a hundredth of a millimetre", () => {
    expect(roundMm(8.004)).toBe(8);
    expect(roundMm(8.006)).toBe(8.01);
    expect(roundMm(-3.145)).toBe(-3.14);
  });

  it("converts points to pixels", () => {
    expect(ptToPx(72)).toBeCloseTo(96, 6);
    expect(ptToPx(9, 2)).toBeCloseTo(24, 6);
  });

  it("derives a character cell from CPI when the printer declares one", () => {
    // 10 CPI is 2.54mm per column regardless of the paper's printable width.
    expect(gridCellWidthMm({ widthMm: 241.3, columns: 80, cpi: 10 })).toBeCloseTo(2.54, 6);
    // Without a CPI the roll's printable width is divided by its columns.
    expect(gridCellWidthMm({ widthMm: 72, columns: 48 })).toBeCloseTo(1.5, 6);
  });

  it("uses the 6 LPI draft pitch for line height", () => {
    expect(gridLineHeightMm()).toBeCloseTo(25.4 / 6, 6);
  });
});
