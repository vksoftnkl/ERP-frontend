import { describe, expect, it } from "vitest";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { resolveGrnColumns } from "./grn.columns";
import { COL } from "./grn.constants";
import {
  applyItem,
  applyPendingLines,
  buildSavePayload,
  computeTotals,
  createDraft,
  editCell,
  fillFromPo,
  fromPayload,
  isCellEditable,
  lineShort,
  lineValue,
  poNetRate,
  poOptions,
  removeLine,
  rowHasItem,
  saveRefusal,
  setGodown,
  setSupplier,
} from "./grn.state";
import type { GrnDraft, GrnPayload, PendingPoLine } from "./grn.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };

function pending(over: Partial<PendingPoLine>): PendingPoLine {
  return {
    poId: "po1",
    accYear: "2026-2027",
    refno: "PO/2026-2027/D14/00106",
    docDate: "2026-10-20T00:00:00.000Z",
    poiId: "poi1",
    itemId: "item-a",
    itemName: "ZT-ITEM-A",
    uomId: "uom-a",
    unitName: "Nos",
    rate: "100",
    discPct: "10",
    schPct: "0",
    mrp: "0",
    pendingQty: "10.000",
    ...over,
  };
}

/** Supplier + godown + the Qt test's PO: 10 × ZT-ITEM-A at 100 less 10 %, 5 bottles at 400. */
function withPo(): GrnDraft {
  let draft = createDraft(SCOPE, "2026-10-28");
  draft = setSupplier(draft, "sup1", "ZT-PUR Supplier");
  draft = setGodown(draft, "gd1", "Coimbatore");
  return applyPendingLines(draft, "sup1", [
    pending({}),
    pending({ poiId: "poi2", itemId: "item-b", itemName: "ZT-ITEM-B", uomId: "uom-b", unitName: "Bottle", rate: "400", discPct: "0", pendingQty: "5", mrp: "450" }),
    pending({ poId: "po2", refno: "PO/2026-2027/D14/00107", poiId: "poi3" }),
  ]);
}

describe("grn.state — Against PO", () => {
  it("offers one choice per PO with its pending line count", () => {
    const options = poOptions(withPo(), false);
    expect(options.map((option) => option.value)).toEqual(["", "po1", "po2"]);
    expect(options[0].label).toBe("— without PO —");
    expect(options[1].label).toBe("PO/2026-2027/D14/00106 · 20/10/2026 (2 lines pending)");
    expect(options[2].label).toContain("(1 line pending)");
  });

  it("says there is no open PO, and asks for the supplier first", () => {
    const none = applyPendingLines(setSupplier(createDraft(SCOPE, "2026-10-28"), "sup1", "S"), "sup1", []);
    expect(poOptions(none, false)[0].label).toBe("— no open PO —");
    expect(poOptions(createDraft(SCOPE, "2026-10-28"), false)[0].label).toBe("— pick the supplier —");
  });

  it("drops a stale answer for another supplier", () => {
    const draft = setSupplier(createDraft(SCOPE, "2026-10-28"), "sup2", "Other");
    expect(applyPendingLines(draft, "sup1", [pending({})]).pendingLines).toEqual([]);
  });

  it("fills the PO's lines: received = challan = pending, at the PO's net rate, + one blank", () => {
    const { draft, added } = fillFromPo(withPo(), "po1");
    expect(added).toBe(2);
    expect(draft.lines).toHaveLength(3);
    const [a, b, blank] = draft.lines;
    expect(a).toMatchObject({ recd: "10", challan: "10", pending: "10", rate: "90.00", poRef: "00106", poItemId: "poi1", unitName: "Nos" });
    expect(b).toMatchObject({ recd: "5", unitName: "Bottle", rate: "400.00", mrp: "450" });
    expect(rowHasItem(blank)).toBe(false);
    expect(draft.dirty).toBe(true);
    expect(draft.poChoice).toBe("po1");
  });

  it("does not add a PO line twice", () => {
    const once = fillFromPo(withPo(), "po1").draft;
    const twice = fillFromPo(once, "po1");
    expect(twice.added).toBe(0);
    expect(twice.draft.lines).toHaveLength(3);
    expect(twice.draft.hint).toBe("Every line of that PO is already on this GRN.");
  });

  it("nets discount and scheme off the PO rate", () => {
    expect(poNetRate(pending({ rate: "200", discPct: "10", schPct: "5" }))).toBeCloseTo(171, 6);
  });
});

