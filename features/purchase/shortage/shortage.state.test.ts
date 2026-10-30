import { describe, expect, it } from "vitest";
import {
  allocBlocker,
  allocSeed,
  applyOpenRows,
  batchCellText,
  buildSavePayload,
  clearTicks,
  closedNotice,
  closeTargets,
  computeTotals,
  createDraft,
  draftFromPayload,
  editAnswer,
  editLine,
  fromText,
  isEditable,
  isFresh,
  lineProblems,
  mergeFacts,
  outcomeChips,
  pillOf,
  receivedAtOf,
  refusalIssues,
  saveBlocker,
  setActive,
  setHeader,
  setLineAllocs,
  setReceive,
  setReceivedAt,
  setSignature,
  setSupplier,
  setTicked,
  stepEndNotice,
  stripCells,
  titleText,
  toggleTick,
  totalsText,
} from "./shortage.state";
import { shortRef } from "../shared/purchase.format";
import type { OpenShortageRow, ShortageReceiptPayload } from "./shortage.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };
const NOW = new Date(2026, 9, 29, 19, 23);

function openRow(over: Partial<OpenShortageRow> = {}): OpenShortageRow {
  return {
    shortageId: "s1",
    accYear: "2026-2027",
    supplierId: "sup1",
    supplierName: "ZT",
    itemId: "i1",
    itemName: "ZT-ITEM-A",
    unitName: "PCS",
    uomId: "u1",
    reason: "SHORT_BILL",
    reasonText: "Short on bill",
    srcRefno: "PUR/2026-2027/D14/00623",
    srcDocType: "PURCHASE_BILL",
    srcDocDate: "2026-10-29",
    srcLineNo: 1,
    ageDays: 0,
    qtyBase: "3",
    received: "0",
    closed: "0",
    closedByCn: "0",
    closedByClaim: "0",
    writtenOffQty: "0",
    openQty: "3",
    value: "300",
    gst: "54",
    openValue: "300",
    openGst: "54",
    costRate: "100.000000",
    gstPending: true,
    batchNo: null,
    expiryDate: null,
    mrp: null,
    status: "OPEN",
    lastAction: null,
    ...over,
  };
}

function freshWithRows() {
  const draft = setSupplier(createDraft(SCOPE, "2026-10-29", NOW), "sup1", "ZT-PUR Supplier");
  return applyOpenRows({ ...draft, godownId: "g1", godownName: "Coimbatore" }, [
    openRow(),
    openRow({
      shortageId: "s2",
      itemName: "MRP STOCK ITEM",
      qtyBase: "2",
      openQty: "2",
      gst: "12",
      openGst: "12",
      costRate: "50",
      srcLineNo: 2,
      batchNo: "ZTSQ-2350",
      expiryDate: "2027-06-30",
      mrp: "80.00",
    }),
    openRow({ shortageId: "s3", itemName: "ZZ TEST R (SERIAL)", qtyBase: "2", openQty: "2", gst: "36", openGst: "36", srcLineNo: null }),
  ]);
}

