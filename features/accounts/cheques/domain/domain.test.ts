import { describe as suite, expect, it } from "vitest";
import { describe, fromGridRow, keysOf } from "./chequeRow";
import { addMonths, defaultDateRange } from "./dates";
import { chequeRow } from "./fixtures";
import {
  defaultFilters,
  filterSignature,
  gridParams,
  statusesFor,
  type ChequeFilters,
  type StatusTick,
} from "./filters";
import { EMPTY_TICKS, refreshTicks, targetRows, toggleTick, togglePage } from "./selection";
import {
  allowedActions,
  allowedForAll,
  allowedForTargets,
  explainBar,
  MIXED_TICK_SENTENCE,
  whyOnlyLooking,
} from "./stateMachine";
import { bucketPill, statusPill } from "./bucket";

const SCOPE = { companyId: "c1", branchId: "b1", accYear: "2026-2027" };
const NINE = [
  "iapd_company_id",
  "iapd_branch_id",
  "iapd_acc_year",
  "istatus",
  "ifrom",
  "ito",
  "ibank_ledger_id",
  "iparty_id",
  "isearch",
];

function filters(patch: Partial<ChequeFilters> = {}): ChequeFilters {
  return { ...defaultFilters({ from: "", to: "" }), ...patch };
}

suite("gridParams", () => {
  const combos: Partial<ChequeFilters>[] = [
    {},
    { ticks: [] },
    { from: "", to: "" },
    { from: "2026-01-01", to: "2027-12-31" },
    { bankLedgerId: "" },
    { bankLedgerId: "bank-1", partyId: "party-1" },
    { search: "" },
    { search: "  55492 " },
    { ticks: [], from: "", to: "", bankLedgerId: "", partyId: "", search: "" },
  ];

  it.each(combos)("sends all nine keys, always (%j)", (patch) => {
    const params = gridParams(filters(patch), SCOPE);
    expect(Object.keys(params).sort()).toEqual([...NINE].sort());
    for (const value of Object.values(params)) {
      expect(typeof value).toBe("string");
    }
  });

  it("comma-joins the ticked statuses", () => {
    expect(gridParams(filters({ ticks: ["HELD", "DEPOSITED"] }), SCOPE).istatus).toBe(
      "HELD,DEPOSITED",
    );
  });

  it("sends CANCELLED alongside Returned", () => {
    expect(statusesFor(["RETURNED"])).toEqual(["RETURNED", "CANCELLED"]);
    expect(gridParams(filters({ ticks: ["BOUNCED", "RETURNED"] }), SCOPE).istatus).toBe(
      "BOUNCED,RETURNED,CANCELLED",
    );
  });

  it("treats no ticks as every status — an empty string, not no rows", () => {
    expect(gridParams(filters({ ticks: [] }), SCOPE).istatus).toBe("");
  });

  it("puts the search in isearch and never sends a `search` key", () => {
    const params = gridParams(filters({ search: " 55492 " }), SCOPE) as Record<string, string>;
    expect(params.isearch).toBe("55492");
    expect("search" in params).toBe(false);
  });

  it("takes the scope it is given", () => {
    const params = gridParams(filters(), SCOPE);
    expect(params.iapd_company_id).toBe("c1");
    expect(params.iapd_branch_id).toBe("b1");
    expect(params.iapd_acc_year).toBe("2026-2027");
  });

  it("orders ticks by the bar, not by click order", () => {
    const ticks: StatusTick[] = ["CLEARED", "HELD"];
    expect(statusesFor(ticks)).toEqual(["HELD", "CLEARED"]);
  });
});

suite("filterSignature", () => {
  it("ignores display names, notices selection changes", () => {
    const base = filters({ bankLedgerId: "b", bankLedgerName: "KVB" });
    expect(filterSignature(base)).toBe(filterSignature({ ...base, bankLedgerName: "Other" }));
    expect(filterSignature(base)).not.toBe(filterSignature({ ...base, search: "x" }));
  });
});

