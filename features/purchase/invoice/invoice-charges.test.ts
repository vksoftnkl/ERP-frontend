import { describe, expect, it } from "vitest";
import {
  applyChargeCalc,
  autoApplyCharges,
  basisText,
  chargeFromMaster,
  chargesPayload,
  dropOffBill,
  editCharge,
  foldStoredCharges,
  payeeText,
} from "./invoice-charges";
import type { PurchaseChargeMasterRow } from "./invoice-header.types";
import { noteToShowOnPick, supplierChips } from "./supplier-context";

const freight: PurchaseChargeMasterRow = {
  chgId: "c-freight",
  chgName: "FREIGHT",
  chgModule: "P",
  chgMethod: "FIXED",
  chgType: "ADD",
  chgDefaultRate: "150.0000",
  chgBeforeTax: true,
  chgOnBill: true,
  chgAutoApply: true,
};
const coolie: PurchaseChargeMasterRow = {
  chgId: "c-coolie",
  chgName: "UNLOADING",
  chgModule: "B",
  chgMethod: "QTY",
  chgType: "ADD",
  chgDefaultRate: 2,
  chgOnBill: false,
  chgAutoApply: true,
};

describe("charges", () => {
  it("words the basis as Qt does", () => {
    expect(basisText("PERCENT", true, true, "ADD")).toBe("% of value · before tax");
    expect(basisText("QTY", false, false, "ADD")).toBe("Per qty · our cost");
    expect(basisText("FIXED", true, false, "DEDUCT")).toBe("Less: Fixed · after tax");
  });

  it("seeds the auto-apply purchase charges, never a sales one or an inactive one", () => {
    const sales = { ...freight, chgId: "c-s", chgModule: "S" };
    const off = { ...freight, chgId: "c-off", chgIsActive: false };
    const manual = { ...freight, chgId: "c-m", chgAutoApply: false };
    expect(autoApplyCharges([freight, sales, off, manual, coolie]).map((c) => c.chgId)).toEqual(["c-freight", "c-coolie"]);
  });

  it("sends the rate until the Amount is typed, then the amount; payees only off-bill", () => {
    const row = chargeFromMaster(freight, "c1");
    expect(row.rate).toBe("150");
    expect(chargesPayload([row])).toEqual([{ chgId: "c-freight", rate: 150 }]);
    const typed = editCharge(row, "amount", "175.50");
    expect(chargesPayload([typed])).toEqual([{ chgId: "c-freight", amount: 175.5 }]);
    const back = editCharge(typed, "rate", "160");
    expect(back.typed).toBe(false);
    expect(chargesPayload([back])).toEqual([{ chgId: "c-freight", rate: 160 }]);

    const crew = { ...chargeFromMaster(coolie, "c2"), payeeIds: ["e1", "e2"], payeeNames: ["RAVI", "KUMAR"] };
    expect(chargesPayload([crew])).toEqual([{ chgId: "c-coolie", rate: 2, payees: [{ partyId: "e1" }, { partyId: "e2" }] }]);
    expect(payeeText(crew)).toBe("RAVI · KUMAR");
    expect(payeeText(chargeFromMaster(coolie, "c3"))).toBe("(the charge's ledger)");
    expect(payeeText(row)).toBe("(on the supplier's bill)");
  });

  it("paints the server's figures in the order sent, keeping a typed amount", () => {
    const rows = [chargeFromMaster(freight, "c1"), editCharge(chargeFromMaster(coolie, "c2"), "amount", "40")];
    const out = applyChargeCalc(rows, [
      { amount: "150.00", cgst: "13.50", sgst: "13.50", igst: "0" },
      { amount: "40.00", cgst: "0", sgst: "0", igst: "0" },
    ]);
    expect(out[0]).toMatchObject({ amount: "150.00", gst: 27, net: 177, priced: true });
    expect(out[1]).toMatchObject({ amount: "40", typed: true, net: 40 });
  });

  it("folds per-payee stored rows back into one row", () => {
    const rows = foldStoredCharges(
      [
        { chgId: "c-freight", chgName: "FREIGHT", onBill: true, method: "FIXED", type: "ADD", beforeTax: true, rate: "150", amount: "150.00", cgst: "13.50", sgst: "13.50", igst: "0" },
        { chgId: "c-coolie", chgName: "UNLOADING", onBill: false, method: "QTY", type: "ADD", rate: "2", amount: "10.00", partyId: "l1", partyName: "RAVI" },
        { chgId: "c-coolie", chgName: "UNLOADING", onBill: false, method: "QTY", type: "ADD", rate: "2", amount: "10.00", partyId: "l2", partyName: "KUMAR" },
      ],
      (index) => `c${index + 1}`,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ key: "c1", amount: "150.00", gst: 27, net: 177, typed: true });
    expect(rows[1]).toMatchObject({ key: "c2", amount: "20.00", payeeIds: ["l1", "l2"], payeeNames: ["RAVI", "KUMAR"], basis: "Per qty · our cost" });
  });

  it("drops our own costs when goods come from a GRN", () => {
    const { rows, gone } = dropOffBill([chargeFromMaster(freight, "c1"), chargeFromMaster(coolie, "c2")]);
    expect(rows.map((row) => row.chgId)).toEqual(["c-freight"]);
    expect(gone).toEqual(["UNLOADING"]);
  });
});