describe("shortage receipt — rows", () => {
  it("From is the short refno with the source line (refno alone without one)", () => {
    expect(shortRef("PUR/2026-2027/D14/00623")).toBe("PUR/…/00623");
    expect(fromText("PUR/2026-2027/D14/00623", 2)).toBe("PUR/…/00623 · line 2");
    expect(fromText("PUR/2026-2027/D14/00623", null)).toBe("PUR/…/00623");
    const draft = freshWithRows();
    expect(draft.lines.map((line) => line.from)).toEqual(["PUR/…/00623 · line 1", "PUR/…/00623 · line 2", "PUR/…/00623"]);
    expect(draft.lines[0].fromTip).toBe("PUR/2026-2027/D14/00623 (purchase bill)");
  });

  it("one row per open shortage: date, age, why, figures, GST held, outcome", () => {
    const [a, b] = freshWithRows().lines;
    expect(a).toMatchObject({ srcDate: "29/10/2026", ageDays: 0, why: "Short on bill", shortQty: 3, openQty: 3, cost: 100, gstHeld: 54, ticked: false });
    expect(a.gstPerUnit).toBe(18);
    expect(b).toMatchObject({ batch: "ZTSQ-2350", expiry: "30/06/2027", mrp: 80 });
    expect(outcomeChips(a)).toEqual([{ text: "Supplier sends", tone: "info" }]);
    const replace = applyOpenRows(freshWithRows(), [openRow({ reason: "REPLACE", status: "PART", gstPending: false })]).lines[0];
    expect(outcomeChips(replace)).toEqual([
      { text: "Replacement", tone: "success" },
      { text: "PART", tone: "warning" },
    ]);
    expect(replace.gstHeld).toBeNull();
    expect(replace.gstPerUnit).toBe(0);
  });

  it("a tick receives the open qty; untick drops it; typing a qty ticks, 0 unticks", () => {
    let draft = toggleTick(freshWithRows(), "s1");
    expect(draft.lines[0]).toMatchObject({ ticked: true, receive: "3" });
    draft = setReceive(draft, "s1", "2");
    expect(draft.lines[0]).toMatchObject({ ticked: true, receive: "2" });
    draft = setTicked(draft, "s1", false);
    expect(draft.lines[0]).toMatchObject({ ticked: false, receive: "" });
    draft = setReceive(draft, "s2", "1");
    expect(draft.lines[1]).toMatchObject({ ticked: true, receive: "1" });
    draft = setReceive(draft, "s2", "0");
    expect(draft.lines[1]).toMatchObject({ ticked: false, receive: "" });
  });

  it("keeps what was ticked / typed / split on rows still open when the list is read again", () => {
    let draft = setReceive(freshWithRows(), "s1", "2");
    draft = editLine(draft, "s1", { batch: "B7" });
    draft = setSignature(draft, "s1", "B");
    const again = applyOpenRows(draft, [openRow()]);
    expect(again.lines).toHaveLength(1);
    expect(again.lines[0]).toMatchObject({ ticked: true, receive: "2", batch: "B7", signature: "B" });
  });

  it("drops the rows when the supplier changes", () => {
    const changed = setSupplier(freshWithRows(), "sup2", "Other");
    expect(changed.lines).toEqual([]);
    expect(changed.dirty).toBe(true);
  });
});

describe("shortage receipt — F12", () => {
  it("opens only on a ticked row with a qty", () => {
    const draft = freshWithRows();
    expect(allocBlocker(draft, null, -1)).toBe("Put the cursor on a shortage row, then F12.");
    expect(allocBlocker(draft, draft.lines[0], 0)).toBe("Line 1: tick it (Space) or type Receive now first.");
    const ticked = toggleTick(draft, "s1");
    expect(allocBlocker(ticked, ticked.lines[0], 0)).toBe("");
  });

  it("seeds from the row's own batch / expiry / MRP; a serial item starts empty", () => {
    let draft = toggleTick(freshWithRows(), "s2");
    expect(allocSeed(draft.lines[1])).toEqual([{ bucket: "SALEABLE", qty: 2, batchNo: "ZTSQ-2350", expiryDate: "2027-06-30", mrp: 80 }]);
    draft = setSignature(toggleTick(draft, "s3"), "s3", "R");
    expect(allocSeed(draft.lines[2])).toEqual([]);
    expect(batchCellText(draft.lines[2], true)).toBe("serials — F12");
  });

  it("one plain row folds back onto the line; more rows stay the split", () => {
    let draft = toggleTick(freshWithRows(), "s2");
    draft = setLineAllocs(draft, "s2", [{ bucket: "SALEABLE", qty: 2, batchNo: "NEW1", expiryDate: "2027-01-31" }]);
    expect(draft.lines[1]).toMatchObject({ allocs: null, batch: "NEW1", expiry: "31/01/2027" });
    draft = setLineAllocs(draft, "s2", [
      { bucket: "SALEABLE", qty: 1, batchNo: "A" },
      { bucket: "SALEABLE", qty: 1, batchNo: "B" },
    ]);
    expect(batchCellText(draft.lines[1], true)).toBe("2 batches (F12)");
    draft = setLineAllocs(draft, "s1", [{ bucket: "SALEABLE", qty: 1, batchNo: "X", godownId: "g-other" }]);
    expect(batchCellText(draft.lines[0], true)).toBe("1 batch (F12)");
    draft = setLineAllocs(draft, "s3", [{ bucket: "SALEABLE", qty: 1, serialNo: "SN1" }]);
    expect(batchCellText(draft.lines[2], true)).toBe("1 serial (F12)");
  });
});

