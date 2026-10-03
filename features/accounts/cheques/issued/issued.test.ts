import { describe, expect, it } from "vitest";
import type { ChequeBook } from "@/features/accounts/payment/payment.types";
import {
  ISSUED_ACTION_SPECS,
  defaultBookFor,
  nextLeafLine,
  presentedSpec,
  replaceSpec,
  returnedSpec,
  stopSpec,
  voidSpec,
} from "./actions/specs";
import {
  ISSUED_DEFAULT_TICKS,
  defaultIssuedFilters,
  issuedDateRange,
  issuedGridParams,
  issuedSummaryParams,
} from "./domain/filters";
import { cancelKind, issuedAllowed, issuedAllowedFor, issuedWhyOnlyLooking } from "./domain/machine";
import { issuedStatePill, issuedStatusPill } from "./domain/pills";
import { describeIssued, fromBookGridRow, fromIssuedGridRow, issuedKeysOf } from "./domain/row";
import { countLine, summariseIssued, summariseLeaves } from "./domain/summary";
import type { IssuedChequeRow } from "./issued.types";
import { ISSUED_KEY_TABLE, isIssuedReservedKey, issuedBindingFor, issuedButtonText } from "./keys";

const TODAY = "2026-10-03";

function gridRow(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    apd_id: "apd-1",
    apd_acc_year: "2026-2027",
    apd_company_id: "co",
    apd_branch_id: "br",
    apd_instrument_no: "000124",
    apd_instrument_date: "2026-10-03T00:00:00.000Z",
    issued_on: "2026-10-01",
    apd_party_id: "p1",
    party_name: "Murugan Traders",
    apd_favouring: "MURUGAN TRADERS",
    apd_amount: "5000.00",
    apd_bank_ledger_id: "bank-1",
    bank_name: "SBI Current",
    acb_book_no: "004",
    apd_ac_payee: null,
    apd_status: "HELD",
    apd_clear_date: null,
    apd_bounce_date: null,
    apd_cancel_reason: null,
    avh_voucher_refno: "PMT0007",
    vchr_type_code: "Pmt",
    apd_print_count: "0",
    state: "OUTSTANDING",
    ...partial,
  };
}

function aRow(partial: Partial<IssuedChequeRow> = {}): IssuedChequeRow {
  return { ...fromIssuedGridRow(gridRow()), ...partial };
}

const BOOK: ChequeBook = {
  chequeBookId: "book-1",
  bankLedgerId: "bank-1",
  bankName: "SBI Current",
  bookNo: "005",
  leafFrom: "000151",
  leafTo: "000200",
  nextLeaf: "000163",
  left: 38,
  format: null,
};

describe("reading grid 121", () => {
  it("parses money, dates and the crossing, and keys off the row object", () => {
    const row = fromIssuedGridRow(gridRow());
    expect(row).toMatchObject({
      amount: 5000,
      chequeDate: "2026-10-03",
      leaf: "000124",
      acPayee: true,
      status: "HELD",
      state: "OUTSTANDING",
      typeCode: "Pmt",
    });
    expect(fromIssuedGridRow(gridRow({ apd_ac_payee: false })).acPayee).toBe(false);
  });

  it("addresses a row by BARE company and branch keys", () => {
    expect(issuedKeysOf(aRow())).toEqual({
      apdId: "apd-1",
      apdAccYear: "2026-2027",
      companyId: "co",
      branchId: "br",
    });
  });

  it("names a cheque by its favouring — the name written on it", () => {
    expect(describeIssued(aRow())).toBe("000124 — MURUGAN TRADERS — 5,000.00");
    expect(describeIssued(aRow({ leaf: "", favouring: "" }))).toBe("(no leaf) — Murugan Traders — 5,000.00");
  });

  it("reads a grid 120 book row", () => {
    expect(
      fromBookGridRow({
        acb_id: "b",
        bank_name: "SBI",
        acb_book_no: "004",
        leaf_from: "000101",
        leaf_to: "000150",
        next_leaf: null,
        leaves_left: 0,
        acb_status: "finished",
        acb_remarks: null,
      }),
    ).toMatchObject({ nextLeaf: null, leavesLeft: 0, status: "FINISHED", remarks: "" });
  });
});