describe("supplier chips", () => {
  it("paints GST, MSME, note, POs, outstanding, holds and warnings", () => {
    const chips = supplierChips({
      supplierId: "s1",
      name: "ACME",
      gstNo: "33ABCDE1234F1Z5",
      gstType: "REGULAR",
      stateName: "Tamil Nadu",
      notes: "Call before sending the lorry",
      showNotesOnEntry: true,
      msme: { category: "MICRO", activity: "MANUFACTURING", writtenAgreement: false, dueDays: 15, payBy: "2026-11-13" },
      pendingPos: [{ poId: "p", accYear: "2026-2027", refno: "PO/7", docDate: "2026-10-20", lines: 3 }],
      outstanding: { balance: "12500.50", bills: 2, overdueBills: 1, billsOnHold: 1, payable: "12500.50", debits: "0" },
      warnings: [{ code: "FSSAI_EXPIRED", message: "FSSAI licence X expired on 2026-01-01." }],
    });
    expect(chips.map((chip) => chip.text)).toEqual([
      "GSTIN 33ABCDE1234F1Z5 · Regular",
      "MSME Micro · Manufacturing · no written agreement · pay by 13/11/2026 (15 days from receipt)",
      "Supplier note: Call before sending the lorry",
      "1 pending PO",
      "Outstanding 12,500.50 Cr · 2 bills · 1 overdue",
      "1 bill on payment hold",
      "FSSAI licence X expired on 2026-01-01.",
    ]);
    expect(chips[3].tip).toBe("PO/7 · 20/10/2026 · 3 lines");
    expect(chips.at(-1)?.tone).toBe("danger");
    expect(noteToShowOnPick({ supplierId: "s1", name: "ACME", notes: "x", showNotesOnEntry: true })).toEqual({ title: "Note on ACME", message: "x" });
    expect(noteToShowOnPick({ supplierId: "s1", notes: "x", showNotesOnEntry: false })).toBeNull();
  });

  it("says an unregistered supplier gives no input credit", () => {
    expect(supplierChips({ supplierId: "s", gstNo: null, gstType: null })[0]).toMatchObject({ text: "Unregistered", tone: "warning" });
    // the word, never the stored code
    expect(supplierChips({ supplierId: "s", gstNo: null, gstType: "UNREGISTERED" })[0].text).toBe("Unregistered · no GSTIN");
    expect(supplierChips({ supplierId: "s", gstNo: "33ABCDE1234F1Z5", gstType: "COMPOSITION" })[0].text).toBe("GSTIN 33ABCDE1234F1Z5 · Composition");
  });
});

describe("hold", () => {
  const body = {
    header: { piId: "old", companyId: "c", branchId: "b", accYear: "2026-2027", deviceId: "d", supplierId: "s", supplierInvNo: "X1", supplierInvDate: "2026-10-29", docDate: "2026-10-29", godownId: "g", invoiceAmountPrinted: 100, post: true },
    lines: [{ lineNo: 1, itemId: "i", uomId: "u", billedQty: 1, rate: 100 }],
    charges: [],
  };
  it("parks the save body with a stamp, the party typed only with an id", async () => {
    const { holdBody, isPurchaseBillHold, restoreBody, myAutosave, recoveryQuestion } = await import("./invoice-hold");
    const dto = holdBody(
      { companyId: "c", branchId: "b", accYear: "2026-2027", deviceId: "d", heldBy: "u1", supplierId: "", supplierName: "", itemCount: 1, netAmount: -5 },
      body,
      "AUTOSAVE",
    );
    expect(dto).toMatchObject({ txhKind: "AUTOSAVE", txhDocType: "PURCHASE_BILL", txhSrcModule: "PURCHASE", txhNetAmount: 0 });
    expect(dto.txhPartyType).toBeUndefined();
    expect(isPurchaseBillHold({ txhPayload: dto.txhPayload })).toBe(true);
    expect(isPurchaseBillHold({ txhPayload: { kind: "quotation" } })).toBe(false);
    const back = restoreBody(dto.txhPayload);
    expect(back?.header.post).toBe(false);
    expect(back && "piId" in back.header).toBe(false);
    expect(back && "uiState" in back).toBe(false);
    const row = { txhKind: "AUTOSAVE", txhStatus: "HELD", txhHeldBy: "u1", txhDeviceId: "d", txhPartyName: "ACME", txhItemCount: 3 } as never;
    expect(myAutosave([row], "u1", "d")).toBe(row);
    expect(myAutosave([row], "u2", "d")).toBeNull();
    expect(recoveryQuestion(row)).toContain("ACME (3 lines)");
  });
});