describe("shortage receipt — strip and pill", () => {
  it("previews the ticked rows at the original cost, ITC released, rows still open", () => {
    let draft = toggleTick(freshWithRows(), "s1");
    draft = setReceive(draft, "s2", "2");
    draft = setReceive(draft, "s3", "1");
    const totals = computeTotals(draft);
    expect(totals).toMatchObject({ ticked: 3, qty: 6, unit: "pcs", value: 500, itc: 54 + 12 + 18, stillOpen: 1 });
    expect(stripCells(totals).map((cell) => cell.value)).toEqual(["3", "6 pcs", "500.00", "84.00", "1 row"]);
    expect(totalsText(totals)).toBe("Ticked 3 · Receive 6 pcs · Stock in 500.00 · ITC 84.00 · Still open 1 row");
  });

  it("the pill: NEW, N OPEN, NOTHING OPEN; a saved receipt its status", () => {
    expect(pillOf(createDraft(SCOPE, "2026-10-29", NOW))).toEqual({ label: "NEW", tone: "neutral" });
    expect(pillOf(freshWithRows())).toEqual({ label: "3 OPEN", tone: "warning" });
    expect(pillOf(applyOpenRows(freshWithRows(), []))).toEqual({ label: "NOTHING OPEN", tone: "success" });
    expect(titleText(freshWithRows())).toBe("Shortage Receipt — ZT-PUR Supplier");
    expect(titleText(createDraft(SCOPE, "2026-10-29", NOW))).toBe("Shortage Receipt — pick the supplier");
  });
});

describe("shortage receipt — save", () => {
  it("refuses with no godown, a serial row without F12, nothing ticked", () => {
    const draft = freshWithRows();
    expect(saveBlocker({ ...draft, godownId: "" })?.title).toBe("Header incomplete");
    expect(saveBlocker(draft)?.title).toBe("Nothing received");
    const serial = setSignature(toggleTick(draft, "s3"), "s3", "R");
    expect(saveBlocker(serial)?.title).toBe("Serials needed");
    expect(saveBlocker(toggleTick(draft, "s1"))).toBeNull();
  });

  it("says too much and a bad expiry on the hint line", () => {
    let draft = setReceive(freshWithRows(), "s1", "5");
    draft = editLine(toggleTick(draft, "s2"), "s2", { expiry: "31/02/2027" });
    expect(lineProblems(draft).map((problem) => problem.text)).toEqual([
      "Line 1: 5 is more than the 3 still open — the server will refuse it.",
      "Line 2: expiry must be dd/MM/yyyy.",
    ]);
  });

  it("sends the ticked rows, receivedAt on the first save, allocs for a split", () => {
    let draft = toggleTick(freshWithRows(), "s1");
    draft = setReceive(draft, "s2", "2");
    draft = setLineAllocs(setReceive(draft, "s3", "2"), "s3", [
      { bucket: "SALEABLE", qty: 1, serialNo: "SN1" },
      { bucket: "SALEABLE", qty: 1, serialNo: "SN2", godownId: "g1" },
    ]);
    draft = setHeader(draft, { challanNo: " DC9 ", supervisorId: "emp-s", supervisorName: "Bala", receivedBy: [{ id: "emp-1", text: "Ravi" }] });
    const body = buildSavePayload(draft, true);
    expect(body.header).toMatchObject({
      companyId: "c1",
      branchId: "b1",
      accYear: "2026-2027",
      deviceId: "d1",
      supplierId: "sup1",
      godownId: "g1",
      docDate: "2026-10-29",
      receivedAt: new Date(2026, 9, 29, 19, 23).toISOString(),
      challanNo: "DC9",
      supervisorId: "emp-s",
      receivedBy: ["emp-1"],
      post: true,
    });
    expect(body.lines).toEqual([
      { lineNo: 1, shortageId: "s1", shortageAccYear: "2026-2027", qty: 3 },
      { lineNo: 2, shortageId: "s2", shortageAccYear: "2026-2027", qty: 2, batchNo: "ZTSQ-2350", expiryDate: "2027-06-30", mrp: 80 },
      {
        lineNo: 3,
        shortageId: "s3",
        shortageAccYear: "2026-2027",
        qty: 2,
        allocs: [
          { bucket: "SALEABLE", qty: 1, serialNo: "SN1" },
          { bucket: "SALEABLE", qty: 1, serialNo: "SN2", godownId: "g1" },
        ],
      },
    ]);
  });

  it("a re-save omits receivedAt unless typed and clears a removed supervisor with null", () => {
    const saved = { ...toggleTick(freshWithRows(), "s1"), psrId: "p1", refno: "SHR/1" };
    const body = buildSavePayload(saved, false);
    expect(body.header.receivedAt).toBeUndefined();
    expect(body.header.supervisorId).toBeNull();
    const typed = setReceivedAt(saved, "2026-10-29T09:15");
    expect(buildSavePayload(typed, false).header.receivedAt).toBe(new Date(2026, 9, 29, 9, 15).toISOString());
    expect(buildSavePayload(typed, false).header.docDate).toBe("2026-10-29");
  });
});

