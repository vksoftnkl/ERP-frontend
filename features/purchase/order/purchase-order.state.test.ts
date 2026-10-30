import { describe, expect, it } from "vitest";
import { resolvePoColumns } from "./purchase-order.columns";
import { COL, PO_COLUMN_NUMBERS } from "./purchase-order.constants";
import {
  amendProblem,
  applyCalc,
  applyItem,
  awaitingApproval,
  buildPayload,
  canCalculate,
  cancellable,
  createPoDraft,
  draftFromPayload,
  editLine,
  isEditable,
  isEnterStop,
  isPoWorthRemembering,
  mergeable,
  mergeChoices,
  pendingNote,
  removeLine,
  revisionRows,
  rowHasItem,
  saveProblem,
  shortClosable,
  startAmend,
  statusLabel,
  supplierEditable,
  totalsNotes,
  whyNotEditable,
} from "./purchase-order.state";
import type {
  PoDraft,
  PurchaseOrderItemLookup,
  PurchaseOrderPayload,
  PurchaseOrderPendingLine,
} from "./purchase-order.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };

function lookup(itemId: string, over: Partial<PurchaseOrderItemLookup> = {}): PurchaseOrderItemLookup {
  return { itemId, itemName: `Item ${itemId}`, uomId: `u-${itemId}`, unitName: "PCS", taxPerc: "18", mrp: "0", ...over };
}

/** A draft with a supplier and two keyed lines (Qt test P1: 10 × 100 less 10 %, 5 × 400). */
function keyed(): PoDraft {
  let draft = createPoDraft(SCOPE, "2026-10-28");
  draft = { ...draft, supplierId: "s1", supplierName: "ZT" };
  draft = applyItem(draft, draft.lines[0].key, lookup("a"), "ZT-ITEM-A");
  const first = draft.lines[0].key;
  draft = editLine(draft, first, COL.Qty, "10");
  draft = editLine(draft, first, COL.Rate, "100");
  draft = editLine(draft, first, COL.DiscPct, "10");
  draft = applyItem(draft, draft.lines[1].key, lookup("b", { unitName: "Bottle", mrp: "550" }), "");
  const second = draft.lines[1].key;
  draft = editLine(draft, second, COL.Qty, "5");
  draft = editLine(draft, second, COL.Rate, "400");
  return draft;
}

describe("purchase order — lines", () => {
  it("a pick lands the item, unit, GST % and MRP and keeps one blank line", () => {
    const draft = keyed();
    expect(draft.lines).toHaveLength(3);
    expect(rowHasItem(draft.lines[2])).toBe(false);
    expect(draft.lines[0].itemName).toBe("ZT-ITEM-A");
    expect(draft.lines[1].itemName).toBe("Item b");
    expect(draft.lines[1].unitName).toBe("Bottle");
    expect(draft.lines[1].mrp).toBe("550");
    expect(draft.lines[0].gstPct).toBe(18);
    expect(draft.dirty).toBe(true);
  });

  it("a typed cell that is not a number of its kind is refused", () => {
    const draft = keyed();
    const key = draft.lines[0].key;
    expect(editLine(draft, key, COL.Qty, "1.2345")).toBe(draft);
    expect(editLine(draft, key, COL.Rate, "abc")).toBe(draft);
    expect(editLine(draft, key, COL.Taxable, "5")).toBe(draft);
    expect(editLine(draft, key, COL.Qty, "12.5").lines[0].qty).toBe("12.5");
  });

  it("MRP is not in the arithmetic; qty is", () => {
    const draft = keyed();
    const key = draft.lines[0].key;
    expect(editLine(draft, key, COL.Mrp, "120").calcVersion).toBe(draft.calcVersion);
    expect(editLine(draft, key, COL.Qty, "11").calcVersion).toBe(draft.calcVersion + 1);
  });

  it("removing the last item line drops the totals", () => {
    let draft = keyed();
    draft = { ...draft, totals: { taxable: 1, tax: 1, net: 2 } };
    draft = removeLine(draft, draft.lines[0].key);
    expect(draft.totals).not.toBeNull();
    draft = removeLine(draft, draft.lines[0].key);
    expect(draft.totals).toBeNull();
    expect(draft.lines).toHaveLength(1);
  });

  it("Enter stops: Barcode / Item on a blank line, Qty / Rate / Disc % on a line", () => {
    const draft = keyed();
    const [line, , blank] = draft.lines;
    expect(isEnterStop(blank, COL.Barcode)).toBe(true);
    expect(isEnterStop(line, COL.Barcode)).toBe(false);
    expect(isEnterStop(line, COL.Qty)).toBe(true);
    expect(isEnterStop(line, COL.Free)).toBe(false);
    expect(isEnterStop(line, COL.DiscPct)).toBe(true);
    expect(whyNotEditable(draft, line, COL.Qty)).toBe("");
    expect(whyNotEditable(draft, line, COL.Item)).not.toBe("");
    expect(whyNotEditable(draft, blank, COL.Qty)).toBe("Pick the item first.");
  });
});

