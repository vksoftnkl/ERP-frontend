/**
 * Stock Adjustment — the wire: buildLines / buildPayload as the Qt screen
 * builds them, and a loaded document painted back exactly.
 */
import { describe, expect, it } from "vitest";
import {
  applySaveResult,
  buildLines,
  buildPayload,
  draftFromPayload,
  lineFromPayload,
} from "./stock-adjustment.payload";
import { draftOf, itemLine, SCOPE, withLines } from "./stock-adjustment.test-fixtures";
import type {
  StockAdjustmentHeaderPayload,
  StockAdjustmentLinePayload,
} from "./stock-adjustment.types";

function headerPayload(extra: Partial<StockAdjustmentHeaderPayload> = {}): StockAdjustmentHeaderPayload {
  return {
    svhId: "svh-1",
    accYear: "2026-2027",
    companyId: "c-1",
    branchId: "b-1",
    deviceId: "dev-doc",
    voucherType: "ADJUSTMENT",
    slno: "12",
    refno: "ADJ/2026-2027/PC01/00012",
    usrRefno: null,
    docDate: "2026-09-29",
    fromGodownId: "g-1",
    fromGodownName: "Main",
    godownId: null,
    godownName: null,
    status: "DRAFT",
    lineCount: 1,
    totalQty: -3,
    totalValue: -30,
    totalValueWot: -30,
    postedOn: null,
    cancelledOn: null,
    cancelReason: null,
    rateSource: "AVG_COST",
    reasonId: "r-short",
    reasonName: "Shortage",
    remarks: "audit",
    isDeleted: false,
    ...extra,
  };
}

function linePayload(extra: Partial<StockAdjustmentLinePayload> = {}): StockAdjustmentLinePayload {
  return {
    sviId: "svi-1",
    lineNo: 1,
    splitNo: 0,
    itemId: "item-1",
    itemCode: "IT1",
    itemName: "Rice 1kg",
    unitName: "BOX",
    uomId: "iuc-box",
    baseUomId: "iuc-1",
    toBaseFactor: 12,
    godownId: "g-1",
    godownName: "Main",
    bucket: "SALEABLE",
    barcode: null,
    batchNo: "B-1",
    mfgDate: null,
    expiryDate: "2027-01-31",
    mrp: 60,
    salePrice: null,
    serialNo: null,
    supplierId: null,
    supplierName: null,
    toBucket: null,
    qty: 3,
    baseQty: 36,
    costRate: 2.5,
    value: 90,
    lotId: "lot-1",
    reasonId: "r-short",
    reasonName: "Shortage",
    direction: -1,
    remarks: null,
    trackSignature: "BE",
    ...extra,
  };
}

describe("buildLines", () => {
  it("sends only lines that name an item, numbered from 1, signed, with the base quantity", () => {
    const outward = itemLine({ qty: "-3", direction: "OUT", toBaseFactor: 12, lotId: "lot-1", reasonId: "r-short" });
    const draft = withLines(draftOf("Adjustment"), [outward]);
    const { lines, sentKeys } = buildLines(draft);
    expect(sentKeys).toEqual([outward.key]);
    expect(lines).toEqual([
      {
        lineNo: 1,
        itemId: "item-1",
        uomId: "iuc-1",
        baseUomId: "iuc-1",
        toBaseFactor: 12,
        qty: -3,
        baseQty: -36,
        godownId: "g-1",
        bucket: "SALEABLE",
        reasonId: "r-short",
        lotId: "lot-1",
      },
    ]);
  });

  it("an inward line sends only the facets its item tracks, never a lot", () => {
    const inward = itemLine({
      qty: "2",
      direction: "IN",
      trackSignature: "BE",
      batchNo: " B-9 ",
      expiryDate: "31-03-2027",
      mrp: 55,
      lotId: "lot-ignored",
      supplierId: "sup-1",
    });
    const [line] = buildLines(withLines(draftOf("Adjustment"), [inward])).lines;
    expect(line.batchNo).toBe("B-9");
    expect(line.expiryDate).toBe("2027-03-31");
    expect(line.mrp).toBeUndefined();
    expect(line.supplierId).toBeUndefined();
    expect(line.lotId).toBeUndefined();
    expect(line.costRate).toBeUndefined();
  });

  it("under MANUAL a plain adjustment's inward cost goes per BASE unit", () => {
    const inward = itemLine({ qty: "1", direction: "IN", costRate: 120, toBaseFactor: 12 });
    const draft = { ...withLines(draftOf("Adjustment"), [inward]), rateSource: "MANUAL" };
    expect(buildLines(draft).lines[0].costRate).toBe(10);
  });

  it("a move sends a magnitude, its from and its to bucket", () => {
    const move = itemLine({ qty: "4", direction: "MOVE", bucket: "SALEABLE", toBucket: "DAMAGED", lotId: "lot-1" });
    const [line] = buildLines(withLines(draftOf("Move"), [move])).lines;
    expect(line).toMatchObject({ qty: 4, baseQty: 4, bucket: "SALEABLE", toBucket: "DAMAGED", lotId: "lot-1" });
  });
});

