import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/date-format";
import {
  applyChargeCalc,
  approvalText,
  chargeBasis,
  chargeFromMaster,
  chargeFromRow,
  chargeNature,
  chargesDto,
  lineStatusChip,
  poPillStatus,
  poStripCells,
  poTitle,
  revisionPill,
  approvalPill,
  auditText,
  poQuickRules,
  shortCloseLineIds,
  suggestionsOf,
} from "./po-fidelity";

describe("purchase order rebuild", () => {
  it("the audit line: created / modified, the name only when it is the signed-in user's", () => {
    const on = "2026-11-04T09:57:23.678Z";
    const later = "2026-11-04T09:58:25.029Z";
    const me = { userId: "U1", userName: "VKPOS" };
    expect(auditText({ createdBy: "u1", createdOn: on, modifiedBy: "u2", modifiedOn: later }, me)).toBe(
      `created VKPOS · ${formatDateTime(on)}   ·   modified ${formatDateTime(later)}`,
    );
    expect(formatDateTime(on)).toMatch(/^04\/11\/2026 \d{2}:\d{2} [AP]M$/);
    expect(auditText({ createdBy: "", createdOn: "", modifiedBy: "", modifiedOn: "" }, me)).toBe("");
  });
  it("the quick strip follows Qt applyStatus: each button's state and why not", () => {
    const base = {
      poId: "",
      status: "DRAFT",
      amending: false,
      shortClosed: false,
      supplierId: "",
      approvalStatus: "",
      editable: true,
      hasPending: false,
      working: false,
      mayShortClose: true,
    };
    const fresh = poQuickRules(base);
    expect(Object.entries(fresh).filter(([, r]) => !r.disabled).map(([k]) => k)).toEqual(["reorder"]);
    expect(fresh.versions.disabledReason).toBe("save the order first — a new one has no versions yet");
    expect(fresh.makeGrn).toMatchObject({ keyHint: "Ctrl+G", disabled: true });
    expect(poQuickRules({ ...base, supplierId: "s" }).cloneMerge.disabled).toBe(false);
    const posted = poQuickRules({ ...base, poId: "p", status: "POSTED", editable: false, hasPending: true, approvalStatus: "NOT_REQUIRED" });
    expect(Object.entries(posted).filter(([, r]) => r.disabled).map(([k]) => k)).toEqual(["reorder"]);
    expect(poQuickRules({ ...base, poId: "p", status: "POSTED", editable: false, hasPending: true, approvalStatus: "AWAITING" }).makeInvoice.disabled).toBe(true);
    expect(poQuickRules({ ...base, poId: "p", status: "POSTED", hasPending: true, mayShortClose: false }).shortClose.disabledReason).toContain("rights");
    expect(poQuickRules({ ...base, poId: "p", status: "CANCELLED", editable: false }).send.disabledReason).toBe("a cancelled order is not sent");
    expect(poQuickRules({ ...base, poId: "p", working: true }).print.disabled).toBe(true);
  });

  it("title, pill, approval, revision", () => {
    // eee7936: " · rev n" only once amended (rev > 1)
    expect(poTitle({ refno: "PO/1", revisionNo: 2 })).toBe("Purchase Order — PO/1 · rev 2");
    expect(poTitle({ refno: "PO/1", revisionNo: 1 })).toBe("Purchase Order — PO/1");
    expect(poTitle({ refno: "", revisionNo: 0 })).toBe("Purchase Order — new");
    expect(poPillStatus({ status: "POSTED", docStatus: "PART_RECEIVED", amending: false })).toBe("PART_RECEIVED");
    expect(poPillStatus({ status: "POSTED", docStatus: "PART_RECEIVED", amending: true })).toBe("AMENDING");
    expect(approvalText({ approvalStatus: "NOT_REQUIRED", approvedBy: "" }, 0)).toBe("Off (setting 0)");
    expect(approvalText({ approvalStatus: "AWAITING", approvedBy: "" }, 50000)).toBe("Waiting — above 50,000.00");
    // e782e59: the REV n pill (once saved) and the APPROVAL pill beside the status pill
    expect(revisionPill({ poId: "", revisionNo: 0, lastAmendReason: "" })).toBeNull();
    expect(revisionPill({ poId: "p", revisionNo: 2, lastAmendReason: "qty raised on line 4" })).toEqual({
      text: "REV 2",
      tip: "Revision 2 — qty raised on line 4\nClick (or F4) for the versions",
    });
    expect(revisionPill({ poId: "p", revisionNo: 0, lastAmendReason: "" })?.tip).toBe("Revision 1 — click (or F4) for the versions");
    expect(approvalPill({ approvalStatus: "NOT_REQUIRED", approvedBy: "" }, 0)).toEqual({ text: "APPROVAL OFF", tone: "neutral", tip: "Off (setting 0)" });
    expect(approvalPill({ approvalStatus: "", approvedBy: "" }, 50000).text).toBe("APPROVAL NOT NEEDED");
    expect(approvalPill({ approvalStatus: "AWAITING", approvedBy: "" }, 50000)).toMatchObject({ text: "AWAITING APPROVAL", tone: "warning" });
    expect(approvalPill({ approvalStatus: "APPROVED", approvedBy: "VK" }, 50000)).toEqual({ text: "APPROVED", tone: "success", tip: "Approved by VK" });
    expect(approvalPill({ approvalStatus: "REJECTED", approvedBy: "" }, 50000)).toMatchObject({ text: "NOT APPROVED", tone: "danger" });
  });
  it("the six-cell strip counts received only on a posted PO", () => {
    const cells = poStripCells({ lines: 5, orderedValue: "22295.74", receivedValue: "17906.55", pendingValue: "2364", shortClosedLines: 1, poTotal: "22645.74" }, "POSTED", 1707.3);
    expect(cells.map((c) => c.value)).toEqual(["5", "22,295.74", "17,906.55", "2,364.00", "1 line", "22,645.74"]);
    expect(cells[1].caption).toBe("Ordered value (incl. tax 1,707.30)");
    const draft = poStripCells({ lines: 1, orderedValue: "472.00", poTotal: "472.00" }, "DRAFT", 72);
    expect(draft[2].value).toBe("");
    expect(cells[4].title).toBe("Value short-closed 0.00");
  });
  it("the PO total's tooltip: lines + charges, and the server's split once /validate sent it", () => {
    const live = poStripCells({ lines: 1, orderedValue: "1112.58", chargesEstimate: "168", poTotal: "1280.58" }, "DRAFT", 169.72);
    expect(live[5].title).toBe("Lines 1,112.58 + estimated charges 168.00");
    const server = poStripCells(
      { lines: 2, orderedValue: "2432.58", chargesEstimate: "168.00", poTotal: "2600.58", chrgBeforeTax: "100.00", chrgAfterTax: "-42.00", chargeTax: "0.00", offbill: "210.00" },
      "DRAFT",
      232.58,
    );
    expect(server[5].title).toBe(
      "Lines 2,432.58 + estimated charges 168.00\n" +
        "lines = taxable + GST, with the before-tax charges 100.00 inside\n" +
        "charges = after tax -42.00 + their GST 0.00 + our own (off the bill) 210.00",
    );
  });
  it("charge flags: from the master on add, from /validate after; the Basis tooltip says how it lands", () => {
    const freight = chargeFromMaster({ chgId: "f", chgName: "Freight", chgMethod: "FIXED", chgType: "ADD", chgOnBill: true, chgBeforeTax: true, chgDefaultRate: 100 });
    expect(freight).toMatchObject({ beforeTax: true, landing: true, flagsKnown: true });
    expect(chargeNature(freight)).toBe("Before tax: each line's share joins its Taxable, so GST is charged on it (Chrg before tax).");
    const coolie = chargeFromMaster({ chgId: "c", chgName: "Coolie", chgMethod: "QTY", chgOnBill: false, chgBeforeTax: true, chgLandingCost: false });
    // off the bill: never before tax, always a landing cost (the server's purchaseChargeInput)
    expect(coolie).toMatchObject({ beforeTax: false, landing: true });
    expect(chargeNature(coolie)).toBe("Our own cost, not on the supplier's bill: no GST; each line's share is in its landing cost.");
    const cash = chargeFromMaster({ chgId: "d", chgName: "Cash disc", chgMethod: "PERCENT", chgType: "DEDUCT", chgLandingCost: false });
    expect(chargeNature(cash)).toBe(
      "After tax: each line's share is added to its Amount (Chrg after tax).\nNot a landing cost (charge master): left out of the landing cost.",
    );
    // a stored row: flags unknown until the open's /validate
    const stored = chargeFromRow({ chgId: "f", chgName: "Freight", method: "FIXED", type: "ADD", rate: "100", amount: "100", signedAmount: "100", onBill: true });
    expect(chargeNature(stored)).toBe("");
    const answered = applyChargeCalc([stored], [{ signedAmount: "100.00", rate: "100", beforeTax: true, landingCost: true, tax: "0.00" }])[0];
    expect(answered).toMatchObject({ beforeTax: true, flagsKnown: true, gst: 0, amount: "100.00" });
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