describe("purchase order — payload and figures", () => {
  it("builds the Qt payload: numbered lines, optional fields only when set", () => {
    const draft = { ...keyed(), expectedDate: "2026-11-05", contact: " Ravi ", remarks: "" };
    const { body, keysByLineNo } = buildPayload(draft, true);
    expect(body.header).toEqual({
      companyId: "c1",
      branchId: "b1",
      accYear: "2026-2027",
      deviceId: "d1",
      supplierId: "s1",
      docDate: "2026-10-28",
      expectedDate: "2026-11-05",
      contact: "Ravi",
      post: true,
    });
    expect(body.lines).toEqual([
      { lineNo: 1, itemId: "a", uomId: "u-a", qty: 10, rate: 100, discPct: 10 },
      { lineNo: 2, itemId: "b", uomId: "u-b", qty: 5, rate: 400, mrp: 550 },
    ]);
    expect(keysByLineNo.get(2)).toBe(draft.lines[1].key);
  });

  it("paints the server's figures on the lines they were asked for", () => {
    const draft = keyed();
    const { keysByLineNo } = buildPayload(draft, false);
    const painted = applyCalc(
      draft,
      {
        lines: [
          { key: "2", taxable: "2000", gstPct: "18", tax: "360", total: "2360" },
          { key: "1", taxable: "900.00", gstPct: "18", tax: "162", total: "1062" },
        ],
        totals: { taxable: "2900", tax: "522", net: "3422" },
      },
      keysByLineNo,
    );
    expect(painted.lines[0].taxable).toBe(900);
    expect(painted.lines[1].total).toBe(2360);
    expect(painted.totals).toEqual({ taxable: 2900, tax: 522, net: 3422 });
  });

  it("asks the server only with a supplier, a line and a device", () => {
    const draft = keyed();
    expect(canCalculate(draft)).toBe(true);
    expect(canCalculate({ ...draft, supplierId: "" })).toBe(false);
    expect(canCalculate({ ...draft, deviceId: "" })).toBe(false);
    expect(canCalculate(createPoDraft(SCOPE, "2026-10-28"))).toBe(false);
  });

  it("refuses to save without a supplier, a line or a qty", () => {
    const blank = createPoDraft(SCOPE, "2026-10-28");
    expect(saveProblem(blank)?.message).toBe("Pick the supplier.");
    expect(saveProblem({ ...blank, supplierId: "s1" })?.message).toBe("Add at least one item.");
    const draft = keyed();
    expect(saveProblem(draft)).toBeNull();
    const noQty = editLine(draft, draft.lines[1].key, COL.Qty, "");
    expect(saveProblem(noQty)?.message).toContain("Line 2");
  });
});

