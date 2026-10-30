import { describe, expect, it } from "vitest";
import {
  batchExpText,
  billedOf,
  bucketChoices,
  buildPrimeBody,
  buildSaveBody,
  buildValidateBody,
  claimOnNeeded,
  consequenceOf,
  createDraft,
  draftFromPayload,
  editAnswer,
  ewbPlaceholder,
  isEditable,
  issuesOfError,
  outcomeChoices,
  outcomeCodeOf,
  placeOfSupplyText,
  purchaseReturnReducer,
  returnReasonsOf,
  saveRefusal,
  settlementDefaultOf,
  stepEndNotice,
  supplierDuesHref,
  totalsCells,
  withRecalledDefaults,
  writesTipOf,
  type ReturnAction,
} from "./return.state";
import type { ReturnDraft, ReturnPayload, ReturnSourceLine, ReturnValidateAnswer } from "./return.types";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027", deviceId: "d1" };

/** The Qt live test's fixture bill: 10 ZT-ITEM-A @ 100 + 18 %, 20 MRP items @ 50 + 12 % with 2 damaged. */
const LINES: ReturnSourceLine[] = [
  {
    srcItemId: "src-a",
    lineNo: 1,
    itemId: "item-a",
    uomId: "u1",
    itemName: "ZT-ITEM-A",
    unitName: "PCS",
    inQty: "10",
    returnedQty: "0",
    returnableQty: "10",
    rate: "100",
    gstPct: "18",
    unitTaxable: "100.0000",
    unitTotal: "118",
    lots: [
      { lotId: "lot-a2", bucket: "SALEABLE", godownId: "g2", batchNo: "B-A2", expiryDate: null, mrp: null, qty: "4" },
      { lotId: "lot-a", bucket: "SALEABLE", godownId: "g1", batchNo: "B-A", expiryDate: "2027-02-15", mrp: "120", qty: "6" },
    ],
  },
  {
    srcItemId: "src-m",
    lineNo: 2,
    itemId: "item-m",
    uomId: "u2",
    itemName: "MRP ITEM",
    unitName: "PCS",
    inQty: "20",
    returnedQty: "0",
    returnableQty: "20",
    rate: "50",
    gstPct: "12",
    unitTaxable: "50.0000",
    unitTotal: "56",
    lots: [
      { lotId: "lot-m", bucket: "SALEABLE", godownId: "g1", batchNo: "B-M", expiryDate: null, mrp: "80", qty: "18" },
      { lotId: "lot-m", bucket: "DAMAGED", godownId: "g1", batchNo: "B-M", expiryDate: null, mrp: "80", qty: "2" },
    ],
  },
];

function run(draft: ReturnDraft, ...actions: ReturnAction[]): ReturnDraft {
  return actions.reduce(purchaseReturnReducer, draft);
}

function withBill(): ReturnDraft {
  return run(
    createDraft(SCOPE, "2026-10-28"),
    { type: "setSupplier", id: "sup-1", name: "ZT-PUR Supplier" },
    {
      type: "sourcesLoaded",
      supplierId: "sup-1",
      kind: "AGAINST_INVOICE",
      rows: [{ srcDocId: "pi-1", srcAccYear: "2026-2027", refno: "PUR/1", supplierRef: "INV-9", docDate: "2026-10-27T00:00:00.000Z", amount: "2300" }],
    },
    { type: "sourceLinesLoaded", srcDocId: "pi-1", srcAccYear: "2026-2027", lines: LINES },
  );
}

const TODAY = "2026-10-29";

function key(draft: ReturnDraft, index: number): string {
  return draft.rows[index].key;
}

/** The answer /validate gave live (2026-10-29) for one CLAIM_DESTROYED row of 1 @ 100 + 18 %. */
function destroyedAnswer(): ReturnValidateAnswer {
  return {
    header: { supplierId: "sup-1", supplierName: "ZT-PUR Supplier", srcRefno: "PUR/1", godownId: "g1", placeOfSupply: "33" },
    lines: [
      {
        lineNo: 1,
        srcItemId: "src-a",
        outcome: "CLAIM_DESTROYED",
        billedQty: "10",
        returnedQty: "0",
        returnableQty: "10",
        lotId: "lot-a",
        batchNo: "B-A",
        expiryDate: "2027-02-15",
        mrp: "120",
        taxable: "100",
        tax: "18",
        total: "118",
        creditTo: { kind: "SUPPLIER", name: "ZT-PUR Supplier" },
        writes: [
          { drCr: "DR", head: "Claim receivable", amount: "100.00" },
          { drCr: "DR", head: "ITC reversal", amount: "18.00" },
          { drCr: "CR", head: "Stock (lot cost)", amount: null },
          { drCr: "CR", head: "Input GST", amount: "18.00" },
        ],
      },
    ],
    totals: {
      rows: 1,
      returnNow: "0.00",
      claimsRaised: "100.00",
      replaceQtyBase: "0",
      itcReversed: "18.00",
      itcOnDestroyed: "18.00",
      itcPendingOnReplace: "0.00",
      goodsValue: "118.00",
      supplierBalance: "500.00",
      supplierBalanceNow: "500.00",
    },
    warnings: [],
    refusals: [],
  };
}

