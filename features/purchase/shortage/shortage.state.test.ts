import { describe, expect, it } from "vitest";
import {
  applyOpenRows,
  buildSavePayload,
  computeTotals,
  createDraft,
  draftFromPayload,
  editLine,
  isEditable,
  isFresh,
  lineProblems,
  lineValue,
  reasonText,
  resolveColumns,
  saveBlocker,
  setSupplier,
  totalsText,
} from "./shortage.state";
import type { OpenShortageRow, ShortageReceiptPayload } from "./shortage.types";
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };

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
    srcRefno: "PUR/2026-2027/D14/00300",
    qtyBase: "3",
    received: "0",
    closed: "0",
    openQty: "3",
    value: "300",
    gst: "54",
    openValue: "300",
    openGst: "54",
    costRate: "100.000000",
    batchNo: null,
    expiryDate: null,
    mrp: null,
    ...over,
  };
}

function freshWithRows() {
  const draft = setSupplier(createDraft(SCOPE, "2026-10-28"), "sup1", "ZT");
  return applyOpenRows({ ...draft, godownId: "g1" }, [
    openRow(),
    openRow({ shortageId: "s2", itemName: "MRP item", openQty: "2", costRate: "50", batchNo: "ZTSQ-1", expiryDate: "2027-06-30", mrp: "80.00" }),
  ]);
}

