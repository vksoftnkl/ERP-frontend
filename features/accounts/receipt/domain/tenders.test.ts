import { describe, expect, it } from "vitest";
import { aTender, aTenderMaster } from "./fixtures";
import {
  defaultTender,
  givesChangeOn,
  isChequeTender,
  isPdc,
  offerableTenders,
  requiredRefLabel,
  retargetTender,
  tenderRowFrom,
  tenderTypeCodeOf,
} from "./tenders";

const CASH = "1";
const CARD = "2";
const UPI = "3";
const CHEQUE = "5";
const RRN = "7";
const VOUCHER = "11";

describe("tender type", () => {
  it("reads the type code off the numeric id", () => {
    expect(tenderTypeCodeOf(1)).toBe("CASH");
    expect(tenderTypeCodeOf(5)).toBe("CHEQUE");
  });

  it("recognises a cheque", () => {
    expect(isChequeTender(5)).toBe(true);
    expect(isChequeTender(1)).toBe(false);
  });

  it("re-exports the PDC test: a cheque dated after the receipt", () => {
    expect(isPdc("2026-10-01", "2026-09-18")).toBe(true);
    expect(isPdc("2026-09-18", "2026-09-18")).toBe(false);
    expect(isPdc(null, "2026-09-18")).toBe(false);
  });
});

describe("givesChangeOn", () => {
  it("cash always gives change, whatever the master says", () => {
    expect(givesChangeOn(aTenderMaster({ tndTypeId: CASH, tndAllowChange: false }))).toBe(true);
  });

  it("a non-cash tender follows its override, else the type default", () => {
    expect(givesChangeOn(aTenderMaster({ tndTypeId: CARD }))).toBe(false);
    expect(givesChangeOn(aTenderMaster({ tndTypeId: CARD, tndAllowChange: true }))).toBe(true);
  });
});

describe("requiredRefLabel", () => {
  it("a cheque always needs its number, even when the master says no", () => {
    expect(requiredRefLabel(aTenderMaster({ tndTypeId: CHEQUE, tndNeedsRef: false }))).toBe(
      "Cheque No",
    );
  });

  it("cash needs no reference by default", () => {
    expect(requiredRefLabel(aTenderMaster({ tndTypeId: CASH }))).toBeNull();
  });

  it("uses the type's own label when the type needs a reference", () => {
    expect(requiredRefLabel(aTenderMaster({ tndTypeId: UPI }))).toBe("UTR No");
  });

  it("honours a master override in either direction", () => {
    expect(requiredRefLabel(aTenderMaster({ tndTypeId: UPI, tndNeedsRef: false }))).toBeNull();
    expect(requiredRefLabel(aTenderMaster({ tndTypeId: CASH, tndNeedsRef: true }))).toBe(
      "Reference",
    );
  });
});

describe("offerableTenders", () => {
  it("drops the sale-only types", () => {
    const masters = [
      aTenderMaster({ tndTypeId: CASH, tndName: "Cash" }),
      aTenderMaster({ tndTypeId: RRN, tndName: "RRN" }),
      aTenderMaster({ tndTypeId: VOUCHER, tndName: "Gift voucher" }),
    ];
    expect(offerableTenders(masters, "2026-09-18").map((m) => m.tndName)).toEqual(["Cash"]);
  });

  it("filters by the RECEIPT's date, not today", () => {
    const retired = aTenderMaster({ tndName: "Old UPI", tndTypeId: UPI, tndEffectiveTo: "2026-06-30" });
    const future = aTenderMaster({ tndName: "New card", tndTypeId: CARD, tndEffectiveFrom: "2026-10-01" });
    expect(offerableTenders([retired, future], "2026-05-01").map((m) => m.tndName)).toEqual([
      "Old UPI",
    ]);
    expect(offerableTenders([retired, future], "2026-10-15").map((m) => m.tndName)).toEqual([
      "New card",
    ]);
  });

  it("drops inactive and deleted masters", () => {
    const masters = [
      aTenderMaster({ tndName: "Off", tndIsActive: false }),
      aTenderMaster({ tndName: "Gone", tndIsDeleted: true }),
    ];
    expect(offerableTenders(masters, "2026-09-18")).toEqual([]);
  });

  it("orders by display position, then by name", () => {
    const masters = [
      aTenderMaster({ tndName: "Zeta", tndDisplayPosition: 1 }),
      aTenderMaster({ tndName: "Beta", tndDisplayPosition: 2 }),
      aTenderMaster({ tndName: "Alpha", tndDisplayPosition: 2 }),
    ];
    expect(offerableTenders(masters, "2026-09-18").map((m) => m.tndName)).toEqual([
      "Zeta",
      "Alpha",
      "Beta",
    ]);
  });

  it("returns an empty list rather than inventing a CASH row", () => {
    expect(offerableTenders([], "2026-09-18")).toEqual([]);
  });
});