describe("purchase return — source", () => {
  it("offers the supplier's bills: the field's words and the picker's", () => {
    const draft = withBill();
    expect(draft.sources).toEqual([
      { srcDocId: "pi-1", srcAccYear: "2026-2027", label: "PUR/1 · INV-9", detail: "PUR/1 · INV-9 · 27/10/2026 · 2,300.00" },
    ]);
  });

  it("drops a sources answer for a supplier the screen has left", () => {
    const draft = run(
      createDraft(SCOPE, "2026-10-28"),
      { type: "setSupplier", id: "sup-2", name: "Other" },
      { type: "sourcesLoaded", supplierId: "sup-1", kind: "AGAINST_INVOICE", rows: [] },
    );
    expect(draft.sourcesState).toBe("loading");
  });

  it("brings in one row per line with returned / returnable, Return, the godown from the first lot", () => {
    const draft = withBill();
    expect(draft.rows).toHaveLength(2);
    expect(draft.godownId).toBe("g2");
    expect(draft.rows.map((row) => row.returnable)).toEqual([10, 20]);
    expect(draft.rows.map((row) => row.returned)).toEqual([0, 0]);
    expect(draft.rows[0]).toMatchObject({ rate: 100, outcome: "RETURN", bucket: "SALEABLE", lotId: "lot-a2", unitTax: 18, billed: "" });
  });

  it("skips a line with nothing left to return", () => {
    const lines = [{ ...LINES[0], returnableQty: "0" }, LINES[1]];
    const draft = run(withBill(), { type: "sourceLinesLoaded", srcDocId: "pi-2", srcAccYear: "2026-2027", lines });
    expect(draft.rows.map((row) => row.srcItemId)).toEqual(["src-m"]);
  });

  it("keeps the bill's place of supply", () => {
    const draft = run(withBill(), { type: "sourceLinesLoaded", srcDocId: "pi-1", srcAccYear: "2026-2027", lines: LINES, posStcd: "33" });
    expect(draft.posStcd).toBe("33");
    expect(placeOfSupplyText("33", "33", "Tamil Nadu")).toBe("Tamil Nadu (33) · local — as the bill");
    expect(placeOfSupplyText("29", "33", "Tamil Nadu")).toBe("State 29 · inter-state — as the bill");
  });

  it("a new supplier clears the source and the rows", () => {
    const draft = run(withBill(), { type: "setSupplier", id: "sup-3", name: "Third" });
    expect(draft.rows).toHaveLength(0);
    expect(draft.srcDocId).toBe("");
  });
});

