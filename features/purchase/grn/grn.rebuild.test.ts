/**
 * GRN (menu 196) — the Qt 2026-10-29 rebuild's rules: header fields, /validate
 * painting, Check chips, off-bill charges, totals strip, bill status, keys,
 * the Reject / Make bill hand-offs.
 */
import { describe, expect, it } from "vitest";
import { addCharge, chargeBasis, coolieMasterOf, editCharge, foldServerCharges, loadmenChanged, removeCharge } from "./grn-charges";
import { applyValidate, chipTone, shelfLifeText, shelfLifeTone, totalsCells } from "./grn-check";
import { buildBillFromGrnHref, buildReturnAgainstGrnHref, parseBillFromGrn, parseReturnAgainstGrn } from "../shared/purchase-handoff";
import { COL } from "./grn.constants";
import { grnScreenKey } from "./grn.keys";
import {
  applyItem,
  billStatusText,
  buildSavePayload,
  createDraft,
  editCell,
  fromPayload,
  isCellEditable,
  makeBillRefusal,
  receivedAtIso,
  receivedByText,
  setDamageReason,
  setGodown,
  setReceivedAt,
  setSupervisor,
  setSupplier,
  setTransport,
  statusPill,
} from "./grn.state";
import type { GrnChargeMasterRow, GrnDraft, GrnPayload, GrnValidateAnswer } from "./grn.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };
const UUID = (n: number) => `01a187d8-6f25-7a4e-ab04-${String(n).padStart(12, "0")}`;

const COOLIE: GrnChargeMasterRow = {
  chgId: "coolie",
  chgName: "ZT Unloading coolie",
  chgCode: "ZTP-COOLIE",
  chgModule: "P",
  chgMethod: "QTY",
  chgType: "ADD",
  chgRole: "UNLOADING",
  chgDefaultRate: 2,
  chgOnBill: false,
  chgIsActive: true,
  chgLedgerName: "Loading Charges Payable",
};
const LORRY: GrnChargeMasterRow = { ...COOLIE, chgId: "lorry", chgName: "ZT Own lorry freight", chgCode: "ZTP-OWNFRT", chgMethod: "FIXED", chgRole: "NONE", chgDefaultRate: 150 };
const ON_BILL: GrnChargeMasterRow = { ...COOLIE, chgId: "frt", chgName: "Freight (bill)", chgRole: "FREIGHT", chgOnBill: true };
const MASTERS = [LORRY, COOLIE, ON_BILL];

/** Supplier + godown + one direct line: challan 10, received 7, 1 damaged, at 100. */
function oneLine(): { draft: GrnDraft; key: string } {
  let draft = setGodown(setSupplier(createDraft(SCOPE, "2026-10-29", undefined, "2026-10-29T16:35"), "sup1", "S"), "gd1", "Main");
  const key = draft.lines[0].key;
  draft = applyItem(draft, key, { itemId: "item-a", itemName: "ZT-ITEM-A", uomId: "pcs", unitName: "PCS", mrp: 0 });
  draft = editCell(draft, key, COL.Challan, "10");
  draft = editCell(draft, key, COL.Recd, "7");
  draft = editCell(draft, key, COL.Dmg, "1");
  draft = editCell(draft, key, COL.Rate, "100");
  return { draft, key };
}