describe("purchase order — a stored PO", () => {
  const payload: PurchaseOrderPayload = {
    header: {
      poId: "po1",
      poCompanyId: "c1",
      poBranchId: "b1",
      poAccYear: "2026-2027",
      poRefno: "PO/2026-2027/D14/00107",
      poDocDate: "2026-10-27T00:00:00.000Z",
      poSupplierId: "s1",
      supplierName: "ZT-PUR Supplier",
      poExpectedDate: null,
      poDeliverGodownId: "g1",
      poContact: null,
      poRemarks: "rush",
      poTaxableAmt: "2900",
      poTaxAmt: "522",
      poNetAmt: "3422",
      poStatus: "POSTED",
      poIsShortClosed: false,
      poShortCloseReason: null,
      poApprovalStatus: "NOT_REQUIRED",
    },
    lines: [
      {
        poiId: "l1",
        poiLineNo: 1,
        poiItemId: "a",
        poiUomId: "u-a",
        poiQty: "10",
        poiFreeQty: "0",
        poiRate: "100.0000",
        poiDiscPct: "10",
        poiTaxableAmt: "900",
        poiGstPct: "18",
        poiCgstAmt: "81",
        poiSgstAmt: "81",
        poiIgstAmt: "0",
        poiCessAmt: "0",
        poiTotalAmt: "1062",
        poiMrp: null,
        itemName: "ZT-ITEM-A",
        unitName: "PCS",
        receivedQty: "8",
        pendingQty: "2",
      },
    ],
  };

  it("reads received / pending and the server's figures", () => {
    const draft = draftFromPayload(payload, { deviceId: "d1", godownId: "", godownName: "" }, "entry");
    expect(draft.status).toBe("POSTED");
    expect(draft.viewMode).toBe("browse");
    expect(draft.docDate).toBe("2026-10-27");
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]).toMatchObject({ qty: "10", rate: "100", discPct: "10", tax: 162, received: 8, pending: 2 });
    expect(draft.totals).toEqual({ taxable: 2900, tax: 522, net: 3422 });
    expect(statusLabel(draft)).toBe("CONFIRMED");
    // Goods came: no cancel, short-close yes.
    expect(cancellable(draft)).toBe(false);
    expect(shortClosable(draft)).toBe(true);
    expect(statusLabel({ ...draft, shortClosed: true })).toBe("SHORT-CLOSED");
  });

  it("a stored draft keeps a blank line and the godown name it already had", () => {
    const stored = { ...payload, header: { ...payload.header, poStatus: "DRAFT" } };
    const draft = draftFromPayload(stored, { deviceId: "d1", godownId: "g1", godownName: "Coimbatore" }, "entry");
    expect(draft.viewMode).toBe("entry");
    expect(draft.lines).toHaveLength(2);
    expect(draft.godownName).toBe("Coimbatore");
    expect(statusLabel(draft)).toBe("DRAFT");
  });
});

describe("purchase order — columns", () => {
  it("draws only the columns the screen knows, in the mockup's order with its titles (Qt applyColumns)", () => {
    const rows = [
      { uiTblClmId: "1", uiTblClmNo: "1", uiTblClmName: "Item", uiTblClmColumnWidth: 22, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 0, uiTblClmColumnNecessity: false },
      { uiTblClmId: "0", uiTblClmNo: "0", uiTblClmName: "Barcode", uiTblClmColumnWidth: 9, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 1, uiTblClmColumnNecessity: false },
      { uiTblClmId: "13", uiTblClmNo: "13", uiTblClmName: "MRP", uiTblClmColumnWidth: 6, uiTblClmColumnVisibility: false, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 13, uiTblClmColumnNecessity: false },
      { uiTblClmId: "14", uiTblClmNo: "14", uiTblClmName: "ItemId", uiTblClmColumnWidth: 0, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 14, uiTblClmColumnNecessity: false },
      { uiTblClmId: "40", uiTblClmNo: "40", uiTblClmName: "Later", uiTblClmColumnWidth: 5, uiTblClmColumnVisibility: true, uiTblClmColumnFocus: false, uiTblClmColumnPosition: 2, uiTblClmColumnNecessity: false },
    ];
    const columns = resolvePoColumns(rows);
    const numbers = columns.map((column) => column.no);
    expect(numbers).toEqual([...PO_COLUMN_NUMBERS]);
    expect(columns.find((column) => column.no === COL.Qty)?.header).toBe("Ordered");
    expect(numbers).not.toContain(COL.Taxable);
    expect(numbers).not.toContain(14);
    expect(numbers).not.toContain(40);
    expect(columns.reduce((sum, column) => sum + column.widthPct, 0)).toBeCloseTo(100);
  });
});