describe("purchase return — rows", () => {
  it("outcomes: four on a bill, Return only against a GRN", () => {
    expect(outcomeChoices("AGAINST_INVOICE")).toEqual(["RETURN", "CLAIM_SENT", "CLAIM_DESTROYED", "REPLACE"]);
    expect(outcomeChoices("AGAINST_GRN")).toEqual(["RETURN"]);
  });

  it("reads any spelling of an outcome", () => {
    expect(outcomeCodeOf("Claim — goods sent")).toBe("CLAIM_SENT");
    expect(outcomeCodeOf("CLAIM DESTROYED")).toBe("CLAIM_DESTROYED");
    expect(outcomeCodeOf("REPLACE")).toBe("REPLACE");
    expect(outcomeCodeOf("junk")).toBe("RETURN");
  });

  it("a claim row is on the supplier until told otherwise; leaving the claim clears it", () => {
    const base = withBill();
    let draft = run(base, { type: "editOutcome", key: key(base, 0), outcome: "CLAIM_SENT" });
    expect(draft.rows[0].claimOn).toBe("SUPPLIER");
    draft = run(draft, { type: "editClaimOn", key: key(draft, 0), claimOn: "TRANSPORTER" });
    expect(claimOnNeeded(draft)).toBe(true);
    draft = run(draft, { type: "editOutcome", key: key(draft, 0), outcome: "RETURN" });
    expect(draft.rows[0].claimOn).toBe("");
    expect(claimOnNeeded(draft)).toBe(false);
  });

  it("Credit to / Writes per outcome (Qt refreshConsequence)", () => {
    const row = withBill().rows[0];
    expect(consequenceOf("AGAINST_INVOICE", row)).toMatchObject({ creditTo: "Supplier now", writes: "Dr Sup / Cr Stk" });
    expect(consequenceOf("AGAINST_INVOICE", { ...row, outcome: "CLAIM_SENT", claimOn: "INSURER" })).toMatchObject({
      creditTo: "Claim receivable · insurer",
      writes: "Dr Claim / Cr Stk",
      creditTone: "warn",
    });
    expect(consequenceOf("AGAINST_INVOICE", { ...row, outcome: "CLAIM_DESTROYED", claimOn: "SUPPLIER" })).toMatchObject({
      writes: "ITC reversed",
      writesTone: "bad",
    });
    expect(consequenceOf("AGAINST_INVOICE", { ...row, outcome: "REPLACE", qty: "5" })).toMatchObject({
      creditTo: "— (shortage row)",
      writes: "Replace due 5",
      creditTone: "info",
    });
    expect(consequenceOf("AGAINST_GRN", row)).toMatchObject({ creditTo: "GRN clearing (no bill yet)", writes: "Dr GRNI / Cr Stk" });
  });

  it("Batch · Exp in one cell", () => {
    expect(batchExpText({ batchNo: "MG1026", expiryDate: "2027-02-15T00:00:00.000Z" })).toBe("MG1026 · 15/02/27");
    expect(batchExpText({ batchNo: "", expiryDate: "" })).toBe("— · —");
  });

  it("bucket choices are the holdings the line brought; a bucket change re-picks the lot", () => {
    const base = withBill();
    expect(bucketChoices(base, base.rows[1])).toEqual(["SALEABLE", "DAMAGED"]);
    const draft = run(base, { type: "editBucket", key: key(base, 1), bucket: "DAMAGED" });
    expect(draft.rows[1]).toMatchObject({ bucket: "DAMAGED", lotId: "lot-m" });
  });

  it("the header godown re-picks each row's lot in it; F12 sets the exact lot", () => {
    const base = withBill();
    let draft = run(base, { type: "setGodown", id: "g1", name: "Main" });
    expect(draft.rows[0]).toMatchObject({ lotId: "lot-a", batchNo: "B-A", expiryDate: "2027-02-15", mrp: "120" });
    draft = run(draft, { type: "setLot", key: key(draft, 0), lotId: "lot-a2" });
    expect(draft.rows[0]).toMatchObject({ lotId: "lot-a2", batchNo: "B-A2" });
  });

  it("+ splits a bill line into another row (billed copied); − drops it", () => {
    const base = withBill();
    const primed = run(base, { type: "billedPrimed", srcDocId: "pi-1", billed: { "src-a": "10" } });
    let draft = run(primed, { type: "splitRow", key: key(primed, 0), newKey: "split" });
    expect(draft.rows.map((row) => row.key)).toEqual([key(primed, 0), "split", key(primed, 1)]);
    expect(draft.rows[1]).toMatchObject({ srcItemId: "src-a", billed: "10", qty: "" });
    draft = run(draft, { type: "removeRow", key: "split" });
    expect(draft.rows).toHaveLength(2);
  });

  it("a reason sticks to its row and rides the line", () => {
    const base = withBill();
    const draft = run(
      base,
      { type: "editQty", key: key(base, 0), raw: "2" },
      { type: "editReason", key: key(base, 0), reasonId: "r-exp", reasonName: "Expired" },
    );
    expect(buildSaveBody(draft, false, TODAY).lines[0]).toMatchObject({ reasonId: "r-exp" });
  });

  it("every row edit bumps calcSeq (the debounced /validate)", () => {
    const base = withBill();
    const draft = run(base, { type: "editQty", key: key(base, 0), raw: "1" });
    expect(draft.calcSeq).toBe(base.calcSeq + 1);
  });
});

