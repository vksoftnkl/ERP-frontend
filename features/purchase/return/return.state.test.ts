import { describe, expect, it } from "vitest";
import {
  buildSaveBody,
  bucketChoices,
  claimRowsOf,
  createDraft,
  creditAmount,
  draftFromPayload,
  isEditable,
  outcomeChoices,
  outcomeCode,
  outcomeText,
  overReturned,
  previewTotals,
  purchaseReturnReducer,
  saveRefusal,
  settleRefusal,
  totalsParts,
  undoRefusal,
  type ReturnAction,
} from "./return.state";
import type { ReturnDraft, ReturnPayload, ReturnSourceLine } from "./return.types";

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
    lots: [{ lotId: "lot-a", bucket: "SALEABLE", godownId: "g1", batchNo: "B-A", expiryDate: null, mrp: null, qty: "10" }],
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

describe("purchase return — source", () => {
  it("offers the supplier's bills, labelled the Qt way", () => {
    const draft = withBill();
    expect(draft.sources).toEqual([{ srcDocId: "pi-1", srcAccYear: "2026-2027", label: "PUR/1 · INV-9 · 27/10/2026 · 2,300.00" }]);
  });

  it("drops a sources answer for a supplier the screen has left", () => {
    const draft = run(
      createDraft(SCOPE, "2026-10-28"),
      { type: "setSupplier", id: "sup-2", name: "Other" },
      { type: "sourcesLoaded", supplierId: "sup-1", kind: "AGAINST_INVOICE", rows: [] },
    );
    expect(draft.sourcesState).toBe("loading");
  });

  it("brings in one row per line with what can still go back (R1)", () => {
    const draft = withBill();
    expect(draft.rows).toHaveLength(2);
    expect(draft.rows.map((row) => row.returnable)).toEqual([10, 20]);
    expect(draft.rows[0]).toMatchObject({ rate: 100, outcome: "RETURN", bucket: "SALEABLE", lotId: "lot-a", batchNo: "B-A", unitTax: 18 });
  });

  it("skips a line with nothing left to return", () => {
    const lines = [{ ...LINES[0], returnableQty: "0" }, LINES[1]];
    const draft = run(withBill(), { type: "sourceLinesLoaded", srcDocId: "pi-2", srcAccYear: "2026-2027", lines });
    expect(draft.rows.map((row) => row.srcItemId)).toEqual(["src-m"]);
  });

  it("a new supplier clears the source and the rows", () => {
    const draft = run(withBill(), { type: "setSupplier", id: "sup-3", name: "Third" });
    expect(draft.rows).toHaveLength(0);
    expect(draft.srcDocId).toBe("");
  });
});