describe("grn.state — the lines", () => {
  it("Short = challan − received − damaged; Value = (received + damaged) × rate (Qt test G2)", () => {
    let draft = fillFromPo(withPo(), "po1").draft;
    const [a, b] = draft.lines;
    draft = editCell(draft, a.key, COL.Recd, "8");
    draft = editCell(draft, b.key, COL.Recd, "2");
    draft = editCell(draft, b.key, COL.Challan, "2");
    const [a2, b2] = draft.lines;
    expect(lineShort(a2)).toBe(2);
    expect(lineShort(b2)).toBe(0);
    expect(lineValue(a2) + lineValue(b2)).toBe(1520);
    expect(computeTotals(draft)).toEqual({ lines: 2, qty: 10, value: 1520, short: 2 });
  });

  it("Received follows the Challan until it is typed", () => {
    let draft = createDraft(SCOPE, "2026-10-28");
    const key = draft.lines[0].key;
    draft = applyItem(draft, key, { itemId: "i", itemName: "I", uomId: "u", unitName: "Nos", mrp: 0 });
    draft = editCell(draft, key, COL.Challan, "6");
    expect(draft.lines[0].recd).toBe("6");
    draft = editCell(draft, key, COL.Challan, "7");
    expect(draft.lines[0].recd).toBe("6");
  });

  it("a blank challan means no short", () => {
    let draft = createDraft(SCOPE, "2026-10-28");
    const key = draft.lines[0].key;
    draft = applyItem(draft, key, { itemId: "i", itemName: "I", uomId: "u", unitName: "Nos", mrp: 12.5 });
    draft = editCell(draft, key, COL.Recd, "3");
    expect(lineShort(draft.lines[0])).toBe(0);
    expect(draft.lines[0].mrp).toBe("12.5");
    expect(draft.lines).toHaveLength(2);
  });

  it("opens the Barcode on a blank line only, and not the Item of a PO line", () => {
    const draft = fillFromPo(withPo(), "po1").draft;
    const [poLine, , blank] = draft.lines;
    expect(isCellEditable(draft, blank, COL.Barcode)).toBe(true);
    expect(isCellEditable(draft, blank, COL.Recd)).toBe(false);
    expect(isCellEditable(draft, poLine, COL.Barcode)).toBe(false);
    expect(isCellEditable(draft, poLine, COL.Item)).toBe(false);
    expect(isCellEditable(draft, poLine, COL.Recd)).toBe(true);
    expect(isCellEditable({ ...draft, viewMode: "browse" }, poLine, COL.Recd)).toBe(false);
  });

  it("normalises an expiry and flags one that is no date", () => {
    let draft = createDraft(SCOPE, "2026-10-28");
    const key = draft.lines[0].key;
    draft = applyItem(draft, key, { itemId: "i", itemName: "I", uomId: "u", unitName: "Nos", mrp: 0 });
    draft = editCell(draft, key, COL.Expiry, "31-12-2027");
    expect(draft.lines[0].expiry).toBe("31/12/2027");
    draft = editCell(draft, key, COL.Expiry, "31/13/2027");
    expect(draft.hint).toBe("Line 1: expiry must be dd/MM/yyyy.");
    draft = editCell(draft, key, COL.Recd, "1");
    draft = setGodown(setSupplier(draft, "s", "S"), "g", "G");
    expect(saveRefusal(draft)?.message).toBe("Line 1: expiry must be dd/MM/yyyy.");
  });

  it("removes a line and keeps one blank at the bottom", () => {
    const draft = fillFromPo(withPo(), "po1").draft;
    const next = removeLine(draft, draft.lines[0].key);
    expect(next.lines).toHaveLength(2);
    expect(rowHasItem(next.lines[1])).toBe(false);
  });
});

describe("grn.state — saving", () => {
  it("refuses a missing header or no lines", () => {
    const blank = createDraft(SCOPE, "2026-10-28");
    expect(saveRefusal(blank)?.focus).toBe("supplier");
    expect(saveRefusal(setSupplier(blank, "s", "S"))?.focus).toBe("godown");
    expect(saveRefusal(withPo())?.title).toBe("No lines");
    expect(saveRefusal({ ...withPo(), status: "POSTED", refno: "GRN/1" })?.title).toBe("Not a draft");
  });

  it("builds the Qt payload: PO link, challan, loadmen, allocations only with a batch or expiry", () => {
    let draft = fillFromPo(withPo(), "po1").draft;
    const [a, b] = draft.lines;
    draft = editCell(draft, a.key, COL.Recd, "8");
    draft = editCell(draft, a.key, COL.Dmg, "1");
    draft = editCell(draft, a.key, COL.Free, "1");
    draft = editCell(draft, a.key, COL.Batch, "B-01");
    draft = editCell(draft, a.key, COL.Expiry, "01/06/2027");
    draft = { ...draft, challanNo: " DC-9 ", vehicleNo: "TN01", loadmen: [{ id: "e1", text: "Ravi" }, { id: "e2", text: "Kumar" }] };
    const body = buildSavePayload(draft, true);
    expect(body.header).toMatchObject({
      companyId: "c1",
      branchId: "b1",
      accYear: "2026-2027",
      deviceId: "d1",
      supplierId: "sup1",
      godownId: "gd1",
      docDate: "2026-10-28",
      challanNo: "DC-9",
      vehicleNo: "TN01",
      receivedBy: ["e1", "e2"],
      post: true,
    });
    expect(body.header.grnId).toBeUndefined();
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0]).toEqual({
      lineNo: 1,
      itemId: "item-a",
      uomId: "uom-a",
      poItemId: "poi1",
      poItemAccYear: "2026-2027",
      challanQty: 10,
      receivedQty: 8,
      damagedQty: 1,
      freeQty: 1,
      rate: 90,
      allocs: [
        { bucket: "SALEABLE", batchNo: "B-01", expiryDate: "2027-06-01", qty: 8, freeQty: 1 },
        { bucket: "DAMAGED", batchNo: "B-01", expiryDate: "2027-06-01", qty: 1 },
      ],
    });
    expect(body.lines[1].allocs).toBeUndefined();
    expect(body.lines[1].mrp).toBe(450);
    expect(b.key).not.toBe(a.key);
  });
});