suite("defaultDateRange", () => {
  it("spans the accounting year, not the calendar year, with the ck_apd_dates margins", () => {
    expect(defaultDateRange("2026-2027")).toEqual({ from: "2026-01-01", to: "2028-03-31" });
  });
  it("prefers the context's own bounds", () => {
    expect(defaultDateRange("2026-2027", "2026-01-01T00:00:00Z", "2026-12-31")).toEqual({
      from: "2025-10-01",
      to: "2027-12-31",
    });
  });
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2027-05-31", -3)).toBe("2027-02-28");
  });
});

suite("fromGridRow", () => {
  const raw = {
    apd_id: "id-1",
    apd_acc_year: "2026-2027",
    apd_company_id: "c1",
    apd_branch_id: "b1",
    apd_instrument_no: "55492",
    apd_instrument_date: "2026-09-20T00:00:00.000Z",
    party_name: "Deepan",
    apd_amount: "1000.00",
    apd_status: "held",
    due_bucket: "FUTURE",
    apd_posting_mode: "ON_RECEIPT",
    apd_present_count: "1",
    apd_bounce_charges: "150.50",
    apd_deposit_date: null,
  };

  it("parses string money", () => {
    const row = fromGridRow(raw);
    expect(row.amount).toBe(1000);
    expect(row.bounceCharges).toBe(150.5);
    expect(row.presentCount).toBe(1);
  });

  it("cuts a timestamp to ten characters", () => {
    expect(fromGridRow(raw).instrumentDate).toBe("2026-09-20");
    expect(fromGridRow(raw).depositDate).toBeNull();
  });

  it("takes the keys from the row's hidden fields", () => {
    expect(keysOf(fromGridRow(raw))).toEqual({
      apdId: "id-1",
      apdAccYear: "2026-2027",
      apdCompanyId: "c1",
      apdBranchId: "b1",
    });
  });

  it("upper-cases the status and keeps an unknown bucket out", () => {
    expect(fromGridRow(raw).status).toBe("HELD");
    expect(fromGridRow({ ...raw, due_bucket: "WHENEVER" }).bucket).toBeNull();
  });

  it("names a row the way confirmations do", () => {
    expect(describe(fromGridRow(raw))).toBe("55492 — Deepan — 1,000.00");
  });
});

suite("stateMachine", () => {
  it.each([
    ["HELD", ["deposit", "replace", "return", "history"]],
    ["DEPOSITED", ["clear", "bounce", "printSlip", "history"]],
    ["BOUNCED", ["represent", "replace", "printSlip", "history"]],
    ["CLEARED", ["printSlip", "history"]],
    ["RETURNED", ["history"]],
    ["CANCELLED", ["history"]],
    ["REPLACED", ["history"]],
  ])("%s allows exactly its row of the table", (status, verbs) => {
    expect([...allowedActions(status)].sort()).toEqual([...verbs].sort());
  });

  it("allows History only for a status it has never heard of", () => {
    expect(allowedActions("ON_HOLD_FOR_AUDIT")).toEqual(["history"]);
  });

  it("intersects: HELD + DEPOSITED share only History", () => {
    expect(allowedForAll(["HELD", "DEPOSITED"])).toEqual(["history"]);
  });

  it("allows nothing for an empty set, not even History", () => {
    expect(allowedForAll([])).toEqual([]);
    expect(allowedForTargets([])).toEqual([]);
  });

  it("keeps only the bulk verb for more than one row", () => {
    expect(allowedForTargets(["HELD", "HELD"])).toEqual(["deposit"]);
    expect(allowedForTargets(["DEPOSITED", "DEPOSITED"])).toEqual([]);
    expect(allowedForTargets(["HELD", "DEPOSITED"])).toEqual([]);
  });
});