describe("purchase return — rows (R2)", () => {
  it("2 back · a 1-pc claim split off · 2 damaged destroyed on a transporter", () => {
    let draft = withBill();
    const [a, m] = draft.rows;
    draft = run(
      draft,
      { type: "editQty", key: a.key, raw: "2" },
      { type: "splitRow", key: a.key, newKey: "split" },
    );
    expect(draft.rows.map((row) => row.srcLineNo)).toEqual(["1", "1", "2"]);
    draft = run(
      draft,
      { type: "editQty", key: "split", raw: "1" },
      { type: "editOutcome", key: "split", outcome: "CLAIM SENT" },
    );
    expect(draft.rows[1].claimOn).toBe("SUPPLIER");
    draft = run(
      draft,
      { type: "editBucket", key: m.key, bucket: "DAMAGED" },
      { type: "editQty", key: m.key, raw: "2" },
      { type: "editOutcome", key: m.key, outcome: "CLAIM DESTROYED" },
      { type: "editClaimOn", key: m.key, claimOn: "TRANSPORTER" },
    );
    expect(previewTotals(draft)).toEqual({ rows: 3, debit: 236, claim: 218, replace: 0 });
    expect(totalsParts(draft).map((part) => `${part.label} ${part.value}`)).toEqual([
      "rows going back 3",
      "Debit note 236.00",
      "Claims 218.00",
    ]);

    // A transporter claim needs its ledger.
    expect(saveRefusal(draft)?.focus).toBe("claimParty");
    draft = run(draft, { type: "setClaimParty", id: "led-kumar", name: "Kumar" });
    expect(saveRefusal(draft)).toBeNull();

    const body = buildSaveBody(draft, true, "2026-10-28");
    expect(body.header).toMatchObject({ kind: "AGAINST_INVOICE", srcDocId: "pi-1", post: true, docDate: "2026-10-28" });
    expect(body.header.prId).toBeUndefined();
    expect(body.lines).toEqual([
      { lineNo: 1, srcItemId: "src-a", outcome: "RETURN", qty: 2, bucket: "SALEABLE", lotId: "lot-a" },
      { lineNo: 2, srcItemId: "src-a", outcome: "CLAIM_SENT", qty: 1, bucket: "SALEABLE", lotId: "lot-a", claimAgainst: "SUPPLIER" },
      {
        lineNo: 3,
        srcItemId: "src-m",
        outcome: "CLAIM_DESTROYED",
        qty: 2,
        bucket: "DAMAGED",
        lotId: "lot-m",
        claimAgainst: "TRANSPORTER",
        claimPartyId: "led-kumar",
      },
    ]);
  });

  it("a non-claim outcome drops Claim On", () => {
    let draft = withBill();
    const key = draft.rows[0].key;
    draft = run(draft, { type: "editOutcome", key, outcome: "CLAIM SENT" }, { type: "editOutcome", key, outcome: "REPLACE" });
    expect(draft.rows[0].claimOn).toBe("");
  });

  it("a GRN return is RETURN only", () => {
    let draft = run(createDraft(SCOPE, "2026-10-28"), { type: "setKind", kind: "AGAINST_GRN" });
    expect(outcomeChoices(draft)).toEqual(["RETURN"]);
    draft = run(
      draft,
      { type: "setSupplier", id: "sup-1", name: "S" },
      { type: "sourceLinesLoaded", srcDocId: "grn-1", srcAccYear: "2026-2027", lines: LINES },
    );
    draft = run(draft, { type: "editOutcome", key: draft.rows[0].key, outcome: "CLAIM SENT" });
    expect(draft.kind).toBe("AGAINST_GRN");
    expect(draft.rows.every((row) => row.outcome === "RETURN")).toBe(true);
  });

  it("bucket choices are the holdings the line brought in", () => {
    const draft = withBill();
    expect(bucketChoices(draft, draft.rows[1])).toEqual(["SALEABLE", "DAMAGED"]);
  });

  it("flags a line asked for more than can go back", () => {
    let draft = withBill();
    const key = draft.rows[0].key;
    draft = run(draft, { type: "editQty", key, raw: "8" }, { type: "splitRow", key, newKey: "s2" }, { type: "editQty", key: "s2", raw: "3" });
    expect([...overReturned(draft)].sort()).toEqual([key, "s2"].sort());
  });

  it("refuses an empty save", () => {
    expect(saveRefusal(createDraft(SCOPE, "2026-10-28"))?.focus).toBe("supplier");
    expect(saveRefusal(withBill())?.title).toBe("Nothing going back");
  });

  it("removes a row", () => {
    const draft = withBill();
    const next = run(draft, { type: "removeRow", key: draft.rows[0].key });
    expect(next.rows).toHaveLength(1);
  });
});

const SAVED: ReturnPayload = {
  header: {
    prId: "pr-1",
    prCompanyId: "c1",
    prBranchId: "b1",
    prAccYear: "2026-2027",
    prRefno: "PRN/2026-2027/D14/00111",
    prDocDate: "2026-10-28T00:00:00.000Z",
    prKind: "AGAINST_INVOICE",
    prSrcDocId: "pi-1",
    prSrcAccYear: "2026-2027",
    prSupplierId: "sup-1",
    supplierName: "ZT-PUR Supplier",
    prOurRef: "PUR/1",
    prSupplierCnNo: null,
    prSupplierCnDate: null,
    prVehicleNo: "TN01",
    prRemarks: null,
    prStatus: "DRAFT",
    prReturnValue: "236",
    prClaimValue: "218",
    prItcReversed: "12",
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
      priClaimAgainst: null,
      priClaimPartyId: null,
      itemName: "ZT-ITEM-A",
      unitName: "PCS",
      bucket: "SALEABLE",
      lotId: "lot-a",
      batchNo: "B-A",
    },
    {
      priId: "pri-3",
      priLineNo: 2,
      priSrcItemId: "src-m",
      priSrcDocLineNo: 2,
      priOutcome: "CLAIM_DESTROYED",
      priQty: "2",
      priFreeQty: "0",
      priTaxableAmt: "100",
      priCgstAmt: "6",
      priSgstAmt: "6",
      priIgstAmt: "0",
      priCessAmt: "0",
      priTotalAmt: "112",
      priGstPct: "12",
      priClaimAgainst: "TRANSPORTER",
      priClaimPartyId: "led-kumar",
      itemName: "MRP ITEM",
      unitName: "PCS",
      bucket: "DAMAGED",
      lotId: "lot-m",
      batchNo: "B-M",
    },
  ],
};