describe("purchase return — /validate", () => {
  function typed(): ReturnDraft {
    const base = withBill();
    return run(
      base,
      { type: "editQty", key: key(base, 0), raw: "1" },
      { type: "editOutcome", key: key(base, 0), outcome: "CLAIM_DESTROYED" },
    );
  }

  it("asks with the typed rows only and remembers which rows it sent", () => {
    const draft = typed();
    const ask = buildValidateBody(draft, TODAY);
    expect(ask?.keys).toEqual([draft.rows[0].key]);
    expect(ask?.body.lines).toEqual([{ lineNo: 1, srcItemId: "src-a", outcome: "CLAIM_DESTROYED", qty: 1, bucket: "SALEABLE", lotId: "lot-a2", claimAgainst: "SUPPLIER" }]);
    expect(buildValidateBody(withBill(), TODAY)).toBeNull();
  });

  it("paints the server's row facts and the six totals", () => {
    const draft0 = typed();
    const ask = buildValidateBody(draft0, TODAY);
    const draft = run(draft0, { type: "validated", seq: draft0.calcSeq, sentKeys: ask?.keys ?? [], answer: destroyedAnswer() });
    expect(draft.rows[0]).toMatchObject({ billed: "10", value: 100, tax: 18, total: 118, lotId: "lot-a", creditName: "ZT-PUR Supplier" });
    expect(draft.rows[0].writesTip).toBe("Dr Claim receivable 100.00\nDr ITC reversal 18.00\nCr Stock (lot cost)\nCr Input GST 18.00");
    expect(draft.posStcd).toBe("33");
    expect(totalsCells(draft).map((cell) => [cell.key, cell.value])).toEqual([
      ["rows", "1"],
      ["returnNow", "0.00"],
      ["claims", "100.00"],
      ["replace", "none"],
      ["itc", "18.00"],
      ["balance", "500.00"],
    ]);
  });

  it("drops an answer to an older body", () => {
    const draft0 = typed();
    const draft = run(draft0, { type: "validated", seq: draft0.calcSeq - 1, sentKeys: [key(draft0, 0)], answer: destroyedAnswer() });
    expect(draft).toBe(draft0);
  });

  it("Replace qty due reads in the rows' unit", () => {
    const base = withBill();
    let draft = run(base, { type: "editQty", key: key(base, 0), raw: "5" }, { type: "editOutcome", key: key(base, 0), outcome: "REPLACE" });
    const answer = destroyedAnswer();
    answer.totals = { ...answer.totals, replaceQtyBase: "5" };
    draft = run(draft, { type: "validated", seq: draft.calcSeq, sentKeys: [key(draft, 0)], answer });
    expect(totalsCells(draft).find((cell) => cell.key === "replace")?.value).toBe("5 pcs");
  });

  it("the e-way bill placeholder follows the server's warning", () => {
    const draft0 = typed();
    const answer = destroyedAnswer();
    expect(ewbPlaceholder(run(draft0, { type: "validated", seq: draft0.calcSeq, sentKeys: [key(draft0, 0)], answer }))).toBe("not needed (118.00)");
    answer.warnings = [{ code: "PUR_RETURN_EWB_NEEDED", message: "above the limit", level: "WARN" }];
    expect(ewbPlaceholder(run(draft0, { type: "validated", seq: draft0.calcSeq, sentKeys: [key(draft0, 0)], answer }))).toBe(
      "needed — goods 118.00 above the limit",
    );
  });

  it("a refused /validate puts its errors on the strip", () => {
    const draft0 = typed();
    const errors = issuesOfError({ data: { errors: [{ code: "PUR_RETURN_QTY_EXCEEDS", message: "only 0 left", field: "lines" }] } });
    const draft = run(draft0, { type: "validateRefused", seq: draft0.calcSeq, errors, hint: "only 0 left" });
    expect(draft.refusals).toEqual([{ code: "PUR_RETURN_QTY_EXCEEDS", message: "only 0 left", field: "lines", level: "REFUSE" }]);
  });

  it("the prime body sends a token qty per returnable line and no godown; billedOf reads it back", () => {
    const body = buildPrimeBody(withBill(), TODAY);
    expect(body?.header.godownId).toBeUndefined();
    expect(body?.lines.map((line) => [line.srcItemId, line.qty, line.outcome])).toEqual([
      ["src-a", 1, "RETURN"],
      ["src-m", 1, "RETURN"],
    ]);
    expect(billedOf(destroyedAnswer())).toEqual({ "src-a": "10" });
  });

  it("writes in words", () => {
    expect(writesTipOf([{ drCr: "DR", head: "Supplier (debit note)", amount: "1236.00" }])).toBe("Dr Supplier (debit note) 1,236.00");
  });
});