/** The live answer of /grns/validate for oneLine() (captured 2026-10-29 on :3011). */
const ANSWER: GrnValidateAnswer = {
  header: { supplierName: "ZT-PUR Supplier", godownName: "Coimbatore", poRefs: [] },
  lines: [
    {
      lineNo: 1,
      receivedQty: "7",
      freeQty: "0",
      excessQty: "0",
      excessAction: null,
      value: "800.00",
      check: {
        shortQty: "2",
        damagedQty: "1",
        damageReasonMissing: true,
        excessQty: "0",
        excessAction: null,
        shelfLifePct: null,
        minShelfLifePct: null,
        labels: 7,
        serials: null,
        chips: [
          { code: "SHORT", text: "SHORT 2" },
          { code: "DAMAGED", text: "1 DAMAGED" },
        ],
      },
    },
  ],
  charges: [],
  totals: {
    lines: 1,
    receivedBase: "7",
    damagedBase: "1",
    freeBase: "0",
    shortBase: "2",
    shortLines: 1,
    offbillCharges: "0.00",
    provisionalValue: "800.00",
    total: "800.00",
  },
  warnings: [
    { code: "PUR_SHORT_VS_CHALLAN", level: "WARN", lineNo: 1, field: "lines.0.receivedQty", needsRight: null, message: "Line 1 ZT-ITEM-A: the challan says 10, 8 arrived — 2 short goes to the shortage register." },
  ],
  refusals: [],
};

describe("grn — the header (Qt buildPayload)", () => {
  it("sends Received only when typed; the date part is the GRN date", () => {
    const { draft } = oneLine();
    expect(buildSavePayload(draft, false).header).not.toHaveProperty("receivedAt");
    const typed = setReceivedAt(draft, "2026-10-28T09:05");
    expect(typed.docDate).toBe("2026-10-28");
    expect(buildSavePayload(typed, false).header.receivedAt).toBe(receivedAtIso("2026-10-28T09:05"));
    expect(receivedAtIso("not a time")).toBe("");
  });

  it("sends supervisor, driver, e-way bill, packages; transport only when touched (null = removed)", () => {
    let { draft } = oneLine();
    draft = setSupervisor(draft, "emp9", "Bala");
    expect(receivedByText(draft)).toBe("Bala (supervisor)");
    draft = { ...draft, driverName: " Mani ", ewbNo: "351288401123", ewbDate: "2026-10-24", packagesSent: "34", packagesReceived: "33" };
    let header = buildSavePayload(draft, false).header;
    expect(header).toMatchObject({ supervisorId: "emp9", driverName: "Mani", ewbNo: "351288401123", ewbDate: "2026-10-24", packagesSent: 34, packagesReceived: 33 });
    expect(header).not.toHaveProperty("transport");
    draft = setTransport(draft, { lrNo: "88412", transporterName: "KPN Parcel" });
    expect(buildSavePayload(draft, false).header.transport).toEqual({ lrNo: "88412", transporterName: "KPN Parcel" });
    header = buildSavePayload(setTransport(draft, null), false).header;
    expect(header.transport).toBeNull();
  });

  it("adds overrideWarnings + the reason on a post past the warnings", () => {
    const { draft } = oneLine();
    expect(buildSavePayload(draft, true, { reason: "  supplier agreed  " }).header).toMatchObject({ overrideWarnings: true, overrideReason: "supplier agreed" });
    expect(buildSavePayload(draft, false, { reason: "x" }).header).not.toHaveProperty("overrideWarnings");
  });

  it("names the damage reason only on a damaged line, and drops it with the damage", () => {
    const start = oneLine();
    const key = start.key;
    let draft = start.draft;
    expect(isCellEditable(draft, draft.lines[0], COL.DmgReason)).toBe(true);
    draft = setDamageReason(draft, key, "srm1", "Damaged");
    expect(buildSavePayload(draft, false).lines[0]).toMatchObject({ damagedQty: 1, damageReasonId: "srm1" });
    draft = editCell(draft, key, COL.Dmg, "0");
    expect(draft.lines[0]).toMatchObject({ damageReasonId: "", damageReasonName: "" });
    expect(isCellEditable(draft, draft.lines[0], COL.DmgReason)).toBe(false);
  });
});