describe("purchase return — a saved return", () => {
  it("reads the server's rows and figures", () => {
    const draft = draftFromPayload(SCOPE, SAVED, "entry");
    expect(draft).toMatchObject({ prId: "pr-1", status: "DRAFT", srcDocId: "pi-1", docDate: "2026-10-28", vehicleNo: "TN01", claimPartyId: "led-kumar" });
    expect(draft.sources).toEqual([{ srcDocId: "pi-1", srcAccYear: "2026-2027", label: "PUR/1" }]);
    expect(draft.rows[1]).toMatchObject({ outcome: "CLAIM DESTROYED", claimOn: "TRANSPORTER", rate: 50, unitTax: 6, value: 100, total: 112, returnable: null });
    expect(totalsParts(draft).map((part) => part.value)).toEqual(["236.00", "218.00", "12.00"]);
    expect(isEditable(draft)).toBe(true);
  });

  it("a reopened draft keeps its rows; only Can Return refreshes", () => {
    const draft = run(draftFromPayload(SCOPE, SAVED, "entry"), {
      type: "sourceLinesLoaded",
      srcDocId: "pi-1",
      srcAccYear: "2026-2027",
      lines: LINES,
    });
    expect(draft.rows.map((row) => row.lineId)).toEqual(["pri-1", "pri-3"]);
    expect(draft.rows.map((row) => row.returnable)).toEqual([10, 20]);
    expect(draft.serverTotals).not.toBeNull();
    expect(draft.dirty).toBe(false);
    expect(buildSaveBody(draft, false, "2026-10-28").header.prId).toBe("pr-1");
  });

  it("a posted return opens read-only and ignores edits", () => {
    const posted = draftFromPayload(SCOPE, { ...SAVED, header: { ...SAVED.header, prStatus: "POSTED" } }, "entry");
    expect(posted.viewMode).toBe("browse");
    const after = run(posted, { type: "editQty", key: posted.rows[0].key, raw: "5" }, { type: "beginEdit" });
    expect(after.rows[0].qty).toBe("2");
    expect(after.viewMode).toBe("browse");
  });

  it("a draft opened to view can be taken into edit", () => {
    const viewed = draftFromPayload(SCOPE, SAVED, "browse");
    expect(isEditable(viewed)).toBe(false);
    expect(isEditable(run(viewed, { type: "beginEdit" }))).toBe(true);
  });
});

describe("purchase return — words", () => {
  it("spells outcomes both ways", () => {
    expect(outcomeCode("CLAIM DESTROYED")).toBe("CLAIM_DESTROYED");
    expect(outcomeText("CLAIM_SENT")).toBe("CLAIM SENT");
    expect(outcomeText("junk")).toBe("RETURN");
  });
});

describe("purchase claims", () => {
  const rows = claimRowsOf([
    {
      returnItemId: "pri-2",
      accYear: "2026-2027",
      prId: "pr-1",
      refno: "PRN/1",
      docDate: "2026-10-28T00:00:00.000Z",
      lineNo: 2,
      itemName: "ZT-ITEM-A",
      outcome: "CLAIM_SENT",
      claimAgainst: "SUPPLIER",
      claimPartyId: "sup-led",
      partyName: "ZT-PUR Supplier",
      supplierId: "sup-1",
      claimValue: "118",
      settled: "100",
      open: "18",
      lastSettlementId: "pcs-1",
    },
    {
      returnItemId: "pri-3",
      accYear: "2026-2027",
      prId: "pr-1",
      refno: "PRN/1",
      docDate: "2026-10-28",
      lineNo: 3,
      itemName: "MRP ITEM",
      outcome: "CLAIM_DESTROYED",
      claimAgainst: "TRANSPORTER",
      claimPartyId: "led",
      partyName: null,
      supplierId: "sup-1",
      claimValue: "100",
      settled: "100",
      open: "0",
      lastSettlementId: null,
    },
  ]);

  it("maps the open rows", () => {
    expect(rows[0]).toMatchObject({ date: "28/10/2026", claim: "Goods sent", claimOn: "SUPPLIER · ZT-PUR Supplier", open: 18 });
    expect(rows[1]).toMatchObject({ claim: "Destroyed", claimOn: "TRANSPORTER", lastSettlementId: "" });
  });

  it("says why an action cannot run", () => {
    expect(settleRefusal(null)).toMatch(/Select/);
    expect(settleRefusal(rows[0])).toBe("");
    expect(settleRefusal(rows[1])).toMatch(/fully settled/);
    expect(undoRefusal(rows[0])).toBe("");
    expect(undoRefusal(rows[1])).toMatch(/no settlement/);
  });

  it("takes a credit up to the open amount", () => {
    expect(creditAmount("18", 18)).toBe(18);
    expect(creditAmount("1,0.5", 18)).toBe(10.5);
    expect(creditAmount("19", 18)).toBeNull();
    expect(creditAmount("0", 18)).toBeNull();
    expect(creditAmount("x", 18)).toBeNull();
  });
});
