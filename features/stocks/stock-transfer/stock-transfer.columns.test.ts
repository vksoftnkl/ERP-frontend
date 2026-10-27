import { describe, expect, it } from "vitest";
import { resolveLineColumns } from "./stock-transfer.columns";
import { COL } from "./stock-transfer.constants";

const row = (no: number, name: string, width: number, position: number) =>
  ({
    uiTblClmId: String(no),
    uiTblClmNo: String(no),
    uiTblClmName: name,
    uiTblClmColumnWidth: width,
    uiTblClmColumnVisibility: true,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: position,
    uiTblClmColumnNecessity: false,
  }) as never;

describe("resolveLineColumns", () => {
  it("shows the rate columns only while their box is ticked, and never the hidden code", () => {
    const off = resolveLineColumns(undefined, { loadEnabled: false, unloadEnabled: false }).map((c) => c.no);
    expect(off).not.toContain(COL.LoadRate);
    expect(off).not.toContain(COL.UnloadRate);
    expect(off).not.toContain(COL.ItemCode);
    expect(off).toContain(COL.Qty);
    const load = resolveLineColumns(undefined, { loadEnabled: true, unloadEnabled: false }).map((c) => c.no);
    expect(load).toContain(COL.LoadRate);
    expect(load).not.toContain(COL.UnloadRate);
    const both = resolveLineColumns(undefined, { loadEnabled: true, unloadEnabled: true }).map((c) => c.no);
    expect(both).toContain(COL.UnloadRate);
  });

  it("takes titles, order and widths from the layout, as shares of 100", () => {
    const columns = resolveLineColumns(
      [row(COL.Qty, "Qty to move", 10, 2), row(COL.Description, "Item", 30, 1), row(COL.LineNo, "#", 0, 0)],
      { loadEnabled: false, unloadEnabled: false },
    );
    const order = columns.map((c) => c.no);
    expect(order.indexOf(COL.Description)).toBeLessThan(order.indexOf(COL.Qty));
    expect(columns.find((c) => c.no === COL.Qty)?.header).toBe("Qty to move");
    expect(columns.reduce((sum, c) => sum + c.widthPct, 0)).toBeCloseTo(100);
  });
});