describe("buildPayload", () => {
  it("names the one godown in fromGodownId and stores the signed NET", () => {
    const draft = {
      ...withLines(draftOf("Adjustment"), [
        itemLine({ qty: "-3", costRate: 10, direction: "OUT" }),
        itemLine({ qty: "1", costRate: 10, direction: "IN" }),
      ]),
      defaultReasonId: "r-short",
      usrRefno: "  slip 4 ",
      remarks: "",
    };
    const { payload } = buildPayload(draft, true);
    expect(payload.header).toEqual({
      accYear: "2026-2027",
      companyId: "c-1",
      branchId: "b-1",
      deviceId: "dev-1",
      docDate: "2026-10-02",
      voucherType: "ADJUSTMENT",
      fromGodownId: "g-1",
      status: "POSTED",
      lineCount: 2,
      totalQty: -2,
      totalValue: -20,
      totalValueWot: -20,
      rateSource: "AVG_COST",
      reasonId: "r-short",
      usrRefno: "slip 4",
    });
  });

  it("sends the rate source only on a plain adjustment, a move's totals as the quantity moved", () => {
    const draft = { ...withLines(draftOf("Move"), [itemLine({ qty: "4", costRate: 5 })]), svhId: "svh-1" };
    const { payload } = buildPayload(draft, false);
    expect(payload.header).toMatchObject({
      svhId: "svh-1",
      voucherType: "BUCKET_MOVE",
      status: "DRAFT",
      totalQty: 4,
      totalValue: 20,
    });
    expect(payload.header.rateSource).toBeUndefined();
  });
});

describe("a loaded document", () => {
  it("signs a line again from its stored direction, in the line's unit", () => {
    const line = lineFromPayload(linePayload());
    expect(line).toMatchObject({
      id: "svi-1",
      direction: "OUT",
      qty: "-3",
      baseQty: -36,
      costRate: 30,
      value: -90,
      expiryDate: "31-01-2027",
      trackSignature: "BE",
    });
    expect(lineFromPayload(linePayload({ direction: 1 }))).toMatchObject({ direction: "IN", qty: "3" });
    // The write-off kinds store no direction: they only ever take stock out.
    expect(lineFromPayload(linePayload({ direction: null })).qty).toBe("-3");
    expect(lineFromPayload(linePayload({ toBucket: "DAMAGED", direction: -1 }))).toMatchObject({
      direction: "MOVE",
      qty: "3",
      value: 90,
    });
  });

  it("paints the kind, the header and the lines; only a DRAFT opened for edit is keyable", () => {
    const payload = { header: headerPayload(), lines: [linePayload()], kind: "RELOT" as const };
    const draft = draftFromPayload(SCOPE, payload, true, "2026-10-02");
    expect(draft).toMatchObject({
      kind: "Relot",
      svhId: "svh-1",
      refno: "ADJ/2026-2027/PC01/00012",
      deviceId: "dev-doc",
      docDate: "2026-09-29",
      godownId: "g-1",
      godownName: "Main",
      defaultReasonId: "r-short",
      extraReason: { id: "r-short", name: "Shortage" },
      mode: "entry",
      dirty: false,
      reasonsLoaded: false,
    });
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[1].itemId).toBe("");
    const posted = draftFromPayload(SCOPE, { ...payload, header: headerPayload({ status: "POSTED" }) }, true, "2026-10-02");
    expect(posted.mode).toBe("browse");
  });

  it("falls back to the TO godown when the from side is empty", () => {
    const payload = {
      header: headerPayload({ fromGodownId: null, fromGodownName: null, godownId: "g-9", godownName: "Back" }),
      lines: [],
      kind: "ADJUSTMENT" as const,
    };
    expect(draftFromPayload(SCOPE, payload, false, "2026-10-02")).toMatchObject({ godownId: "g-9", godownName: "Back" });
  });

  it("takes the server's ids back onto the lines it was sent", () => {
    const first = itemLine({ qty: "-1", direction: "OUT" });
    const second = itemLine({ qty: "-2", direction: "OUT" });
    const draft = { ...withLines(draftOf("Adjustment"), [first, second]), dirty: true, serverProblems: { x: "y" } };
    const saved = applySaveResult(
      draft,
      {
        header: headerPayload({ svhId: "svh-9", refno: "ADJ/9", status: "DRAFT" }),
        lines: [linePayload({ sviId: "svi-a" }), linePayload({ sviId: "svi-b" })],
        rowsPosted: null,
      },
      [first.key, second.key],
    );
    expect(saved).toMatchObject({ svhId: "svh-9", refno: "ADJ/9", status: "DRAFT", dirty: false, serverProblems: {} });
    expect(saved.lines.map((line) => line.id)).toEqual(["svi-a", "svi-b", null]);
  });
});
