import { describe, expect, it } from "vitest";
import type { OpenSourceDoc } from "../api/bills";
import { createBillDraft, createBillDraftLine } from "../state/factories";
import { appendOpenSourceLines, openSourcesSummary } from "./import";

const doc: OpenSourceDoc = {
  docId: "so-1",
  accYear: "2026-2027",
  refno: "SO0042",
  date: "2026-09-20",
  purpose: null,
  ageDays: 5,
  pastWindow: false,
  lines: [
    { lineId: "soi-1", lineNo: 1, itemId: "item-a", itemName: "Cement", unitId: "iuc-a", unitName: "Bag", lotId: null, batchNo: null, godownId: "g1", docQty: 100, openQty: 40, freeQty: 0, rate: 350, taxId: null, taxPerc: 28, hsnCode: "2523" },
    { lineId: "soi-2", lineNo: 2, itemId: "item-b", itemName: "Sand", unitId: "iuc-b", unitName: "Ton", lotId: null, batchNo: "B7", godownId: "g1", docQty: 10, openQty: 10, freeQty: 0, rate: 1200, taxId: null, taxPerc: 5, hsnCode: null },
  ],
};

function draft() {
  return createBillDraft({ companyId: "c", branchId: "b", accYear: "2026-2027", companyStateCode: "33" });
}

describe("open sources — append, never replace (§13.4)", () => {
  it("appends new lines with the trail per line, the open qty as the cap and the source rate", () => {
    const base = { ...draft(), lines: [createBillDraftLine()] };
    const out = appendOpenSourceLines(base, "ORDER", [{ doc, line: doc.lines[0], takeQty: 25 }]);
    expect(out.newLineKeys).toHaveLength(1);
    const line = out.draft.lines.find((row) => row.key === out.newLineKeys[0])!;
    expect(line).toMatchObject({
      itemId: "item-a",
      billQty: 25,
      orderQty: 40,
      orderQtyLocked: true,
      rate: 350,
      gstPerc: 28,
      srcDocType: "SALES_ORDER",
      srcDocId: "so-1",
      srcItemId: "soi-1",
      srcDocLineNo: 1,
      srcDocYear: "2026-2027",
      srcItemQty: 100,
      stockGateResolved: false,
    });
    // inserted BEFORE the trailing blank row
    expect(out.draft.lines[out.draft.lines.length - 1].itemId).toBe("");
    // the header trail is set by the first document, and the chip lists it
    expect(out.draft.source?.docId).toBe("so-1");
    expect(out.draft.sources).toEqual([expect.objectContaining({ kind: "ORDER", docId: "so-1", lines: 1, takenQty: 25 })]);
  });

  it("tops up a line already on the bill for the same source line, clamped at the cap", () => {
    const existing = createBillDraftLine({ itemId: "item-a", itemUnitId: "iuc-a", billQty: 30, orderQty: 40, orderQtyLocked: true, srcDocId: "so-1", srcItemId: "soi-1", srcDocType: "SALES_ORDER" });
    const base = { ...draft(), lines: [existing, createBillDraftLine()] };
    const out = appendOpenSourceLines(base, "ORDER", [{ doc, line: doc.lines[0], takeQty: 25 }]);
    expect(out.newLineKeys).toHaveLength(0);
    expect(out.toppedUp).toBe(1);
    expect(out.clamped).toBe(1);
    expect(out.draft.lines[0].billQty).toBe(40);
  });

  it("a challan pick carries DELIVERY_CHALLAN and keeps the header trail of the first document", () => {
    const base = { ...draft(), source: { docType: "SALES_ORDER", docId: "so-0", accYear: "2026-2027", refno: "SO0001", date: null } };
    const out = appendOpenSourceLines(base, "DC", [{ doc: { ...doc, docId: "dc-1", refno: "DC0007" }, line: doc.lines[1], takeQty: 10 }]);
    expect(out.draft.source?.docId).toBe("so-0");
    const line = out.draft.lines.find((row) => row.itemId === "item-b")!;
    expect(line.srcDocType).toBe("DELIVERY_CHALLAN");
    expect(line.batchNo).toBe("B7");
    expect(out.draft.sources[0]).toMatchObject({ kind: "DC", docId: "dc-1", refno: "DC0007" });
  });

  it("ignores zero takes and sums the summary over ticked lines", () => {
    const out = appendOpenSourceLines(draft(), "ORDER", [{ doc, line: doc.lines[0], takeQty: 0 }]);
    expect(out.newLineKeys).toHaveLength(0);
    expect(openSourcesSummary([{ doc, line: doc.lines[0], takeQty: 2 }, { doc, line: doc.lines[1], takeQty: 0 }])).toBe("1 line ticked · goods value 700.00");
  });
});