describe("grn — /validate onto the screen (Qt paintCalc)", () => {
  it("paints value, Check, totals and the strip without dirtying or changing what is asked", () => {
    const { draft } = oneLine();
    const asked = JSON.stringify(buildSavePayload(draft, false));
    const next = applyValidate({ ...draft, dirty: false, godownName: "" }, ANSWER, MASTERS);
    expect(next.dirty).toBe(false);
    expect(next.godownName).toBe("Coimbatore");
    expect(next.lines[0]).toMatchObject({ serverValue: "800.00" });
    expect(next.lines[0].check?.chips.map((chip) => chip.text)).toEqual(["SHORT 2", "1 DAMAGED"]);
    expect(next.warnings).toHaveLength(1);
    expect(JSON.stringify(buildSavePayload(next, false))).toBe(asked);
    const cells = totalsCells(next);
    expect(cells.map((cell) => cell.value)).toEqual(["1", "7", "1", "2 pcs", "0.00", "800.00"]);
    expect(cells.find((cell) => cell.key === "short")?.tone).toBe("bad");
  });

  it("lands the server's excess in Excess unless the line says RETURN", () => {
    const { draft } = oneLine();
    const over: GrnValidateAnswer = { ...ANSWER, lines: [{ ...ANSWER.lines[0], excessQty: "2" }] };
    expect(applyValidate(draft, over, []).lines[0].excess).toBe("2");
    const kept = { ...draft, lines: draft.lines.map((line, i) => (i === 0 ? { ...line, excessAction: "RETURN" as const, excess: "1" } : line)) };
    expect(applyValidate(kept, over, []).lines[0].excess).toBe("1");
  });

  it("colours the chips as Qt chipOf, and shelf life against its minimum", () => {
    expect(chipTone({ code: "OK", text: "OK" }, null)).toBe("success");
    expect(chipTone({ code: "SHELF_LIFE", text: "SHELF LIFE" }, null)).toBe("danger");
    expect(chipTone({ code: "DAMAGED", text: "2 DAMAGED" }, null)).toBe("warning");
    expect(chipTone({ code: "EXCESS", text: "EXCESS 1" }, null)).toBe("info");
    const check = { shelfLifePct: 41, minShelfLifePct: 60, labels: 5, serials: { have: 5, need: "5" }, chips: [] };
    expect(chipTone({ code: "SERIALS", text: "5/5 SN" }, check)).toBe("success");
    expect(chipTone({ code: "SERIALS", text: "3/5 SN" }, { ...check, serials: { have: 3, need: "5" } })).toBe("danger");
    expect(shelfLifeTone(check)).toBe("bad");
    expect(shelfLifeTone({ ...check, shelfLifePct: 82 })).toBe("good");
    const { draft } = oneLine();
    expect(shelfLifeText(draft.lines[0])).toBe("—");
    expect(shelfLifeText({ ...draft.lines[0], check })).toBe("41 %");
  });
});