describe("defaultTender", () => {
  it("prefers the master flagged default", () => {
    const first = aTenderMaster({ tndName: "Cash" });
    const flagged = aTenderMaster({ tndName: "UPI", tndIsDefault: true });
    expect(defaultTender([first, flagged])).toBe(flagged);
  });

  it("falls back to the first offered, then to null", () => {
    const first = aTenderMaster({ tndName: "Cash" });
    expect(defaultTender([first])).toBe(first);
    expect(defaultTender([])).toBeNull();
  });
});

describe("tenderRowFrom", () => {
  it("builds a blank row on the master", () => {
    const master = aTenderMaster({ tndTypeId: CHEQUE, tndName: "Cheque", tndLedgerId: "led-bank" });
    const row = tenderRowFrom(master);
    expect(row).toMatchObject({
      tdId: null,
      tenderId: master.tndId,
      tenderTypeId: 5,
      tenderName: "Cheque",
      tenderLedgerId: "led-bank",
      amount: 0,
      refNo: "",
      instrumentDate: "",
    });
  });

  it("gives every row a fresh key", () => {
    const master = aTenderMaster();
    expect(tenderRowFrom(master).key).not.toBe(tenderRowFrom(master).key);
  });

  it("stores an empty ledger id as null", () => {
    expect(tenderRowFrom(aTenderMaster({ tndLedgerId: "" })).tenderLedgerId).toBeNull();
  });
});

describe("retargetTender", () => {
  const chequeRow = aTender({
    tenderTypeId: 5,
    amount: 5000,
    refNo: "55491",
    bankName: "SBI",
    instrumentDate: "2026-09-20",
    receivedAmt: 6000,
    changeAmt: 1000,
    cheque: { bankBranch: "Main", ifsc: "SBIN0001", drawerName: "Deepan", bankLedgerId: "led-sbi" },
  });

  it("drops the cheque extras when moving off a cheque", () => {
    const moved = retargetTender(chequeRow, aTenderMaster({ tndTypeId: UPI, tndName: "UPI" }));
    expect(moved.instrumentDate).toBe("");
    expect(moved.bankName).toBe("");
    expect(moved.cheque).toEqual({ bankBranch: "", ifsc: "", drawerName: "", bankLedgerId: null });
    expect(moved.tenderTypeId).toBe(3);
    expect(moved.tenderName).toBe("UPI");
  });

  it("drops received/change on a tender that gives no change", () => {
    const moved = retargetTender(chequeRow, aTenderMaster({ tndTypeId: CARD }));
    expect(moved.receivedAmt).toBe(0);
    expect(moved.changeAmt).toBe(0);
  });

  it("keeps what the new tender can hold", () => {
    const moved = retargetTender(chequeRow, aTenderMaster({ tndTypeId: CHEQUE }));
    expect(moved.instrumentDate).toBe("2026-09-20");
    expect(moved.cheque.ifsc).toBe("SBIN0001");

    const toCash = retargetTender(chequeRow, aTenderMaster({ tndTypeId: CASH }));
    expect(toCash.receivedAmt).toBe(6000);
    expect(toCash.changeAmt).toBe(1000);
  });

  it("never touches the amount or the reference", () => {
    const moved = retargetTender(chequeRow, aTenderMaster({ tndTypeId: CASH }));
    expect(moved.amount).toBe(5000);
    expect(moved.refNo).toBe("55491");
    expect(moved.key).toBe(chequeRow.key);
  });
});
