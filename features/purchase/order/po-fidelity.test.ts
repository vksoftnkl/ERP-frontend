import { describe, expect, it } from "vitest";
import {
  applyChargeCalc,
  approvalText,
  chargeBasis,
  chargeFromMaster,
  chargesDto,
  lineStatusChip,
  poPillStatus,
  poStripCells,
  poTitle,
  revisionText,
  shortCloseLineIds,
  suggestionsOf,
} from "./po-fidelity";

describe("purchase order rebuild", () => {
  it("title, pill, approval, revision", () => {
    expect(poTitle({ refno: "PO/1", revisionNo: 2 })).toBe("Purchase Order — PO/1  · rev 2");
    expect(poTitle({ refno: "", revisionNo: 0 })).toBe("Purchase Order — new");
    expect(poPillStatus({ status: "POSTED", docStatus: "PART_RECEIVED", amending: false })).toBe("PART_RECEIVED");
    expect(poPillStatus({ status: "POSTED", docStatus: "PART_RECEIVED", amending: true })).toBe("AMENDING");
    expect(approvalText({ approvalStatus: "NOT_REQUIRED", approvedBy: "" }, 0)).toBe("Off (setting 0)");
    expect(approvalText({ approvalStatus: "AWAITING", approvedBy: "" }, 50000)).toBe("Waiting — above 50,000.00");
    expect(revisionText({ poId: "p", revisionNo: 2, lastAmendReason: "qty raised on line 4" })).toBe("2 — qty raised on line 4");
  });
  it("the six-cell strip counts received only on a posted PO", () => {
    const cells = poStripCells({ lines: 5, orderedValue: "22295.74", receivedValue: "17906.55", pendingValue: "2364", shortClosedLines: 1, poTotal: "22645.74" }, "POSTED", 1707.3);
    expect(cells.map((c) => c.value)).toEqual(["5", "22,295.74", "17,906.55", "2,364.00", "1 line", "22,645.74"]);
    expect(cells[1].caption).toBe("Ordered value (incl. tax 1,707.30)");
    const draft = poStripCells({ lines: 1, orderedValue: "472.00", poTotal: "472.00" }, "DRAFT", 72);
    expect(draft[2].value).toBe("");
  });
  it("estimated charges: rate or typed amount; calc paints signed amounts", () => {
    const c = chargeFromMaster({ chgId: "c1", chgName: "Freight", chgMethod: "FIXED", chgType: "ADD", chgDefaultRate: 100 });
    expect(chargesDto([c])).toEqual([{ chgId: "c1", rate: 100 }]);
    expect(chargesDto([{ ...c, amount: "-50", typed: true }])).toEqual([{ chgId: "c1", amount: 50 }]);
    expect(applyChargeCalc([c], [{ signedAmount: "100", rate: "100" }])[0].amount).toBe("100.00");
    expect(chargeBasis("PERCENT", false, "DEDUCT")).toBe("Less: % of value · our cost");
  });
  it("status chips, short close ids, reorder rows", () => {
    expect(lineStatusChip({ lineStatus: "SHORT_CLOSED" })).toEqual({ text: "SHORT CLOSED", tone: "neutral" });
    expect(lineStatusChip({ lineStatus: "OPEN" })).toBeNull();
    const all = [
      { lineId: "a", item: "", unit: "", ordered: 1, received: 0, pending: 1 },
      { lineId: "b", item: "", unit: "", ordered: 1, received: 0, pending: 1 },
    ];
    expect(shortCloseLineIds(all, new Set(["a", "b"]))).toEqual([]);
    expect(shortCloseLineIds(all, new Set(["b"]))).toEqual(["b"]);
    expect(shortCloseLineIds(all, new Set())).toBeNull();
    expect(suggestionsOf([{ itemId: "i1", suggestedQty: "48" }, { itemId: "i2" }], new Set(["i2"])).map((s) => s.itemId)).toEqual(["i1"]);
  });
});