describe("grn — off-bill charges (Qt D13)", () => {
  it("picks the company's coolie: off-bill UNLOADING, module P first, lowest code", () => {
    expect(coolieMasterOf(MASTERS)?.chgId).toBe("coolie");
    expect(coolieMasterOf([LORRY, ON_BILL])).toBeNull();
    expect(chargeBasis("QTY", "ADD")).toBe("Qty");
    expect(chargeBasis("KG", "DEDUCT")).toBe("Less: Per kg");
  });

  it("untouched: the server's set stands and the loadmen are its payees; nothing is sent", () => {
    let { draft } = oneLine();
    draft = loadmenChanged(draft, [{ id: "e1", text: "Ravi" }, { id: "e2", text: "Kumar" }], COOLIE);
    expect(draft.charges).toHaveLength(0);
    const rows = foldServerCharges([], [{ chgId: "coolie", amount: "20.00", payees: [{ partyId: "l1", partyName: "Ravi - Staff Advance", amount: "10.00" }, { partyId: "l2", partyName: "Kumar - Staff Advance", amount: "10.00" }] }], { touched: false, loadmen: draft.loadmen, masters: MASTERS });
    expect(rows[0]).toMatchObject({ name: "ZT Unloading coolie", role: "UNLOADING", amount: "20.00", payeeIds: ["e1", "e2"], payeeText: "Ravi 10.00 · Kumar 10.00" });
    expect(buildSavePayload({ ...draft, charges: rows }, false)).not.toHaveProperty("charges");
  });

  it("touched: own lorry freight + the coolie kept for the loadmen; refuses an on-bill charge", () => {
    let { draft } = oneLine();
    draft = loadmenChanged(draft, [{ id: "e1", text: "Ravi" }], COOLIE);
    const refused = addCharge(draft, ON_BILL, COOLIE);
    expect(refused.refusal).toContain("on the supplier's bill");
    expect(refused.draft.charges).toHaveLength(0);
    draft = addCharge(draft, LORRY, COOLIE).draft;
    expect(draft.charges.map((row) => row.chgId)).toEqual(["coolie", "lorry"]);
    draft = editCharge(draft, draft.charges[1].key, "amount", "400");
    const body = buildSavePayload(draft, false);
    expect(body.charges).toEqual([
      { chgId: "coolie", rate: 2, payees: [{ partyId: "e1" }] },
      { chgId: "lorry", amount: 400 },
    ]);
    expect(body.header).not.toHaveProperty("payCoolie");
    draft = removeCharge(draft, draft.charges[0].key);
    expect(draft.coolieDropped).toBe(true);
    expect(buildSavePayload(draft, false).header.payCoolie).toBe(false);
    // Taken out: the coolie does not come back with the loadmen.
    draft = loadmenChanged(draft, [{ id: "e1", text: "Ravi" }, { id: "e2", text: "Kumar" }], COOLIE);
    expect(draft.charges.map((row) => row.chgId)).toEqual(["lorry"]);
  });
});

describe("grn — loading the rebuild's fields (Qt applyLoaded)", () => {
  const payload: GrnPayload = {
    header: {
      grnId: "g1",
      grnRefno: "GRN/2026-2027/D14/00413",
      grnCompanyId: "c1",
      grnBranchId: "b1",
      grnAccYear: "2026-2027",
      grnSupplierId: "sup1",
      supplierName: "ZT-PUR Supplier",
      grnGodownId: "gd1",
      godownName: "Coimbatore",
      grnDocDate: "2026-10-29T00:00:00.000Z",
      grnReceivedAt: "2026-10-29T13:27:50.819Z",
      grnSupervisorId: "emp9",
      supervisorName: "ZT Supervisor Bala",
      grnDriverName: "Mani",
      grnEwbNo: "351288401123",
      grnEwbDate: "2026-10-24T00:00:00.000Z",
      grnPackagesSent: 34,
      grnPackagesReceived: 34,
      grnStatus: "POSTED",
      receivedBy: [{ id: "e1", name: "ZT Loadman Ravi" }, { id: "e2", name: "ZT Loadman Kumar" }],
      billStatus: "PART",
      transport: { lrNo: "88412", transporterName: "KPN Parcel" },
    },
    lines: [
      { griId: "l1", griItemId: "a", griUomId: "u", griReceivedQty: "8", griProvisionalRate: "90", griValue: "720", griDamagedQty: "1", griDamageReasonId: "srm1", damageReasonName: "Damaged", billed: true, billRefno: "PUR/00012", check: { shelfLifePct: null, minShelfLifePct: null, labels: 8, serials: null, chips: [{ code: "OK", text: "OK" }] } },
      { griId: "l2", griItemId: "b", griUomId: "u", griReceivedQty: "2", griProvisionalRate: "50" },
    ],
    charges: [
      { chgId: "coolie", chgName: "ZT Unloading coolie", role: "UNLOADING", method: "QTY", type: "ADD", rate: "2", amount: "20.00", payees: [{ partyId: "l1", partyName: "x", amount: "10.00" }, { partyId: "l2", partyName: "y", amount: "10.00" }] },
    ],
    totals: { lines: 2, receivedBase: "10", damagedBase: "1", freeBase: "0", shortBase: "0", shortLines: 0, offbillCharges: "20.00", provisionalValue: "820.00", total: "840.00" },
  };

  it("restores godown, supervisor, transport, bill status, the coolie as a sent set", () => {
    const draft = fromPayload(createDraft(SCOPE, "2026-10-28"), payload, { viewMode: "entry", deviceId: "d1" });
    expect(draft).toMatchObject({
      godownName: "Coimbatore",
      supervisorId: "emp9",
      supervisorName: "ZT Supervisor Bala",
      driverName: "Mani",
      ewbDate: "2026-10-24",
      packagesSent: "34",
      receivedTyped: false,
      transportTouched: false,
      billStatus: "PART",
      chargesTouched: true,
      coolieDropped: false,
    });
    expect(draft.receivedAt).toMatch(/^2026-10-29T\d{2}:\d{2}$/);
    expect(draft.lines[0]).toMatchObject({ damageReasonName: "Damaged", serverValue: "720", billRefno: "PUR/00012" });
    expect(draft.charges[0]).toMatchObject({ payeeIds: ["e1", "e2"], amount: "20.00" });
    expect(statusPill(draft)).toEqual({ label: "PART BILLED", status: "PART_BILLED" });
    expect(billStatusText(draft)).toBe("Part billed — PUR/00012");
    expect(makeBillRefusal(draft)).toBe("");
    const billed = { ...draft, billStatus: "BILLED" as const };
    expect(statusPill(billed).label).toBe("BILLED");
    expect(makeBillRefusal(billed)).toBe("Every line of this GRN is billed");
    expect(makeBillRefusal(createDraft(SCOPE, "2026-10-28"))).toContain("Post the GRN first");
    expect(billStatusText(createDraft(SCOPE, "2026-10-28"))).toBe("");
  });
});

