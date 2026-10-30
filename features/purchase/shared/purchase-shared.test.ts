import { describe, expect, it } from "vitest";
import { allocPanelHint } from "./purchase-alloc";
import {
  chargeMethodLabel,
  deductPrefixed,
  ledgerPayee,
  LEDGER_PAYEE,
  masterOnBill,
  offBillMasters,
  payeesDto,
  type PurchaseChargeMasterRow,
} from "./purchase-charges";
import { shortRef } from "./purchase.format";
import {
  buildBillFromGrnHref,
  buildGrnFromPoHref,
  buildReturnAgainstBillHref,
  buildReturnAgainstGrnHref,
  GRN_ROUTE,
  parseBillFromGrn,
  parseGrnFromPo,
  parseReturnAgainstBill,
  parseReturnAgainstGrn,
  PURCHASE_ENTRY_ROUTE,
  PURCHASE_RETURN_ROUTE,
} from "./purchase-handoff";
import { allocPanelHeldHint } from "./use-purchase-alloc-panel";

const UUID = (n: number) => `0190f5a2-0000-7000-8000-${String(n).padStart(12, "0")}`;
const params = (href: string) => new URL(href, "https://x").searchParams;

describe("purchase hand-offs (one module)", () => {
  it("PO Make GRN → GRN ?fromPo= round-trips, godown optional", () => {
    const href = buildGrnFromPoHref({
      poId: UUID(1),
      accYear: "2026-2027",
      supplierId: UUID(2),
      supplierName: "ZT-PUR Supplier",
      refno: "PO/2026-2027/D14/00190",
      godownId: UUID(3),
      godownName: "Coimbatore",
    });
    expect(href.startsWith(`${GRN_ROUTE}?fromPo=`)).toBe(true);
    expect(parseGrnFromPo(params(href))).toEqual({
      poId: UUID(1),
      accYear: "2026-2027",
      supplierId: UUID(2),
      supplierName: "ZT-PUR Supplier",
      refno: "PO/2026-2027/D14/00190",
      godownId: UUID(3),
      godownName: "Coimbatore",
    });
    const bare = buildGrnFromPoHref({ poId: UUID(1), accYear: "2026-2027", supplierId: UUID(2), supplierName: "S", refno: "R" });
    expect(parseGrnFromPo(params(bare))).not.toHaveProperty("godownId");
    expect(parseGrnFromPo(params("/x?fromPo=nope&accYear=2026-2027"))).toBeNull();
    expect(parseGrnFromPo(null)).toBeNull();
  });

  it("GRN Make bill / Reject and the bill's Ctrl+F11 each land on their own route and marker", () => {
    const grn = { grnId: UUID(4), accYear: "2026-2027", supplierId: UUID(2), supplierName: "S", refno: "GRN/1" };
    const bill = buildBillFromGrnHref({ ...grn, godownId: UUID(3), godownName: "Main" });
    expect(bill.startsWith(`${PURCHASE_ENTRY_ROUTE}?fromGrn=`)).toBe(true);
    expect(parseBillFromGrn(params(bill))).toMatchObject({ grnId: UUID(4), godownId: UUID(3), godownName: "Main" });
    // one marker never reads as another
    expect(parseReturnAgainstGrn(params(bill))).toBeNull();
    const reject = buildReturnAgainstGrnHref(grn);
    expect(reject.startsWith(`${PURCHASE_RETURN_ROUTE}?againstGrn=`)).toBe(true);
    expect(parseReturnAgainstGrn(params(reject))).toEqual(grn);
    expect(parseBillFromGrn(params(reject))).toBeNull();
    const back = buildReturnAgainstBillHref({ piId: UUID(5), accYear: "2026-2027", supplierId: UUID(2), supplierName: "S", refno: "PUR/1" });
    expect(parseReturnAgainstBill(params(back))).toMatchObject({ piId: UUID(5) });
    expect(parseGrnFromPo(params(back))).toBeNull();
  });
});

describe("purchase charges (shared rules)", () => {
  const master = (patch: Partial<PurchaseChargeMasterRow>): PurchaseChargeMasterRow => ({ chgId: "c", chgName: "C", ...patch });

  it("absent On bill = on the bill; the GRN offers only our own active costs", () => {
    expect(masterOnBill(master({}))).toBe(true);
    expect(masterOnBill(master({ chgOnBill: false }))).toBe(false);
    const list = [
      master({ chgId: "a", chgOnBill: false }),
      master({ chgId: "b", chgOnBill: true }),
      master({ chgId: "c", chgOnBill: false, chgIsActive: false }),
      master({ chgId: "d", chgOnBill: false, chgIsDeleted: true }),
      master({ chgId: "e" }),
    ];
    expect(offBillMasters(list).map((m) => m.chgId)).toEqual(["a"]);
  });

  it("each screen keeps its own Basis wording (Qt has two tables)", () => {
    expect(chargeMethodLabel("qty", "invoice")).toBe("Per qty");
    expect(chargeMethodLabel("QTY", "grn")).toBe("Qty");
    expect(chargeMethodLabel("NET_QTY", "grn")).toBe("Net qty");
    expect(chargeMethodLabel("ODD", "grn")).toBe("ODD");
    expect(deductPrefixed("Per kg", "deduct")).toBe("Less: Per kg");
    expect(deductPrefixed("Per kg", "ADD")).toBe("Per kg");
  });

  it("payees go as partyIds; none = the charge's ledger", () => {
    expect(payeesDto(["p1", " ", "p2"])).toEqual([{ partyId: "p1" }, { partyId: "p2" }]);
    expect(payeesDto([])).toBeUndefined();
    expect(ledgerPayee("")).toBe(LEDGER_PAYEE);
    expect(ledgerPayee("Coolie A/c")).toBe("Coolie A/c (ledger)");
  });
});

describe("F12 inline panel words", () => {
  it("the panel's hint and the held-panel sentence (Qt)", () => {
    expect(allocPanelHint({ serial: true, textile: false })).toBe("one row per piece · count = received");
    expect(allocPanelHint({ serial: false, textile: true })).toBe("one row per size × colour · batch given on Post");
    expect(allocPanelHint({ serial: false, textile: false })).toBe("Σ = received + damaged + free");
    expect(allocPanelHeldHint(2, "Row 1: no qty.")).toBe(
      "Line 2's split does not add up yet — Row 1: no qty. Fix it, or Esc there to drop the change.",
    );
    expect(allocPanelHeldHint(3, "Row 2: no serial number.", "serials")).toBe(
      "Line 3's serials do not add up yet — Row 2: no serial number. Fix them, or Esc there to drop the change.",
    );
  });
});

describe("shortRef (Shortage Receipt + Supplier Dues)", () => {
  it("keeps the type and the number", () => {
    expect(shortRef("PUR/2026-2027/D14/00623")).toBe("PUR/…/00623");
    expect(shortRef("X/1")).toBe("X/1");
  });
});