describe("purchase return — save", () => {
  it("refuses without supplier / source / qty", () => {
    expect(saveRefusal(createDraft(SCOPE, TODAY))?.focus).toBe("supplier");
    expect(saveRefusal(withBill())?.title).toBe("Nothing going back");
  });

  it("builds the header with godown, our ref (always), e-way, driver and the transport only once touched", () => {
    const base = withBill();
    let draft = run(
      base,
      { type: "editQty", key: key(base, 0), raw: "2" },
      { type: "setHeader", patch: { ewbNo: "3512", ewbDate: "2026-10-29", driverName: "Mani", vehicleNo: "TN38AB1234" } },
    );
    let header = buildSaveBody(draft, true, TODAY).header;
    expect(header).toMatchObject({ godownId: "g2", ourRef: null, ewbNo: "3512", ewbDate: "2026-10-29", driverName: "Mani", post: true });
    expect("transport" in header).toBe(false);
    draft = run(draft, { type: "setTransport", band: { lrNo: "90233", transporterName: "KPN Parcel" } }, { type: "setHeader", patch: { ourRef: "Claim memo 17" } });
    header = buildSaveBody(draft, false, TODAY).header;
    expect(header).toMatchObject({ ourRef: "Claim memo 17", transport: { lrNo: "90233", transporterName: "KPN Parcel" } });
    draft = run(draft, { type: "setTransport", band: null });
    expect(buildSaveBody(draft, false, TODAY).header.transport).toBeNull();
  });

  it("a TRANSPORTER claim row carries the header claim party", () => {
    const base = withBill();
    const draft = run(
      base,
      { type: "editQty", key: key(base, 0), raw: "1" },
      { type: "editOutcome", key: key(base, 0), outcome: "CLAIM_SENT" },
      { type: "editClaimOn", key: key(base, 0), claimOn: "TRANSPORTER" },
      { type: "setClaimParty", id: "led-kpn", name: "KPN Parcel" },
    );
    expect(buildSaveBody(draft, false, TODAY).lines[0]).toMatchObject({ claimAgainst: "TRANSPORTER", claimPartyId: "led-kpn" });
  });

  it("settlement default follows the branch until the operator picks", () => {
    expect(settlementDefaultOf("CASH")).toBe("ADJUST");
    expect(settlementDefaultOf("ADVANCE")).toBe("ADVANCE");
    let draft = run(createDraft(SCOPE, TODAY), { type: "settlementDefault", settlement: "ADVANCE" });
    expect(draft.settlement).toBe("ADVANCE");
    draft = run(draft, { type: "setHeader", patch: { settlement: "ADJUST" } }, { type: "settlementDefault", settlement: "ADVANCE" });
    expect(draft.settlement).toBe("ADJUST");
  });
});