suite("whyOnlyLooking and the bar line", () => {
  it.each([
    ["CANCELLED", "cancelled with its receipt"],
    ["RETURNED", "returned to the party"],
    ["REPLACED", "replaced by another cheque"],
    ["CLEARED", "only its slip can be reprinted"],
  ])("explains %s", (status, fragment) => {
    expect(whyOnlyLooking(status)).toContain(fragment);
  });

  it("says nothing for a live cheque", () => {
    expect(whyOnlyLooking("HELD")).toBeNull();
    expect(whyOnlyLooking("BOUNCED")).toBeNull();
  });

  const granted = { canEdit: true, canPrint: true, loading: false };

  it("puts permissions first", () => {
    const line = explainBar(["HELD"], { ...granted, canEdit: false }, "55492");
    expect(line).toEqual({ text: "read-only — your login may not act on cheques", tone: "reason" });
  });

  it("reports print rights when only Print slip is blocked", () => {
    const line = explainBar(["CLEARED"], { canEdit: false, canPrint: false, loading: false }, "x");
    expect(line.tone).toBe("reason");
    expect(explainBar(["CLEARED"], { ...granted, canPrint: false }, "x").text).toBe(
      "read-only — your login may not print",
    );
  });

  it("does not report a refusal while permissions load", () => {
    expect(explainBar(["HELD"], { canEdit: false, canPrint: false, loading: true }, "55492")).toEqual({
      text: "55492",
      tone: "info",
    });
  });

  it("explains a finished cheque", () => {
    expect(explainBar(["REPLACED"], granted, "55492").text).toBe(
      "55492: replaced by another cheque, which carries it now",
    );
  });

  it("explains a mixed tick", () => {
    expect(explainBar(["HELD", "DEPOSITED"], granted, "2 ticked")).toEqual({
      text: MIXED_TICK_SENTENCE,
      tone: "reason",
    });
  });
});

suite("pills", () => {
  it("keeps BOUNCED red and never dimmed", () => {
    expect(statusPill("BOUNCED")).toEqual({ label: "Bounced", tone: "red", dimmed: false });
  });
  it("gives DEPOSITED and REPLACED fixed colours", () => {
    expect(statusPill("DEPOSITED").tone).toBe("blue");
    expect(statusPill("REPLACED").tone).toBe("grey");
  });
  it("shows an unknown status as it arrived", () => {
    expect(statusPill("on_hold").label).toBe("ON HOLD");
  });
  it("words the buckets for an operator", () => {
    expect(bucketPill("OVERDUE")?.label).toBe("Matured");
    expect(bucketPill("FUTURE")?.label).toBe("Post-dated");
    expect(bucketPill(null)).toBeNull();
  });
});

suite("the ticked set", () => {
  const pageOne = [chequeRow(), chequeRow()];
  const pageTwo = [chequeRow(), chequeRow()];

  it("survives a page change, keyed by id", () => {
    let ticks = toggleTick(EMPTY_TICKS, pageOne[0]);
    ticks = toggleTick(ticks, pageTwo[1]);
    // Page two is showing now; the page-one tick is still held.
    ticks = refreshTicks(ticks, pageTwo);
    expect(targetRows(ticks, pageTwo[0]).map((row) => row.apdId)).toEqual([
      pageOne[0].apdId,
      pageTwo[1].apdId,
    ]);
  });

  it("targets the current row when nothing is ticked", () => {
    expect(targetRows(EMPTY_TICKS, pageOne[1])).toEqual([pageOne[1]]);
    expect(targetRows(EMPTY_TICKS, null)).toEqual([]);
  });

  it("refreshes a ticked row from the page it reappears on", () => {
    const ticks = toggleTick(EMPTY_TICKS, pageOne[0]);
    const moved = { ...pageOne[0], status: "DEPOSITED" };
    expect(refreshTicks(ticks, [moved]).get(pageOne[0].apdId)?.status).toBe("DEPOSITED");
  });

  it("ticks and unticks a whole page", () => {
    const all = togglePage(EMPTY_TICKS, pageOne);
    expect(all.size).toBe(2);
    expect(togglePage(all, pageOne).size).toBe(0);
  });

  it("is cleared by a filter change — the screen compares signatures", () => {
    const before = filterSignature(filters());
    const after = filterSignature(filters({ ticks: ["HELD"] }));
    expect(before).not.toBe(after);
  });
});