describe("shortage.state", () => {
  it("says the reason in words", () => {
    expect(reasonText("SHORT_BILL")).toBe("Billed, not came");
    expect(reasonText("SHORT_CHALLAN")).toBe("Short on challan");
    expect(reasonText("REPLACE")).toBe("Replacement due");
    expect(reasonText("OTHER")).toBe("OTHER");
  });

  it("makes one row per open shortage, with its batch, expiry, MRP and cost", () => {
    const draft = freshWithRows();
    expect(draft.lines).toHaveLength(2);
    expect(draft.lines[0]).toMatchObject({ key: "s1", shortQty: 3, cost: 100, received: "", batch: "" });
    expect(draft.lines[1]).toMatchObject({ batch: "ZTSQ-1", expiry: "30/06/2027", mrp: "80", shortQty: 2 });
    expect(draft.activeKey).toBe("s1");
    expect(isFresh(draft)).toBe(true);
    expect(isEditable(draft)).toBe(true);
  });

  it("keeps what was typed on rows still open when the list is read again", () => {
    let draft = freshWithRows();
    draft = editLine(draft, "s1", { received: "2", batch: "B9", expiry: "01/01/2027", mrp: "99" });
    const again = applyOpenRows(draft, [openRow({ openQty: "3" })]);
    expect(again.lines).toHaveLength(1);
    expect(again.lines[0]).toMatchObject({ received: "2", batch: "B9", expiry: "01/01/2027", mrp: "" });
  });

  it("drops the rows when the supplier changes", () => {
    const draft = setSupplier(freshWithRows(), "sup2", "Other");
    expect(draft.lines).toEqual([]);
    expect(draft.dirty).toBe(true);
  });

  it("previews Received × cost and totals the received rows", () => {
    let draft = freshWithRows();
    draft = editLine(draft, "s1", { received: "2" });
    draft = editLine(draft, "s2", { received: "2" });
    expect(lineValue(draft.lines[0])).toBe(200);
    const totals = computeTotals(draft);
    expect(totals).toEqual({ rows: 2, qty: 4, value: 300, lineCount: 2 });
    expect(totalsText(draft, totals)).toBe("2 rows received · Qty 4 · Value 300.00 (of 2 short rows)");
  });

  it("an unchanged edit leaves the draft clean", () => {
    const draft = freshWithRows();
    expect(editLine(draft, "s1", { received: "" })).toBe(draft);
  });

  it("refuses to save with nothing received, no godown, a bad expiry or too much", () => {
    let draft = freshWithRows();
    expect(saveBlocker(draft)?.title).toBe("Nothing received");
    expect(saveBlocker({ ...draft, godownId: "" })?.title).toBe("Header incomplete");
    draft = editLine(draft, "s1", { received: "4" });
    expect(lineProblems(draft).map((problem) => problem.text)).toEqual(["Line 1: 4 received, only 3 is short."]);
    draft = editLine(draft, "s1", { received: "3", expiry: "31/02/2027" });
    expect(saveBlocker(draft)?.text).toBe("Line 1: expiry must be dd/MM/yyyy.");
    draft = editLine(draft, "s1", { expiry: "28/02/2027" });
    expect(saveBlocker(draft)).toBeNull();
  });

  it("sends only the received rows, numbered from 1, with the Qt header", () => {
    let draft = freshWithRows();
    draft = editLine(draft, "s2", { received: "2", expiry: "30/06/2027" });
    draft = {
      ...draft,
      challanNo: " CH-1 ",
      remarks: "",
      receivedBy: [{ id: "e1", text: "Ravi" }],
    };
    expect(buildSavePayload(draft, true)).toEqual({
      header: {
        companyId: "c1",
        branchId: "b1",
        accYear: "2026-2027",
        deviceId: "d1",
        supplierId: "sup1",
        godownId: "g1",
        docDate: "2026-10-28",
        challanNo: "CH-1",
        receivedBy: ["e1"],
        post: true,
      },
      lines: [
        {
          lineNo: 1,
          shortageId: "s2",
          shortageAccYear: "2026-2027",
          qty: 2,
          batchNo: "ZTSQ-1",
          expiryDate: "2027-06-30",
          mrp: 80,
        },
      ],
    });
  });

  it("reads a saved receipt back, read-only once posted", () => {
    const payload: ShortageReceiptPayload = {
      header: {
        psrId: "r1",
        psrCompanyId: "c1",
        psrBranchId: "b1",
        psrAccYear: "2026-2027",
        psrRefno: "SHR/2026-2027/D14/00027",
        psrDocDate: "2026-10-28T00:00:00.000Z",
        psrStatus: "POSTED",
        psrSupplierId: "sup1",
        psrGodownId: "g1",
        psrChallanNo: null,
        psrReceivedBy: ["e1"],
        psrValue: "300",
        psrRemarks: "late lot",
        supplierName: "ZT",
      },
      lines: [
        {
          psriId: "l1",
          psriLineNo: 1,
          psriShortageId: "s1",
          psriShortageAccYear: "2026-2027",
          psriQty: "2.000",
          psriCostRate: "100.000000",
          psriValue: "200.00",
          itemName: "ZT-ITEM-A",
          unitName: "PCS",
          reason: "SHORT_BILL",
          srcRefno: "PUR/1",
          openQty: "1",
          batchNo: null,
          expiryDate: null,
          mrp: null,
        },
      ],
    };
    const draft = draftFromPayload(payload, SCOPE, "entry", { godownName: "Coimbatore", receivedBy: [{ id: "e1", text: "Ravi" }] });
    expect(draft).toMatchObject({
      psrId: "r1",
      refno: "SHR/2026-2027/D14/00027",
      status: "POSTED",
      mode: "browse",
      docDate: "2026-10-28",
      godownName: "Coimbatore",
      remarks: "late lot",
      dirty: false,
    });
    expect(draft.lines[0]).toMatchObject({ received: "2", shortQty: 1, lineId: "l1", cost: 100 });
    expect(isFresh(draft)).toBe(false);
    expect(isEditable(draft)).toBe(false);
    expect(totalsText(draft, computeTotals(draft))).toBe("1 row · Qty 2 · Value 200.00");
    expect(buildSavePayload({ ...draft, status: "DRAFT" }, false).header.psrId).toBe("r1");
  });

  it("lays the grid out from ui_table 61, hidden id columns never drawn", () => {
    const row = (no: number, name: string, width: number, extra: Partial<UiTableColumnRow> = {}): UiTableColumnRow => ({
      uiTblClmId: String(no),
      uiTblClmNo: String(no),
      uiTblClmName: name,
      uiTblClmColumnWidth: width,
      uiTblClmColumnVisibility: true,
      uiTblClmColumnFocus: false,
      uiTblClmColumnPosition: no,
      uiTblClmColumnNecessity: false,
      ...extra,
    });
    const columns = resolveColumns([
      row(0, "Short From", 15),
      row(1, "Why", 5, { uiTblClmColumnVisibility: false }),
      row(5, "Received", 10),
      row(11, "ShortageId", 0, { uiTblClmColumnVisibility: false }),
    ]);
    expect(columns.map((column) => column.no)).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(columns.find((column) => column.no === 5)?.focus).toBe(true);
    expect(columns.find((column) => column.no === 6)?.focus).toBe(true);
    expect(columns.find((column) => column.no === 8)?.focus).toBe(false);
    expect(Math.round(columns.reduce((sum, column) => sum + column.widthPct, 0))).toBe(100);
    // A layout that flags its own Focus columns is followed instead.
    const flagged = resolveColumns([row(8, "MRP", 6, { uiTblClmColumnFocus: true })]);
    expect(flagged.filter((column) => column.focus).map((column) => column.no)).toEqual([8]);
  });
});