describe("purchase order — DOC-01 amend", () => {
  const confirmed: PurchaseOrderPayload = {
    header: {
      poId: "po9",
      poCompanyId: "c1",
      poBranchId: "b1",
      poAccYear: "2026-2027",
      poRefno: "PO/2026-2027/D14/00109",
      poDocDate: "2026-10-28",
      poSupplierId: "s1",
      supplierName: "ZT",
      poExpectedDate: null,
      poDeliverGodownId: null,
      poContact: null,
      poRemarks: null,
      poTaxableAmt: "1000",
      poTaxAmt: "180",
      poNetAmt: "1180",
      poStatus: "POSTED",
      poIsShortClosed: false,
      poShortCloseReason: null,
      poApprovalStatus: "APPROVED",
      poRevisionNo: 2,
      approvedBy: "admin",
    },
    lines: [
      {
        poiId: "l1",
        poiLineNo: 1,
        poiItemId: "a",
        poiUomId: "u-a",
        poiQty: "10",
        poiFreeQty: "0",
        poiRate: "100",
        poiDiscPct: "0",
        poiTaxableAmt: "1000",
        poiGstPct: "18",
        poiCgstAmt: "90",
        poiSgstAmt: "90",
        poiIgstAmt: "0",
        poiCessAmt: "0",
        poiTotalAmt: "1180",
        poiMrp: null,
        itemName: "A",
        unitName: "PCS",
        receivedQty: "4",
        pendingQty: "6",
      },
      {
        poiId: "l2",
        poiLineNo: 2,
        poiItemId: "b",
        poiUomId: "u-b",
        poiQty: "5",
        poiFreeQty: "0",
        poiRate: "20",
        poiDiscPct: "0",
        poiTaxableAmt: "100",
        poiGstPct: "18",
        poiCgstAmt: "9",
        poiSgstAmt: "9",
        poiIgstAmt: "0",
        poiCessAmt: "0",
        poiTotalAmt: "118",
        poiMrp: null,
        itemName: "B",
        unitName: "PCS",
        receivedQty: "0",
        pendingQty: "5",
      },
    ],
  };
  const loaded = () => draftFromPayload(confirmed, { deviceId: "d1", godownId: "", godownName: "" }, "browse");

  it("reads the revision and who approved it", () => {
    const draft = loaded();
    expect(draft.revisionNo).toBe(2);
    expect(draft.approvalStatus).toBe("APPROVED");
    expect(totalsNotes(draft)).toEqual(["Revision 2", "Approved by admin"]);
    expect(totalsNotes({ ...draft, revisionNo: 1, approvedBy: "" })).toEqual([]);
    expect(draft.amending).toBe(false);
    expect(isEditable(draft)).toBe(false);
  });

  it("opens a confirmed PO for change: a blank line, editable, figures asked again", () => {
    const draft = loaded();
    expect(amendProblem(draft)).toBe("");
    expect(amendProblem({ ...draft, shortClosed: true })).not.toBe("");
    expect(amendProblem(createPoDraft(SCOPE, "2026-10-28"))).not.toBe("");
    const amending = startAmend(draft);
    expect(amending.amending).toBe(true);
    expect(amending.viewMode).toBe("entry");
    expect(isEditable(amending)).toBe(true);
    expect(rowHasItem(amending.lines[amending.lines.length - 1])).toBe(false);
    expect(amending.hint).toContain("goods came on it");
    expect(canCalculate(amending)).toBe(true);
    expect(statusLabel(amending)).toBe("AMENDING");
    // Nothing else is offered mid-amendment.
    expect(cancellable(amending)).toBe(false);
    expect(shortClosable(amending)).toBe(false);
    expect(mergeable(amending)).toBe(false);
    // Goods came: the supplier is fixed, and the line goods came against cannot go.
    expect(supplierEditable(amending)).toBe(false);
    const refused = removeLine(amending, amending.lines[0].key);
    expect(refused.lines).toHaveLength(amending.lines.length);
    expect(refused.hint).toContain("Line 1");
    const removed = removeLine(amending, amending.lines[1].key);
    expect(removed.lines.some((line) => line.lineId === "l2")).toBe(false);
    expect(isPoWorthRemembering(removed)).toBe(true);
  });

  it("the amendment's payload keeps line ids, confirms again and carries the reason", () => {
    let draft = startAmend(loaded());
    draft = editLine(draft, draft.lines[0].key, COL.Qty, "12");
    draft = applyItem(draft, draft.lines[2].key, lookup("c"), "C");
    const { body } = buildPayload(draft, false, " supplier revised the rate ");
    expect(body.header.poId).toBe("po9");
    expect(body.header.post).toBe(true);
    expect(body.header.amendReason).toBe("supplier revised the rate");
    expect(body.lines.map((line) => line.lineId)).toEqual(["l1", "l2", undefined]);
    expect(body.lines[0].qty).toBe(12);
    // A blank reason is left out; a draft never carries one.
    expect(buildPayload(draft, true, "  ").body.header.amendReason).toBeUndefined();
    expect(buildPayload(keyed(), false, "why").body.header.amendReason).toBeUndefined();
  });

  it("says AWAITING APPROVAL / NOT APPROVED on a confirmed PO", () => {
    const draft = loaded();
    const waiting = { ...draft, approvalStatus: "AWAITING" };
    expect(statusLabel(waiting)).toBe("CONFIRMED · AWAITING APPROVAL");
    expect(awaitingApproval(waiting)).toBe(true);
    expect(awaitingApproval({ ...waiting, amending: true })).toBe(false);
    expect(statusLabel({ ...draft, approvalStatus: "REJECTED" })).toBe("CONFIRMED · NOT APPROVED");
    expect(statusLabel({ ...draft, approvalStatus: "NOT_REQUIRED" })).toBe("CONFIRMED");
    expect(whyNotEditable(draft, draft.lines[0], COL.Qty)).toContain("Amend");
  });
});

