/**
 * Multi-size entry on the Sale Bill.
 *
 * The grouping, the validation and the CFT arithmetic are the quotation's and
 * are tested there — `quotation.sizes.test.ts` is the suite for those. What is
 * only true HERE is what a brand-new size row must shed: the bill carries its
 * own `sbiId` and a whole source trail back to the order or quotation the line
 * was imported from, and inheriting either would misreport what has been billed.
 */
import { describe, expect, it } from "vitest";
import {
  applySizeEntry,
  createSizeEntryRow,
  findSizeGroup,
  openSizeEntry,
  type SizeEntryRow,
} from "@/features/sales/quotation/quotation.sizes";
import { splitSizeFactors } from "@/features/sales/quotation/quotation.utils";
import { createBillDraftLine, duplicateBillDraftLine } from "./salebill.state";
import type { SaleBillDraftLine } from "./salebill.types";

function line(overrides: Partial<SaleBillDraftLine> = {}): SaleBillDraftLine {
  return createBillDraftLine({
    itemId: "item-1",
    itemName: "Teak plank",
    rate: 250,
    ...overrides,
  });
}

function sizeRow(
  size: string,
  overrides: Partial<SizeEntryRow<SaleBillDraftLine>> = {},
): SizeEntryRow<SaleBillDraftLine> {
  return {
    ...createSizeEntryRow<SaleBillDraftLine>(250),
    factors: splitSizeFactors(size),
    ...overrides,
  };
}

/** A line imported from a sales order: server id, source trail, capped qty. */
function importedLine(): SaleBillDraftLine {
  return line({
    key: "target",
    sbiId: "sbi-1",
    stockId: "stock-1",
    serialNo: "SN-1",
    srcDocType: "ORDER",
    srcDocYear: "2026-2027",
    srcDocRefno: "SO/0007",
    srcDocLineNo: 3,
    srcItemQty: 40,
    orderQtyLocked: true,
    discPerc: 5,
    gstPerc: 18,
  });
}

/** The real flow: open on the row, keep its dialog row, add more sizes. */
function reSize(lines: SaleBillDraftLine[], anchor: string, sizes: string[]): SaleBillDraftLine[] {
  const opened = openSizeEntry(findSizeGroup(lines, anchor)!);
  const rows = sizes.map((size, index) =>
    index < opened.length
      ? { ...opened[index], factors: splitSizeFactors(size), qty: "", qtyTouched: false }
      : sizeRow(size),
  );
  return applySizeEntry(lines, anchor, rows, duplicateBillDraftLine);
}

describe("applySizeEntry on a bill line", () => {
  it("splits an imported line into one row per size", () => {
    const next = reSize([importedLine()], "target", ["45*2*2*6", "60*3*2*4"]);
    expect(next).toHaveLength(2);
    expect(next.map((row) => row.itemSize)).toEqual(["45*2*2*6", "60*3*2*4"]);
    expect(next.map((row) => row.billQty)).toEqual([7.5, 10]);
  });

  it("keeps the imported row's identity, cap and trail on the row that IS it", () => {
    const next = reSize([importedLine()], "target", ["45*2*2*6", "60*3*2*4"]);
    expect(next[0]).toMatchObject({
      key: "target",
      sbiId: "sbi-1",
      srcDocRefno: "SO/0007",
      srcDocLineNo: 3,
      orderQtyLocked: true,
    });
  });

  it("sheds the server id and the whole source trail on a row the dialog added", () => {
    // Three sizes inheriting one order line's trail would make that line look
    // billed three times, and `orderQtyLocked` would hand the operator a
    // quantity cell they cannot edit on a row no order asked for.
    const next = reSize([importedLine()], "target", ["45*2*2*6", "60*3*2*4"]);
    expect(next[1]).toMatchObject({
      sbiId: null,
      stockId: null,
      serialNo: null,
      srcDocType: null,
      srcDocYear: null,
      srcDocRefno: null,
      srcDocLineNo: null,
      srcItemQty: null,
      orderQtyLocked: false,
    });
    expect(next[1].source).toBeUndefined();
    expect(next[1].key).not.toBe("target");
  });

  it("still copies the discount and tax block onto the added row", () => {
    const next = reSize([importedLine()], "target", ["45*2*2*6", "60*3*2*4"]);
    expect(next[1]).toMatchObject({
      itemId: "item-1",
      itemName: "Teak plank",
      discPerc: 5,
      gstPerc: 18,
    });
  });

  it("groups a reloaded bill line by item id, having no stamp to read", () => {
    // `lineGroupKey` is not persisted on either screen, so a saved multi-size
    // bill has to re-group the same way a quotation does.
    const lines = [
      line({ key: "a", itemSize: "45*2*2*6", billQty: 7.5, sbiId: "sbi-1" }),
      line({ key: "b", itemSize: "60*3*2*4", billQty: 10, sbiId: "sbi-2" }),
      line({ key: "other", itemId: "item-2", itemSize: "1*1*1*1" }),
    ];
    const group = findSizeGroup(lines, "b");
    expect(group).toMatchObject({ start: 0, end: 1 });
    expect(group?.lines.map((row) => row.sbiId)).toEqual(["sbi-1", "sbi-2"]);
  });

  it("re-saves an existing group without disturbing any sbiId", () => {
    const lines = [
      line({ key: "a", itemSize: "45*2*2*6", billQty: 7.5, sbiId: "sbi-1" }),
      line({ key: "b", itemSize: "60*3*2*4", billQty: 10, sbiId: "sbi-2" }),
    ];
    const rows = openSizeEntry(findSizeGroup(lines, "a")!);
    const next = applySizeEntry(lines, "a", rows, duplicateBillDraftLine);
    expect(next.map((row) => row.sbiId)).toEqual(["sbi-1", "sbi-2"]);
    expect(next.map((row) => row.key)).toEqual(["a", "b"]);
    expect(next.map((row) => row.itemSize)).toEqual(["45*2*2*6", "60*3*2*4"]);
  });

  it("leaves a blank trailing row alone — it has no item to size", () => {
    expect(findSizeGroup([createBillDraftLine({ key: "blank" })], "blank")).toBeNull();
  });
});
