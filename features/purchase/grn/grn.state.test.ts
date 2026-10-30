import { describe, expect, it } from "vitest";
import { resolveGrnColumns } from "./grn.columns";
import { COL } from "./grn.constants";
import { grnScreenKey } from "./grn.keys";
import {
  allocNeedOf,
  allocRefusal,
  applyItem,
  applyPendingLines,
  buildSavePayload,
  cellReadOnlyWhy,
  computeTotals,
  createDraft,
  editCell,
  fillFromPo,
  fromPayload,
  hiddenColumns,
  isCellEditable,
  lineShort,
  lineValue,
  poNetRate,
  poFieldText,
  poPickerChoices,
  poPickerRefusal,
  fillFromPos,
  removeLine,
  rowHasItem,
  saveRefusal,
  seedAllocs,
  setExcessAction,
  setGodown,
  setLineAllocs,
  setRules,
  setSignature,
  setSupplier,
  setTextileChoice,
  splitLabel,
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

function withPoRules(rules: { autoBatchNo: boolean; priceAtGrn: boolean }): GrnDraft {
  return setRules(withPo(), rules);
}

/** A textile GRN (auto batch no) with one batch-tracked item line: 6 received, 2 damaged, 1 free. */
function textileLine(): { draft: GrnDraft; key: string } {
  let draft = setGodown(setSupplier(createDraft(SCOPE, "2026-10-28", { autoBatchNo: true, priceAtGrn: false }), "sup1", "S"), "gd1", "Main");
  const key = draft.lines[0].key;
  draft = applyItem(draft, key, { itemId: "shirt", itemName: "SHIRT", uomId: "pcs", unitName: "Pcs", mrp: 0, signature: "b" });
  draft = editCell(draft, key, COL.Recd, "6");
  draft = editCell(draft, key, COL.Dmg, "2");
  draft = editCell(draft, key, COL.Free, "1");
  draft = editCell(draft, key, COL.Rate, "250");
  return { draft, key };
}

describe("grn.state — Against PO", () => {
  it("lists one choice per PO with its pending line count, multi-PO (Qt openPoPicker)", () => {
    const choices = poPickerChoices(withPo());
    expect(choices.map((choice) => choice.id)).toEqual(["po1", "po2"]);
    expect(choices[0].text).toBe("PO/2026-2027/D14/00106 · 20/10/2026  (2 lines pending)");
    expect(choices[1].text).toContain("(1 line pending)");
    expect(choices.every((choice) => !choice.done)).toBe(true);
    const after = fillFromPo(withPo(), "po1").draft;
    expect(poPickerChoices(after)[0].done).toBe(true);
  });

  it("From PO shows the POs on the GRN, else how many are open (Qt refreshPoChoice)", () => {
    expect(poFieldText(withPo(), false)).toBe("— without PO —   (2 open · Ctrl+L)");
    const none = applyPendingLines(setSupplier(createDraft(SCOPE, "2026-10-28"), "sup1", "S"), "sup1", []);
    expect(poFieldText(none, false)).toBe("— no open PO —");
    expect(poFieldText(createDraft(SCOPE, "2026-10-28"), false)).toBe("");
    expect(poPickerRefusal(createDraft(SCOPE, "2026-10-28"))).toContain("Pick the supplier first");
    const both = fillFromPos(withPo(), ["po1", "po2"]);
    expect(both.added).toBe(3);
    expect(poFieldText(both.draft, false)).toBe("PO/2026-2027/D14/00106, 00107");
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
    expect(a).toMatchObject({ recd: "10", challan: "10", pending: "10", rate: "90.00", poRef: "PO/2026-2027/D14/00106", poItemId: "poi1", unitName: "Nos" });
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
    draft = editCell(draft, key, COL.Expiry, "31/12/2027");
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
      poRef: "PO/2026-2027/D14/00106",
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
  it("draws the mockup's columns in its order with Qt's titles; PO and Value stay hidden", () => {
    const columns = resolveGrnColumns(hiddenColumns(createDraft(SCOPE, "2026-10-28")));
    expect(columns.map((column) => column.header)).toEqual([
      "Barcode", "Item", "Unit", "PO pend.", "Challan", "Received", "Dmg", "Dmg reason", "Free", "Short",
      "Prov. rate", "Batch / Serial", "Expiry", "MRP", "Shelf life", "Labels", "Check",
    ]);
    expect(columns.map((column) => column.no)).not.toContain(COL.PoRef);
    expect(columns.map((column) => column.no)).not.toContain(COL.Value);
    expect(columns.reduce((sum, column) => sum + column.widthPct, 0)).toBeCloseTo(100, 6);
  });

  it("shows Size / Colour / Model, Sell A–D by the settings and Excess only once a line came over (Qt anyExcess)", () => {
    const draft = setRules(createDraft(SCOPE, "2026-10-28"), { autoBatchNo: true, priceAtGrn: true });
    expect([...hiddenColumns(draft)].sort((a, b) => a - b)).toEqual([COL.Excess, COL.ExcessAct]);
    let po = fillFromPo(withPoRules({ autoBatchNo: false, priceAtGrn: false }), "po1").draft;
    expect(hiddenColumns(po).has(COL.Excess)).toBe(true);
    po = { ...po, lines: po.lines.map((line, index) => (index === 0 ? { ...line, excess: "2" } : line)) };
    expect(hiddenColumns(po).has(COL.Excess)).toBe(false);
    const titles = resolveGrnColumns(hiddenColumns(po)).map((column) => column.header);
    expect(titles.indexOf("Excess")).toBe(titles.indexOf("Short") + 1);
    // Textile re-weights Model / Batch (Qt applyColumns).
    const textile = resolveGrnColumns(hiddenColumns(draft), true);
    const width = (no: number) => textile.find((column) => column.no === no)!.widthPct;
    expect(width(COL.Model)).toBeCloseTo(width(COL.Batch), 6);
    expect(textile.map((column) => column.header).slice(11, 15)).toEqual(["Model / design", "Size", "Colour", "Batch / Serial"]);
  });
});

describe("grn.state — textile (Qt 85cab40)", () => {
  it("opens Size / Colour / Model on a batch-tracked line only, and only while Batch is blank", () => {
    const { draft, key } = textileLine();
    const line = draft.lines.find((candidate) => candidate.key === key)!;
    expect(line.signature).toBe("B");
    for (const column of [COL.Size, COL.Colour, COL.Model]) {
      expect(isCellEditable(draft, line, column)).toBe(true);
    }
    const plain = setSignature(
      applyItem(draft, key, { itemId: "soap", itemName: "SOAP", uomId: "nos", unitName: "Nos", mrp: 0, signature: "" }),
      key,
      "soap",
      "",
    );
    const soap = plain.lines.find((candidate) => candidate.key === key)!;
    expect(isCellEditable(plain, soap, COL.Size)).toBe(false);
    expect(cellReadOnlyWhy(plain, soap, COL.Size)).toContain("Waiting");
    // Off when the company does not number its own batches.
    const off = setRules(draft, { autoBatchNo: false, priceAtGrn: false });
    expect(isCellEditable(off, off.lines[0], COL.Model)).toBe(false);
  });

  it("a typed batch clears size / colour / model and says so", () => {
    const fixture = textileLine();
    const key = fixture.key;
    let draft = fixture.draft;
    draft = setTextileChoice(draft, key, "sizeId", "sz-m");
    draft = editCell(draft, key, COL.Model, "  Polo   21 ");
    expect(draft.lines[0]).toMatchObject({ sizeId: "sz-m", model: "Polo 21" });
    draft = editCell(draft, key, COL.Batch, "LOT-9");
    expect(draft.lines[0]).toMatchObject({ batch: "LOT-9", sizeId: "", colourId: "", model: "" });
    expect(draft.hint).toContain("a typed batch carries no size / colour / model");
    expect(isCellEditable(draft, draft.lines[0], COL.Size)).toBe(false);
  });

  it("sends size / colour / model on the row's allocation rows, batch left to Post", () => {
    const fixture = textileLine();
    const key = fixture.key;
    let draft = fixture.draft;
    draft = setTextileChoice(draft, key, "sizeId", "sz-m");
    draft = setTextileChoice(draft, key, "colourId", "cl-red");
    draft = editCell(draft, key, COL.Model, "Polo");
    const line = buildSavePayload(draft, false).lines[0];
    expect(line.allocs).toEqual([
      { bucket: "SALEABLE", sizeId: "sz-m", colourId: "cl-red", model: "Polo", qty: 6, freeQty: 1 },
      { bucket: "DAMAGED", sizeId: "sz-m", colourId: "cl-red", model: "Polo", qty: 2 },
    ]);
  });

  it("learns the signature only while the line holds that item, without dirtying", () => {
    const { draft, key } = textileLine();
    const clean = { ...draft, dirty: false };
    expect(setSignature(clean, key, "other-item", "R")).toBe(clean);
    const next = setSignature(clean, key, "shirt", "br");
    expect(next.lines[0].signature).toBe("BR");
    expect(next.dirty).toBe(false);
  });
});

describe("grn.state — F12 batches / serials (Qt openAllocs / setLineAllocs)", () => {
  const names = { size: (id: string) => (id === "sz-m" ? "M" : "…"), colour: () => "Red" };

  it("needs an item line with a qty", () => {
    const draft = createDraft(SCOPE, "2026-10-28");
    expect(allocRefusal(draft, draft.lines[0])).toBe("Put the cursor on an item line, then F12.");
    const fixture = textileLine();
    const key = fixture.key;
    let textile = fixture.draft;
    textile = editCell(editCell(editCell(textile, key, COL.Recd, "0"), key, COL.Dmg, "0"), key, COL.Free, "0");
    expect(allocRefusal(textile, textile.lines[0])).toBe("Line 1: key the qty first.");
  });

  it("says what the rows must add up to", () => {
    const { draft } = textileLine();
    expect(allocNeedOf(draft, draft.lines[0])).toEqual({
      received: 6,
      damaged: 2,
      free: 1,
      serial: false,
      textile: true,
      godownId: "gd1",
      godownName: "Main",
    });
  });

  it("seeds from what is typed on the row: one SALEABLE row + its DAMAGED twin", () => {
    const fixture = textileLine();
    const key = fixture.key;
    let draft = fixture.draft;
    expect(seedAllocs(draft, draft.lines[0], names)).toEqual([]);
    draft = setTextileChoice(draft, key, "sizeId", "sz-m");
    expect(seedAllocs(draft, draft.lines[0], names)).toEqual([
      { sizeId: "sz-m", sizeName: "M", bucket: "SALEABLE", qty: 6, freeQty: 1 },
      { sizeId: "sz-m", sizeName: "M", bucket: "DAMAGED", qty: 2 },
    ]);
  });

  it("keeps several rows as the line's split, sends them in the GRN's godown unless one names another", () => {
    const fixture = textileLine();
    const key = fixture.key;
    let draft = fixture.draft;
    draft = setLineAllocs(draft, key, [
      { bucket: "SALEABLE", sizeId: "sz-s", qty: 3, freeQty: 1 },
      { bucket: "SALEABLE", sizeId: "sz-m", qty: 3, godownId: "gd2", godownName: "Back store" },
      { bucket: "DAMAGED", sizeId: "sz-m", qty: 2 },
    ]);
    const line = draft.lines[0];
    expect(line.allocs).toHaveLength(3);
    expect(splitLabel(line)).toBe("3 batches (F12)");
    expect(isCellEditable(draft, line, COL.Batch)).toBe(false);
    expect(isCellEditable(draft, line, COL.Expiry)).toBe(false);
    expect(isCellEditable(draft, line, COL.Size)).toBe(false);
    expect(cellReadOnlyWhy(draft, line, COL.Batch)).toContain("F12");
    // Reopened: the split comes back as it is.
    expect(seedAllocs(draft, line, names)).toEqual(line.allocs);
    expect(buildSavePayload(draft, false).lines[0].allocs).toEqual([
      { bucket: "SALEABLE", sizeId: "sz-s", qty: 3, freeQty: 1, godownId: "gd1" },
      { bucket: "SALEABLE", sizeId: "sz-m", qty: 3, godownId: "gd2" },
      { bucket: "DAMAGED", sizeId: "sz-m", qty: 2, godownId: "gd1" },
    ]);
    // A qty change on a split line names F12.
    draft = editCell(draft, key, COL.Recd, "7");
    expect(draft.hint).toBe("Line 1: the qty changed — open F12 and make the batches add up again.");
  });

  it("folds one SALEABLE row (+ its DAMAGED twin) back onto the row", () => {
    const fixture = textileLine();
    const key = fixture.key;
    let draft = fixture.draft;
    draft = setLineAllocs(draft, key, [
      { bucket: "SALEABLE", batchNo: "B-7", expiryDate: "2027-03-31", mrp: 499, qty: 6, freeQty: 1 },
      { bucket: "DAMAGED", batchNo: "B-7", expiryDate: "2027-03-31", mrp: 499, qty: 2 },
    ]);
    expect(draft.lines[0]).toMatchObject({ allocs: [], batch: "B-7", expiry: "31/03/2027", mrp: "499" });
  });

  it("does not fold serials, a mfg date, or a row sent to another godown", () => {
    const { draft, key } = textileLine();
    const serials = setLineAllocs(draft, key, [{ bucket: "SALEABLE", serialNo: "SN1", qty: 1 }]);
    expect(serials.lines[0].allocs).toHaveLength(1);
    expect(splitLabel(serials.lines[0])).toBe("1 serial (F12)");
    const mfg = setLineAllocs(draft, key, [{ bucket: "SALEABLE", batchNo: "B", mfgDate: "2026-01-01", qty: 6 }]);
    expect(mfg.lines[0].allocs).toHaveLength(1);
    const away = setLineAllocs(draft, key, [{ bucket: "SALEABLE", qty: 6, godownId: "gd2" }]);
    expect(away.lines[0].allocs).toHaveLength(1);
    const home = setLineAllocs(draft, key, [{ bucket: "SALEABLE", qty: 6, godownId: "gd1" }]);
    expect(home.lines[0].allocs).toHaveLength(0);
  });

  it("rebuilds the split from the stored rows on load", () => {
    const { draft } = textileLine();
    const loaded = fromPayload(
      { ...draft, godownId: "gd1" },
      {
        header: {
          grnId: "g9",
          grnRefno: "GRN/9",
          grnCompanyId: "c1",
          grnBranchId: "b1",
          grnAccYear: "2026-2027",
          grnSupplierId: "sup1",
          grnGodownId: "gd1",
          grnDocDate: "2026-10-28",
          grnStatus: "POSTED",
        },
        lines: [
          {
            griId: "l9",
            griItemId: "shirt",
            griUomId: "pcs",
            griReceivedQty: "6",
            griProvisionalRate: "250",
            allocs: [
              { piaGodownId: "gd1", piaBucket: "SALEABLE", piaBatchNo: "TX0001", piaSizeId: "sz-s", piaQty: "3.0000" },
              { piaGodownId: "gd1", piaBucket: "SALEABLE", piaBatchNo: "TX0002", piaSizeId: "sz-m", piaQty: "3.0000", piaMrp: "0" },
            ],
          },
          {
            griId: "l10",
            griItemId: "soap",
            griUomId: "nos",
            griReceivedQty: "4",
            griProvisionalRate: "10",
            allocs: [{ piaGodownId: "gd1", piaBucket: "SALEABLE", piaBatchNo: "S-1", piaSizeId: "sz-m", piaColourId: "cl", piaModel: "M1", piaQty: "4" }],
          },
        ],
      },
      { viewMode: "browse", deviceId: "d1" },
    );
    expect(loaded.lines[0].allocs).toEqual([
      { godownId: "gd1", bucket: "SALEABLE", batchNo: "TX0001", sizeId: "sz-s", qty: 3 },
      { godownId: "gd1", bucket: "SALEABLE", batchNo: "TX0002", sizeId: "sz-m", qty: 3 },
    ]);
    expect(loaded.lines[0].batch).toBe("");
    expect(loaded.lines[1]).toMatchObject({ allocs: [], batch: "S-1", sizeId: "sz-m", colourId: "cl", model: "M1" });
  });
});

describe("grn.state — Excess and Sell A–D (Qt 6e025ef / 40c8b2c)", () => {
  it("opens Excess action on a PO line, and Excess itself only for RETURN", () => {
    let draft = fillFromPo(withPo(), "po1").draft;
    const po = draft.lines[0];
    expect(isCellEditable(draft, po, COL.ExcessAct)).toBe(true);
    expect(isCellEditable(draft, po, COL.Excess)).toBe(false);
    draft = setExcessAction(draft, po.key, "RETURN");
    expect(draft.hint).toContain("Excess");
    expect(isCellEditable(draft, draft.lines[0], COL.Excess)).toBe(true);
    draft = editCell(draft, po.key, COL.Excess, "2");
    draft = setExcessAction(draft, draft.lines[1].key, "KEEP_FREE");
    const [first, second] = buildSavePayload(draft, false).lines;
    expect(first).toMatchObject({ excessAction: "RETURN", excessQty: 2 });
    expect(second).toMatchObject({ excessAction: "KEEP_FREE" });
    expect(second).not.toHaveProperty("excessQty");
    // A line without a PO has no excess.
    let direct = setGodown(setSupplier(createDraft(SCOPE, "2026-10-28"), "sup1", "S"), "gd1", "Main");
    direct = applyItem(direct, direct.lines[0].key, { itemId: "x", itemName: "X", uomId: "u", unitName: "Nos", mrp: 0 });
    expect(isCellEditable(direct, direct.lines[0], COL.ExcessAct)).toBe(false);
    expect(setExcessAction(direct, direct.lines[0].key, "RETURN")).toBe(direct);
  });

  it("sends Sell A–D only when the GRN sets prices", () => {
    let draft = fillFromPo(withPoRules({ autoBatchNo: false, priceAtGrn: true }), "po1").draft;
    const key = draft.lines[0].key;
    expect(isCellEditable(draft, draft.lines[0], COL.SellA)).toBe(true);
    draft = editCell(draft, key, COL.SellA, "120");
    draft = editCell(draft, key, COL.SellD, "99.5");
    expect(buildSavePayload(draft, false).lines[0]).toMatchObject({ sellA: 120, sellD: 99.5 });
    expect(buildSavePayload(draft, false).lines[0]).not.toHaveProperty("sellB");
    const off = setRules(draft, { autoBatchNo: false, priceAtGrn: false });
    expect(buildSavePayload(off, false).lines[0]).not.toHaveProperty("sellA");
    expect(isCellEditable(off, off.lines[0], COL.SellA)).toBe(false);
  });

  it("loads Sell A–D and the excess the server kept", () => {
    const draft = fromPayload(
      createDraft(SCOPE, "2026-10-28"),
      {
        header: {
          grnId: "g2",
          grnRefno: "GRN/2",
          grnCompanyId: "c1",
          grnBranchId: "b1",
          grnAccYear: "2026-2027",
          grnSupplierId: "sup1",
          grnGodownId: "gd1",
          grnDocDate: "2026-10-28",
          grnStatus: "DRAFT",
        },
        lines: [
          {
            griId: "l1",
            griItemId: "a",
            griUomId: "u",
            griSrcItemId: "poi1",
            griReceivedQty: "12",
            griProvisionalRate: "90",
            griSellA: "120.00",
            griSellB: "115.00",
            griSellC: null,
            griSellD: "0",
            griExcessQty: "2.000000",
            griExcessAction: "HOLD_FOR_BILL",
          },
        ],
      },
      { viewMode: "entry", deviceId: "d1" },
    );
    expect(draft.lines[0]).toMatchObject({ sellA: "120", sellB: "115", sellC: "", sellD: "", excess: "2", excessAction: "HOLD_FOR_BILL" });
  });
});

describe("grn.keys — F12 and Ctrl+A", () => {
  const key = (over: Partial<KeyboardEvent>) =>
    ({ key: "", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, defaultPrevented: false, ...over }) as KeyboardEvent;

  it("F12 opens the batches; Ctrl+A the attachments, but not in a field being typed in", () => {
    expect(grnScreenKey(key({ key: "F12" }), { overlayOpen: false, typingTarget: true })).toEqual({ action: "allocs", swallow: true });
    expect(grnScreenKey(key({ key: "a", ctrlKey: true }), { overlayOpen: false, typingTarget: false })).toEqual({ action: "attach", swallow: true });
    expect(grnScreenKey(key({ key: "a", ctrlKey: true }), { overlayOpen: false, typingTarget: true }).action).toBeNull();
    expect(grnScreenKey(key({ key: "F12" }), { overlayOpen: true, typingTarget: false }).action).toBeNull();
    expect(grnScreenKey(key({ key: "F12", repeat: true }), { overlayOpen: false, typingTarget: false })).toEqual({ action: null, swallow: true });
  });
});