describe("what may be done", () => {
  it("offers every verb on a cheque not yet presented, and nothing but a look once it is paid", () => {
    expect(issuedAllowed("HELD")).toEqual(["presented", "returned", "stop", "void", "replace", "history"]);
    expect(issuedAllowed("CLEARED")).toEqual(["history"]);
    expect(issuedAllowed("REPLACED")).toEqual(["history"]);
    expect(issuedAllowed("SOMETHING_NEW")).toEqual(["history"]);
  });

  it("offers Replace on a returned or stopped cheque only once a reversal is known", () => {
    expect(issuedAllowedFor("BOUNCED", null)).toEqual(["history"]);
    expect(issuedAllowedFor("BOUNCED", { apdId: "a", reversalVoucherId: "rv" })).toEqual(["replace", "history"]);
    // Cancelled by its payment's own cancel/amend: nothing was reversed.
    expect(issuedAllowedFor("CANCELLED", { apdId: "a", reversalVoucherId: null })).toEqual(["history"]);
    expect(issuedWhyOnlyLooking("CANCELLED", { apdId: "a", reversalVoucherId: null })).toContain(
      "nothing to pay again",
    );
    expect(issuedAllowedFor("HELD", null)).toContain("replace");
  });

  it("tells a stop from a void by the reason's prefix", () => {
    expect(cancelKind("STOPPED: lost")).toBe("stopped");
    expect(cancelKind("VOIDED: misprinted")).toBe("voided");
    expect(cancelKind("")).toBeNull();
  });

  it("words the statuses the issued way, and never dims a returned cheque", () => {
    expect(issuedStatusPill("HELD").label).toBe("Not presented");
    expect(issuedStatusPill("BOUNCED")).toMatchObject({ label: "Returned unpaid", dimmed: false });
    expect(issuedStatusPill("CANCELLED").dimmed).toBe(true);
    expect(issuedStatePill("POST-DATED")).toMatchObject({ label: "Post-dated", tone: "blue" });
    expect(issuedStatusPill("NEW_THING").label).toBe("NEW THING");
  });
});

describe("the filters and grid 121's tokens", () => {
  it("sends all nine bare tokens, scope spelt without iapd_", () => {
    const filters = defaultIssuedFilters({ from: "2026-04-01", to: "2028-03-31" });
    expect(filters.ticks).toEqual(ISSUED_DEFAULT_TICKS);
    expect(issuedGridParams(filters, { companyId: "co", branchId: "br", accYear: "2026-2027" })).toEqual({
      icompany_id: "co",
      ibranch_id: "br",
      iacc_year: "2026-2027",
      istatus: "HELD,BOUNCED",
      ifrom: "2026-04-01",
      ito: "2028-03-31",
      ibank_ledger_id: "",
      iparty_id: "",
      isearch: "",
    });
  });

  it("reads the summary over everything still out, narrowed by the bank alone", () => {
    const filters = {
      ...defaultIssuedFilters({ from: "2026-04-01", to: "2028-03-31" }),
      ticks: ["CLEARED"] as const,
      bankLedgerId: "bank-1",
      search: "murugan",
    };
    expect(issuedSummaryParams(filters, { companyId: "co", branchId: "br", accYear: "2026-2027" })).toMatchObject({
      istatus: "HELD,BOUNCED",
      ibank_ledger_id: "bank-1",
      isearch: "",
      ifrom: "",
    });
  });

  it("opens on the accounting year, to a year past its end", () => {
    expect(issuedDateRange("2026-2027")).toEqual({ from: "2026-04-01", to: "2028-03-31" });
  });
});

describe("the tiles", () => {
  it("splits what is still out into not presented, post-dated and returned", () => {
    const summary = summariseIssued(
      [
        aRow({ amount: 1000 }),
        aRow({ amount: 2000, state: "POST-DATED" }),
        aRow({ amount: 500.5, status: "BOUNCED", state: "BOUNCED" }),
        aRow({ amount: 99, status: "CLEARED", state: "CLEARED" }),
      ],
      false,
    );
    expect(summary.notPresented).toEqual({ amount: 1000, count: 1 });
    expect(summary.postDated).toEqual({ amount: 2000, count: 1 });
    expect(summary.returned).toEqual({ amount: 500.5, count: 1 });
    expect(summary.uncleared).toEqual({ amount: 3000, count: 2 });
  });

  it("counts the leaves in active books", () => {
    const active = { chequeBookId: "a", bankName: "SBI", bookNo: "004", leafFrom: "1", leafTo: "50", nextLeaf: "000031", leavesLeft: 20, status: "ACTIVE", remarks: "" };
    expect(summariseLeaves([active])).toEqual({ leaves: 20, books: 1, line: "book 004 · next 000031" });
    expect(summariseLeaves([active, { ...active, chequeBookId: "b", leavesLeft: 5 }]).line).toBe("2 active books");
    expect(summariseLeaves([]).line).toBe("no active book");
    expect(countLine(0)).toBe("none");
    expect(countLine(1)).toBe("1 cheque");
  });
});

