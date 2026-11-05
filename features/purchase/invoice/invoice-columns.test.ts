/** Purchase Entry — the line columns are ui_table 56's (Qt NexERP dd59c2c P4, 1600680 Q2). */
import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { lineColumnsPx, resolveLineColumns, twoLineHeading } from "./invoice.columns";
import { COL, COLUMN_PX, FALLBACK_ORDER } from "./invoice.constants";

function row(no: number, name: string, position: number, visible = true): UiTableColumnRow {
  return {
    uiTblClmId: String(no),
    uiTblClmNo: String(no),
    uiTblClmName: name,
    uiTblClmColumnWidth: 4,
    uiTblClmColumnVisibility: visible,
    uiTblClmColumnFocus: false,
    uiTblClmColumnPosition: position,
    uiTblClmColumnNecessity: false,
  };
}

const ALL = { priceUpdate: true, autoBatchNo: true };

describe("the line columns — ui_table 56 decides", () => {
  it("before the layout: every drawn column in the registration's order, the rules aside", () => {
    expect(resolveLineColumns(undefined, ALL).map((column) => column.no)).toEqual([...FALLBACK_ORDER]);
    const plain = resolveLineColumns(undefined).map((column) => column.no);
    for (const no of [COL.Markup, COL.MarkupB, COL.SellA, COL.SellD, COL.Size, COL.Colour, COL.Model]) {
      expect(plain).not.toContain(no);
    }
    // MSP shows without the price policy (it is only keyed under it)
    expect(plain).toContain(COL.Msp);
  });

  it("the layout's order, titles and visibility; the technical columns never; Item never hides", () => {
    const rows = [
      row(COL.Item, "Item", 5),
      row(COL.Barcode, "Barcode", 9),
      row(COL.ChrgBeforeTax, "Chrg before tax", 1),
      row(COL.Recd, "Recd", 2, false),
      row(COL.Hsn, "HSN", 3, false),
      row(19, "ItemId", 0, true),
      row(COL.MarkupB, "Markup B", 4),
    ];
    const columns = resolveLineColumns(rows, { priceUpdate: false, autoBatchNo: false });
    const nos = columns.map((column) => column.no);
    expect(nos.slice(0, 3)).toEqual([COL.ChrgBeforeTax, COL.Item, COL.Barcode]);
    expect(nos).not.toContain(19);
    expect(nos).not.toContain(COL.Recd);
    expect(nos).not.toContain(COL.Hsn);
    expect(nos).not.toContain(COL.MarkupB); // no price policy
    // a drawn column the layout has no row for follows, in the registration's order
    expect(nos.indexOf(COL.Unit)).toBeGreaterThan(nos.indexOf(COL.Barcode));
    expect(resolveLineColumns([row(COL.Item, "Item", 0, false)]).some((column) => column.no === COL.Item)).toBe(true);
    const priced = resolveLineColumns(rows, ALL);
    expect(priced.find((column) => column.no === COL.MarkupB)?.header).toBe("Markup B");
  });

  it("widths are Qt's pixel needs; two-word headings take two lines", () => {
    const columns = resolveLineColumns([row(COL.ChrgAfterTax, "Chrg after tax", 0), row(COL.Total, "Total", 1)]);
    const chrg = columns.find((column) => column.no === COL.ChrgAfterTax);
    expect(chrg).toMatchObject({ header: "Chrg after tax", heading: "Chrg\nafter tax", px: COLUMN_PX[COL.ChrgAfterTax] });
    expect(columns.find((column) => column.no === COL.Total)?.heading).toBe("Total");
    expect(lineColumnsPx(columns)).toBe(columns.reduce((sum, column) => sum + column.px, 0));
    expect(twoLineHeading("Batch / Serial")).toBe("Batch /\nSerial");
    expect(twoLineHeading("Sell A")).toBe("Sell A");
    expect(twoLineHeading("Extra disc")).toBe("Extra\ndisc");
  });
});