describe("grn.state — loading", () => {
  const payload: GrnPayload = {
    header: {
      grnId: "g1",
      grnRefno: "GRN/2026-2027/D14/00196",
      grnCompanyId: "c1",
      grnBranchId: "b1",
      grnAccYear: "2026-2027",
      grnDeviceId: "d9",
      grnSupplierId: "sup1",
      supplierName: "ZT-PUR Supplier",
      grnGodownId: "gd1",
      grnDocDate: "2026-10-27T00:00:00.000Z",
      grnChallanNo: "DC-1",
      grnChallanDate: null,
      grnVehicleNo: null,
      grnRemarks: null,
      grnStatus: "POSTED",
      grnOffbillCharges: "40.00",
      receivedBy: [{ id: "e1", name: "ZT Loadman Ravi" }],
      billStatus: "NOT_BILLED",
    },
    lines: [
      {
        griId: "l1",
        griItemId: "item-a",
        griUomId: "uom-a",
        itemName: "ZT-ITEM-A",
        unitName: "Nos",
        griSrcItemId: "poi1",
        griSrcDocYear: "2026-2027",
        poRefno: "PO/2026-2027/D14/00106",
        griChallanQty: "10.0000",
        griReceivedQty: "8.0000",
        griDamagedQty: "0.0000",
        griFreeQty: "0",
        griProvisionalRate: "90.0000",
        griMrp: null,
        allocs: [{ piaBatchNo: "B-01", piaExpiryDate: "2027-06-01T00:00:00.000Z" }],
      },
    ],
  };

  it("paints a posted GRN read-only, with no blank line, coolie and loadmen", () => {
    const draft = fromPayload(createDraft(SCOPE, "2026-10-28"), payload, { viewMode: "entry", deviceId: "d1" });
    expect(draft).toMatchObject({
      grnId: "g1",
      refno: "GRN/2026-2027/D14/00196",
      status: "POSTED",
      viewMode: "browse",
      docDate: "2026-10-27",
      deviceId: "d1",
      coolie: 40,
      billed: false,
      dirty: false,
      loadmen: [{ id: "e1", text: "ZT Loadman Ravi" }],
    });
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({
      recd: "8",
      challan: "10",
      dmg: "",
      poRef: "00106",
      batch: "B-01",
      expiry: "01/06/2027",
      lineId: "l1",
    });
    expect(lineShort(draft.lines[0])).toBe(2);
  });

  it("reopens a draft for entry with the trailing blank line", () => {
    const draft = fromPayload(
      createDraft(SCOPE, "2026-10-28"),
      { ...payload, header: { ...payload.header, grnStatus: "DRAFT", billStatus: "BILLED" } },
      { viewMode: "entry", deviceId: "" },
    );
    expect(draft.viewMode).toBe("entry");
    expect(draft.lines).toHaveLength(2);
    expect(draft.deviceId).toBe("d9");
    expect(draft.billed).toBe(true);
    // A re-save sends the line back on its PO link.
    expect(buildSavePayload(draft, false).header.grnId).toBe("g1");
    expect(buildSavePayload(draft, false).lines[0]).toMatchObject({ poItemId: "poi1", receivedQty: 8, rate: 90 });
  });
});

describe("grn.columns", () => {
  function row(no: number, over: Partial<UiTableColumnRow> = {}): UiTableColumnRow {
    return {
      uiTblClmId: `c${no}`,
      uiTblClmNo: String(no),
      uiTblClmName: `Col ${no}`,
      uiTblClmColumnWidth: 5,
      uiTblClmColumnVisibility: true,
      uiTblClmColumnFocus: false,
      uiTblClmColumnPosition: no,
      uiTblClmColumnNecessity: false,
      ...over,
    };
  }

  it("draws the Qt columns only, in layout order, hiding what the layout hides", () => {
    const layout = [
      ...Array.from({ length: 29 }, (_, no) => row(no)),
      row(COL.Unit, { uiTblClmColumnPosition: 99 }),
    ];
    layout[COL.Pending] = row(COL.Pending, { uiTblClmColumnVisibility: false });
    const columns = resolveGrnColumns(layout);
    expect(columns.map((column) => column.no)).not.toContain(COL.Pending);
    expect(columns.every((column) => column.no <= COL.Mrp)).toBe(true);
    expect(columns).toHaveLength(14);
    expect(columns.reduce((sum, column) => sum + column.widthPct, 0)).toBeCloseTo(100, 6);
  });

  it("falls back to the Qt titles without a layout", () => {
    const columns = resolveGrnColumns(undefined);
    expect(columns).toHaveLength(15);
    expect(columns[0].header).toBe("Barcode");
    expect(columns[COL.Short].header).toBe("Short");
  });
});