describe("shortage receipt — a saved receipt", () => {
  const payload: ShortageReceiptPayload = {
    header: {
      psrId: "p1",
      psrCompanyId: "c1",
      psrBranchId: "b1",
      psrAccYear: "2026-2027",
      psrRefno: "SHR/2026-2027/D14/00057",
      psrDocDate: "2026-10-29T00:00:00.000Z",
      psrStatus: "POSTED",
      psrSupplierId: "sup1",
      psrGodownId: "g1",
      psrReceivedAt: "2026-10-29T03:45:00.000Z",
      psrChallanNo: "ZTDC-1",
      psrReceivedBy: ["m1", "m2"],
      psrSupervisorId: "sv1",
      psrValue: "400",
      psrRemarks: "ZT",
      supplierName: "ZT-PUR Supplier",
      godownName: "Coimbatore",
      receivedBy: [
        { id: "m1", name: "ZT Loadman Ravi" },
        { id: "m2", name: "ZT Loadman Kumar" },
      ],
      supervisorName: "ZT Supervisor Bala",
    },
    lines: [
      {
        psriId: "l1",
        psriLineNo: 1,
        psriShortageId: "s1",
        psriShortageAccYear: "2026-2027",
        psriItemId: "i1",
        psriUomId: "u1",
        psriQty: "2",
        psriCostRate: "100",
        psriValue: "200",
        psriGstReleased: "36",
        itemName: "ZT-ITEM-A",
        unitName: "PCS",
        reason: "SHORT_BILL",
        srcRefno: "PUR/2026-2027/D14/00623",
        openQty: "1",
        shortQty: "3",
        batchNo: null,
        expiryDate: null,
        mrp: null,
        allocs: [{ rowNo: 1, godownId: "g1", batchNo: "B1", mfgDate: null, expiryDate: "2027-05-31T00:00:00.000Z", mrp: null, serialNo: null, warrantyTo: null, qty: "2" }],
      },
      {
        psriId: "l2",
        psriLineNo: 2,
        psriShortageId: "s3",
        psriShortageAccYear: "2026-2027",
        psriQty: "2",
        psriCostRate: "100",
        psriValue: "200",
        psriGstReleased: "36",
        itemName: "ZZ SERIAL",
        unitName: "PCS",
        reason: "SHORT_BILL",
        srcRefno: "PUR/2026-2027/D14/00623",
        openQty: "0",
        batchNo: null,
        expiryDate: null,
        mrp: null,
        allocs: [
          { rowNo: 2, godownId: "g1", batchNo: null, mfgDate: null, expiryDate: null, mrp: null, serialNo: "SN2", warrantyTo: null, qty: "1" },
          { rowNo: 1, godownId: "g1", batchNo: null, mfgDate: null, expiryDate: null, mrp: null, serialNo: "SN1", warrantyTo: null, qty: "1" },
        ],
      },
    ],
  };

  it("reads the header names, received date-time and the lines' lots back, read-only once posted", () => {
    const draft = draftFromPayload(payload, SCOPE, "entry");
    expect(draft).toMatchObject({
      psrId: "p1",
      status: "POSTED",
      mode: "browse",
      godownName: "Coimbatore",
      supervisorId: "sv1",
      supervisorName: "ZT Supervisor Bala",
      receivedAt: receivedAtOf("2026-10-29T03:45:00.000Z", ""),
      receivedBy: [
        { id: "m1", text: "ZT Loadman Ravi" },
        { id: "m2", text: "ZT Loadman Kumar" },
      ],
    });
    expect(isEditable(draft)).toBe(false);
    expect(isFresh(draft)).toBe(false);
    expect(pillOf(draft)).toEqual({ label: "POSTED", tone: "success" });
    expect(draft.lines[0]).toMatchObject({ ticked: true, receive: "2", batch: "B1", expiry: "31/05/2027", allocs: null, gstHeld: 36, gstReleased: 36, why: "Short on bill" });
    expect(draft.lines[1].allocs?.map((a) => a.serialNo)).toEqual(["SN1", "SN2"]);
    expect(batchCellText(draft.lines[1], false)).toBe("2 serials (F12)");
    expect(computeTotals(draft)).toMatchObject({ ticked: 2, value: 400, itc: 72, stillOpen: 1 });
  });

  it("merges the shortages' own figures from /open?all=true", () => {
    const merged = mergeFacts(draftFromPayload(payload, SCOPE, "browse"), [
      openRow({ received: "2", closed: "0", status: "PART", srcLineNo: 1, ageDays: 3 }),
    ]);
    expect(merged.lines[0]).toMatchObject({ from: "PUR/…/00623 · line 1", srcDate: "29/10/2026", ageDays: 3, receivedSoFar: 2, closedSoFar: 0, status: "PART" });
    expect(merged.lines[0].gstHeld).toBe(36);
  });
});

