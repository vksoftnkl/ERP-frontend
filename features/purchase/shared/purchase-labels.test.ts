import { describe, expect, it } from "vitest";
import type { PurchaseLabelRow } from "./purchase-dialogs.api";
import { copiesOf, labelLinesOf, labelSvg, labelsPrintDocument, totalCopies } from "./purchase-labels";

const ROW: PurchaseLabelRow = {
  rowId: "r1",
  lineNo: 1,
  rowNo: 1,
  itemId: "i1",
  itemName: "COTTON SHIRT",
  unitName: "PCS",
  barcode: "T0001234",
  batchNo: "T0001234",
  ean: null,
  mrp: "999.00",
  price: "799",
  size: "M",
  colour: "RED",
  model: "M7",
  expiryDate: null,
  qty: "3.000",
  companyName: "Acme & Sons",
  copies: 3,
  textile: true,
};

describe("labels", () => {
  it("counts copies and reads a typed Copies cell", () => {
    const lines = labelLinesOf([ROW, { ...ROW, rowId: "r2", copies: 2 }]);
    expect(totalCopies(lines)).toBe(5);
    expect([copiesOf("4"), copiesOf(""), copiesOf("-2"), copiesOf("x")]).toEqual([4, 0, 0, 0]);
  });

  it("draws company, item · model, size · colour, bars, prices — escaped", () => {
    const svg = labelSvg(ROW);
    expect(svg).toContain("ACME &amp; SONS");
    expect(svg).toContain("COTTON SHIRT · M7");
    expect(svg).toContain("M · RED");
    expect(svg).toContain("Our price ₹799.00");
    expect(svg).toContain("MRP ₹999.00 (incl. of all taxes)");
    expect(svg.match(/<rect /g)?.length ?? 0).toBeGreaterThan(20);
  });

  it("draws no bars without a barcode and no price lines at zero", () => {
    const svg = labelSvg({ ...ROW, barcode: null, price: null, mrp: "0" });
    expect(svg).not.toContain("<rect");
    expect(svg).not.toContain("Our price");
    expect(svg).not.toContain("MRP");
  });

  it("prints one page per copy on a 50 × 38 mm roll", () => {
    const html = labelsPrintDocument(labelLinesOf([ROW, { ...ROW, rowId: "r2", copies: 0 }]), "GRN/1");
    expect(html).toContain("@page { size: 50mm 38mm; margin: 1mm; }");
    expect(html.match(/class="label"/g)).toHaveLength(3);
  });
});