describe("the action bodies", () => {
  const context = { today: TODAY, books: [BOOK] };

  it("presents a cheque on the bank's date, not before the cheque's own", () => {
    const row = aRow({ chequeDate: "2026-10-02" });
    const form = { ...presentedSpec.initial(row, context), remarks: " ok " };
    expect(presentedSpec.build(row, form, context)).toEqual({
      apdId: "apd-1",
      apdAccYear: "2026-2027",
      companyId: "co",
      branchId: "br",
      date: TODAY,
      remarks: "ok",
    });
    expect(presentedSpec.validate(row, { date: "2026-10-01", remarks: "" }, context)).toContain(
      "cannot have paid it before that",
    );
    expect(presentedSpec.validate(row, { date: "2026-10-09", remarks: "" }, context)).toContain(
      "cannot be in the future",
    );
  });

  it("asks a reversal for its reason, and sends charges only when there are some", () => {
    const row = aRow();
    const blank = returnedSpec.initial(row, context);
    expect(returnedSpec.validate(row, blank, context)).toBe("Give a reason.");
    expect(returnedSpec.validate(row, { ...blank, reason: "  " }, context)).toBe("Give a reason.");
    const form = { ...blank, reason: "Funds insufficient", charges: "150" };
    expect(returnedSpec.build(row, form, context)).toMatchObject({ reason: "Funds insufficient", charges: 150 });
    expect(stopSpec.build(row, { ...form, charges: "" }, context)).not.toHaveProperty("charges");
    expect(stopSpec.validate(row, { ...form, charges: "1.234" }, context)).toContain("two decimals");
    expect(stopSpec.validate(row, { ...form, charges: "1.10" }, context)).toBeNull();
  });

  it("sends a void's date although the server would default it", () => {
    const row = aRow();
    const form = { ...voidSpec.initial(row, context), reason: "Misprinted" };
    expect(voidSpec.build(row, form, context)).toEqual({
      ...issuedKeysOf(row),
      date: TODAY,
      reason: "Misprinted",
    });
  });

  it("replaces from a book on the cheque's own bank, with its bank and the old crossing", () => {
    const row = aRow({ acPayee: false });
    const form = { ...replaceSpec.initial(row, context), reason: "Lost — reissued" };
    expect(form).toMatchObject({ chequeBookId: "book-1", favouring: "MURUGAN TRADERS", acPayee: false });
    expect(replaceSpec.build(row, form, context)).toEqual({
      ...issuedKeysOf(row),
      date: TODAY,
      chequeBookId: "book-1",
      bankLedgerId: "bank-1",
      instrumentDate: TODAY,
      favouring: "MURUGAN TRADERS",
      acPayee: false,
      reason: "Lost — reissued",
    });
    expect(replaceSpec.validate(row, { ...form, chequeDate: "2026-10-01" }, context)).toContain(
      "cannot be dated before its voucher",
    );
    expect(replaceSpec.validate(row, { ...form, chequeBookId: "" }, context)).toContain("Choose the cheque book");
    const finished = { ...BOOK, left: 0, nextLeaf: "" };
    expect(
      replaceSpec.validate(row, form, { today: TODAY, books: [finished] }),
    ).toBe("Book 005 has no leaves left — choose another.");
  });

  it("picks the cheque's own bank first, and says what the next leaf is", () => {
    const other = { ...BOOK, chequeBookId: "book-2", bankLedgerId: "bank-2" };
    expect(defaultBookFor(aRow(), [other, BOOK])).toBe("book-1");
    expect(defaultBookFor(aRow(), [other])).toBe("book-2");
    expect(nextLeafLine(BOOK, [BOOK])).toBe("000163 (next, taken at post)");
    expect(nextLeafLine(null, [])).toContain("no active book");
  });

  it("has a spec for every writing verb, posting to its own route", () => {
    expect(Object.values(ISSUED_ACTION_SPECS).map((spec) => spec.endpoint)).toEqual([
      "/issued-cheques/presented",
      "/issued-cheques/returned",
      "/issued-cheques/stop",
      "/issued-cheques/void",
      "/issued-cheques/replace",
    ]);
  });
});

describe("the keys", () => {
  const press = (key: string, mods: Partial<KeyboardEvent> = {}) => ({
    key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods,
  });

  it("binds F7, F8, F3 and Ctrl+H, and leaves Void and Replace keyless", () => {
    expect(issuedBindingFor(press("F7"))?.verb).toBe("presented");
    expect(issuedBindingFor(press("F8"))?.verb).toBe("returned");
    expect(issuedBindingFor(press("F3"))?.verb).toBe("stop");
    expect(issuedBindingFor(press("h", { ctrlKey: true }))?.verb).toBe("history");
    expect(ISSUED_KEY_TABLE.filter((binding) => binding.keyLabel === null).map((binding) => binding.verb)).toEqual([
      "void",
      "replace",
    ]);
    expect(isIssuedReservedKey(press("F3"))).toBe(true);
    expect(isIssuedReservedKey(press("Enter"))).toBe(false);
    expect(issuedButtonText(ISSUED_KEY_TABLE[0])).toBe("Presented - F7");
  });
});