describe("purchase return — a loaded return", () => {
  const payload: ReturnPayload = {
    header: {
      prId: "pr-1",
      prCompanyId: "c1",
      prBranchId: "b1",
      prAccYear: "2026-2027",
      prRefno: "PRN/2026-2027/D14/00214",
      prDocDate: "2026-10-29T00:00:00.000Z",
      prKind: "AGAINST_INVOICE",
      prSrcDocId: "pi-1",
      prSrcAccYear: "2026-2027",
      prSupplierId: "sup-1",
      supplierName: "ZT-PUR Supplier",
      prGodownId: "g1",
      godownName: "Coimbatore",
      prPosStcd: null,
      placeOfSupply: "33",
      prOurRef: "PUR/2026-2027/D14/00630",
      srcRefno: "PUR/2026-2027/D14/00630",
      prMemoRef: "Claim memo 17",
      prSupplierCnNo: null,
      prSupplierCnDate: null,
      prEwbNo: null,
      prEwbDate: null,
      prVehicleNo: "TN38",
      prDriverName: "Mani",
      prRemarks: null,
      prSettlement: "ADJUST",
      prStatus: "POSTED",
      prReturnValue: "236",
      prClaimValue: "0",
      prItcReversed: "0",
      claimPartyId: "led-kpn",
      claimPartyName: "KPN Parcel",
      transport: { lrNo: "90233", transporterName: "KPN Parcel" },
    },
    lines: [
      {
        priId: "pri-1",
        priLineNo: 1,
        priSrcItemId: "src-a",
        priSrcDocLineNo: 1,
        priOutcome: "RETURN",
        priQty: "2",
        priFreeQty: "0",
        priTaxableAmt: "200",
        priCgstAmt: "18",
        priSgstAmt: "18",
        priIgstAmt: "0",
        priCessAmt: "0",
        priTotalAmt: "236",
        priGstPct: "18",
        priReasonId: "r-exp",
        reasonName: "Expired",
        priClaimAgainst: null,
        priClaimPartyId: null,
        itemName: "ZT-ITEM-A",
        unitName: "PCS",
        bucket: "SALEABLE",
        lotId: "lot-a",
        batchNo: "B-A",
        expiryDate: "2027-02-15",
        billedQty: "10",
        returnedQty: "0",
        returnableQty: "10",
        creditTo: { kind: "SUPPLIER", name: "ZT-PUR Supplier" },
        writes: [{ drCr: "DR", head: "Supplier (debit note)", amount: "236.00" }],
      },
    ],
    totals: {
      rows: 1,
      returnNow: "236.00",
      claimsRaised: "0.00",
      replaceQtyBase: "0",
      itcReversed: "36.00",
      itcOnDestroyed: "0.00",
      itcPendingOnReplace: "0.00",
      goodsValue: "236.00",
      supplierBalance: "0.00",
      supplierBalanceNow: "0.00",
    },
  };

  it("reads every header field back, the claim party included", () => {
    const draft = draftFromPayload(SCOPE, payload, "entry");
    expect(draft).toMatchObject({
      refno: "PRN/2026-2027/D14/00214",
      godownId: "g1",
      godownName: "Coimbatore",
      posStcd: "33",
      ourRef: "Claim memo 17",
      driverName: "Mani",
      claimPartyId: "led-kpn",
      claimPartyName: "KPN Parcel",
      transport: { lrNo: "90233", transporterName: "KPN Parcel" },
      transportTouched: false,
      viewMode: "browse",
    });
    expect(draft.sources[0].label).toBe("PUR/2026-2027/D14/00630");
    expect(draft.hint).toContain("posted");
    expect(isEditable(draft)).toBe(false);
  });

  it("reads each row with the server's facts and the six totals", () => {
    const draft = draftFromPayload(SCOPE, payload, "entry");
    expect(draft.rows[0]).toMatchObject({ qty: "2", rate: 100, unitTax: 18, billed: "10", returned: 0, reasonName: "Expired", value: 200, total: 236 });
    expect(totalsCells(draft).find((cell) => cell.key === "itc")?.value).toBe("36.00");
  });

  it("a posted return sends no transport unless the popup changed it", () => {
    const draft = draftFromPayload(SCOPE, { ...payload, header: { ...payload.header, prStatus: "DRAFT" } }, "entry");
    expect("transport" in buildSaveBody(draft, false, TODAY).header).toBe(false);
  });
});

describe("purchase return — the rest", () => {
  it("keeps the PURCHASE_RETURN reasons, active only", () => {
    expect(
      returnReasonsOf([
        { srmId: "r1", name: "Expired", allowedTxnTypes: ["PURCHASE_RETURN"], isActive: true },
        { srmId: "r2", name: "Physical shortage", allowedTxnTypes: ["PHYSICAL_MINUS"] },
        { srmId: "r3", name: "Old", allowedTxnTypes: ["PURCHASE_RETURN"], isActive: false },
      ]),
    ).toEqual([{ id: "r1", name: "Expired" }]);
  });

  it("Supplier dues opens filtered to the supplier", () => {
    expect(supplierDuesHref("/purchase/supplier-dues", "sup-1", "ZT-PUR Supplier")).toBe(
      "/purchase/supplier-dues?supplierId=sup-1&supplierName=ZT-PUR+Supplier",
    );
  });

  it("a remembered pre-rebuild draft reads with today's fields", () => {
    const old = { ...withBill(), rows: withBill().rows.map((row) => ({ ...row, outcome: "CLAIM SENT" })) } as unknown as ReturnDraft;
    const draft = withRecalledDefaults(old);
    expect(draft.rows[0].outcome).toBe("CLAIM_SENT");
  });

  it("Edit F2 and Prev / Next words", () => {
    expect(editAnswer({ prId: "", refno: "", status: "DRAFT", viewMode: "entry" }, true).open).toBe(false);
    expect(editAnswer({ prId: "p", refno: "PRN/1", status: "DRAFT", viewMode: "browse" }, true).open).toBe(true);
    expect(stepEndNotice(false, true)).toBe("This is the oldest purchase return.");
  });
});