describe("grn — keys and hand-offs", () => {
  const key = (over: Partial<KeyboardEvent>) =>
    ({ key: "", ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, defaultPrevented: false, ...over }) as KeyboardEvent;
  const free = { overlayOpen: false, typingTarget: false };

  it("Ctrl+L From PO, Ctrl+B Make bill, Ctrl+Shift+P labels; Ctrl+P stays the print", () => {
    expect(grnScreenKey(key({ key: "l", ctrlKey: true }), free).action).toBe("fromPo");
    expect(grnScreenKey(key({ key: "b", ctrlKey: true }), free).action).toBe("makeBill");
    expect(grnScreenKey(key({ key: "P", ctrlKey: true, shiftKey: true }), free).action).toBe("labels");
    expect(grnScreenKey(key({ key: "p", ctrlKey: true }), free)).toEqual({ action: null, swallow: false });
    expect(grnScreenKey(key({ key: "l", ctrlKey: true }), { overlayOpen: true, typingTarget: false }).action).toBeNull();
  });

  it("hands the GRN to the Return (against GRN) and to Purchase Entry (From GRN)", () => {
    const handoff = { grnId: UUID(1), accYear: "2026-2027", supplierId: UUID(2), supplierName: "ZT-PUR Supplier", refno: "GRN/2026-2027/D14/00413" };
    const reject = buildReturnAgainstGrnHref(handoff);
    expect(reject.startsWith("/purchase/purchase-return?againstGrn=")).toBe(true);
    expect(parseReturnAgainstGrn(new URL(reject, "https://x").searchParams)).toEqual(handoff);
    const bill = buildBillFromGrnHref({ ...handoff, godownId: UUID(3), godownName: "Coimbatore" });
    expect(bill.startsWith("/purchase/purchase-entry?fromGrn=")).toBe(true);
    expect(parseBillFromGrn(new URL(bill, "https://x").searchParams)).toMatchObject({ godownId: UUID(3), godownName: "Coimbatore" });
    expect(parseBillFromGrn(new URL("/x?fromGrn=nope", "https://x").searchParams)).toBeNull();
  });
});