describe("purchase order — DOC-01 merge / pending / versions", () => {
  const pending = (poId: string, refno: string, lineNo: number): PurchaseOrderPendingLine => ({
    poId,
    accYear: "2026-2027",
    refno,
    docDate: "2026-10-27T00:00:00.000Z",
    poiId: `${poId}-${lineNo}`,
    lineNo,
    itemId: "a",
    itemName: "A",
    uomId: "u-a",
    unitName: "PCS",
    rate: "10",
    pendingQty: "2",
    orderedQty: "5",
  });

  it("one choice per PO, in the server's order, with its pending line count", () => {
    const rows = [pending("p1", "PO/1", 1), pending("p1", "PO/1", 2), pending("p2", "PO/2", 1)];
    const choices = mergeChoices(rows);
    expect(choices.map((choice) => choice.key)).toEqual(["p1|2026-2027", "p2|2026-2027"]);
    expect(choices[0].label).toBe("PO/1 · 27/10/2026 — 2 lines pending");
    expect(choices[1].label).toBe("PO/2 · 27/10/2026 — 1 line pending");
  });

  it("a new PO says how many confirmed orders the supplier has pending", () => {
    expect(pendingNote([])).toBe("");
    expect(pendingNote([pending("p1", "PO/1", 1), pending("p1", "PO/1", 2)])).toContain("1 confirmed order pending");
    expect(pendingNote([pending("p1", "PO/1", 1), pending("p2", "PO/2", 1)])).toContain("2 confirmed orders pending — Merge…");
  });

  it("Merge… is offered on a new draft with a supplier or on a confirmed PO", () => {
    const fresh = { ...createPoDraft(SCOPE, "2026-10-28"), supplierId: "s1" };
    expect(mergeable(fresh)).toBe(true);
    expect(mergeable({ ...fresh, supplierId: "" })).toBe(false);
    expect(mergeable({ ...fresh, poId: "saved" })).toBe(false);
    expect(mergeable({ ...fresh, poId: "saved", status: "POSTED" })).toBe(true);
    expect(mergeable({ ...fresh, poId: "saved", status: "CANCELLED" })).toBe(false);
  });

  it("versions read the value and lines the PO had after each save", () => {
    const rows = revisionRows([
      {
        revNo: 3,
        savedOn: "2026-10-28T10:00:00.000Z",
        action: "update",
        notes: "Amended (revision 2) — rate",
        savedBy: "admin",
        before: null,
        after: { header: { poNetAmt: "2360.00" } as PurchaseOrderPayload["header"], lines: [{}, {}] as PurchaseOrderPayload["lines"] },
      },
      { revNo: "1", savedOn: null, action: null, notes: null, savedBy: null, before: null, after: null },
    ]);
    expect(rows[0]).toEqual({
      revNo: 3,
      savedOn: "2026-10-28T10:00:00.000Z",
      by: "admin",
      what: "Amended (revision 2) — rate",
      lines: 2,
      value: 2360,
    });
    expect(rows[1]).toMatchObject({ revNo: 1, lines: 0, value: 0 });
  });
});