describe("shortage receipt — Close row…", () => {
  it("acts on the ticked open rows, else the current row", () => {
    const draft = freshWithRows();
    expect(closeTargets(draft).map((line) => line.key)).toEqual(["s1"]);
    expect(closeTargets(setActive(draft, "s2")).map((line) => line.key)).toEqual(["s2"]);
    const ticked = toggleTick(toggleTick(draft, "s1"), "s3");
    expect(closeTargets(ticked).map((line) => line.key)).toEqual(["s1", "s3"]);
    expect(clearTicks(ticked).lines.every((line) => !line.ticked && !line.receive)).toBe(true);
    expect(closedNotice(1, "SUPPLIER_CN")).toBe("1 shortage closed.");
    expect(closedNotice(2, "CLAIM")).toBe("2 shortages closed. The claim is settled on Supplier dues.");
  });

  it("a refused save's errors[] become REFUSE rows", () => {
    const error = { status: 422, data: { errors: [{ code: "SHORTAGE_QTY_EXCEEDS", message: "PUR/…: 5 received, only 3 is short", field: "lines" }] } };
    expect(refusalIssues(error)).toEqual([
      { code: "SHORTAGE_QTY_EXCEEDS", message: "PUR/…: 5 received, only 3 is short", field: "lines", level: "REFUSE", lineNo: null },
    ]);
    expect(refusalIssues(new Error("x"))).toEqual([]);
  });
});

describe("shortage receipt — document keys", () => {
  it("F2 opens a read-only draft for an Edit right; says why otherwise", () => {
    const draft = { psrId: "p1", refno: "SHR/1", status: "DRAFT" as const, mode: "browse" as const };
    expect(editAnswer(draft, true)).toEqual({ open: true, focusLines: true, notice: "" });
    expect(editAnswer(draft, false).open).toBe(false);
    expect(editAnswer({ ...draft, status: "POSTED" }, true).notice).toContain("is posted");
  });

  it("Prev / Next say where the walk ends", () => {
    expect(stepEndNotice(true, true)).toBe("There is no shortage receipt yet.");
    expect(stepEndNotice(false, false)).toBe("This is the newest shortage receipt.");
  });
});
