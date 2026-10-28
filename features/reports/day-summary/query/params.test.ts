import { describe, expect, it } from "vitest";
import { BRANCH_MAIN, COMPANY_ID, FY } from "../testing/fixtures";
import {
  buildSearch,
  checkFilters,
  dayDrill,
  defaultDate,
  isTenderTab,
  NO_TENDER_LIMIT,
  noTenderKey,
  noTenderQuery,
  parseFilters,
  queryKey,
  stepDay,
  summaryKey,
  summaryQuery,
  tenderDayBookQuery,
  tenderKey,
  tileDrill,
  typeDrill,
  vouchersKey,
  vouchersQuery,
  type Filters,
  type Session,
} from "./params";

const session: Session = {
  companyId: COMPANY_ID,
  accYear: FY.accYear,
  yearBegin: FY.begin,
  yearEnd: FY.end,
  branchId: BRANCH_MAIN,
};
const defaults = { date: "2026-10-09", branchId: BRANCH_MAIN };

function parse(qs: string): Filters {
  return parseFilters(new URLSearchParams(qs), defaults);
}

describe("URL ⇄ filters", () => {
  it("round-trips every key", () => {
    const qs =
      `date=2026-10-07&to=2026-10-09&branch=${BRANCH_MAIN}&type=3&tab=vouchers&drafts=0&pairs=0&clr=0&zero=1` +
      "&group=PRIMARY&nature=SALES&list=drafts&legs=1&by=TYPE";
    const filters = parse(qs);
    expect(filters).toEqual({
      fromDate: "2026-10-07",
      toDate: "2026-10-09",
      branchId: BRANCH_MAIN,
      voucherTypeId: 3,
      tab: "vouchers",
      countDrafts: false,
      includeCancelledPairs: false,
      clearingAsBank: false,
      zeroRows: true,
      groupLevel: "PRIMARY",
      natureFilter: "SALES",
      moneyKind: null,
      draftsOnly: true,
      withLegs: true,
      tenderGroupBy: "TYPE",
    });
    expect(parse(buildSearch(filters).toString())).toEqual(filters);
  });

  it("fills the defaults: today, one day, the session's branch, the Summary tab, the plan's boxes", () => {
    expect(parse("")).toEqual({
      fromDate: "2026-10-09",
      toDate: "2026-10-09",
      branchId: BRANCH_MAIN,
      voucherTypeId: null,
      tab: "summary",
      countDrafts: true,
      includeCancelledPairs: true,
      clearingAsBank: true,
      zeroRows: false,
      groupLevel: "REPORT",
      natureFilter: null,
      moneyKind: null,
      draftsOnly: false,
      withLegs: false,
      tenderGroupBy: "TENDER",
    });
  });

  it("menu 181 opens the Vouchers tab with the defaults", () => {
    const f = parse("tab=vouchers");
    expect(f.tab).toBe("vouchers");
    expect(f.fromDate).toBe("2026-10-09");
  });

  it("tells All branches apart from no choice", () => {
    expect(parse("branch=all").branchId).toBeNull();
    expect(parse("").branchId).toBe(BRANCH_MAIN);
    expect(buildSearch(parse("branch=all")).get("branch")).toBe("all");
  });

  it("drops what it cannot read instead of guessing", () => {
    const f = parse("date=2026-02-30&type=abc&tab=monthly&group=ROOT&money=WALLET&nature=SALE_RETURNS");
    expect(f.fromDate).toBe("2026-10-09");
    expect(f.voucherTypeId).toBeNull();
    expect(f.tab).toBe("summary");
    expect(f.groupLevel).toBe("REPORT");
    expect(f.moneyKind).toBeNull();
    expect(f.natureFilter).toBeNull();
  });

  it("an absent To means one day", () => {
    const f = parse("date=2026-09-01");
    expect(f.toDate).toBe("2026-09-01");
  });

  it("opens the two tender tabs, and writes `by` only for Tender type", () => {
    expect(parse("tab=tender").tab).toBe("tender");
    expect(parse("tab=no-tender").tab).toBe("no-tender");
    expect(isTenderTab("tender") && isTenderTab("no-tender")).toBe(true);
    expect(isTenderTab("vouchers")).toBe(false);
    expect(parse("by=BOGUS").tenderGroupBy).toBe("TENDER");
    expect(buildSearch(parse("tab=tender")).has("by")).toBe(false);
    expect(buildSearch(parse("tab=tender&by=TYPE")).get("by")).toBe("TYPE");
  });
});

describe("◀ ▶ one-day step", () => {
  it("steps both dates by one day", () => {
    expect(stepDay({ fromDate: "2026-10-09", toDate: "2026-10-09" }, -1, session)).toEqual({
      fromDate: "2026-10-08",
      toDate: "2026-10-08",
    });
    expect(stepDay({ fromDate: "2026-10-31", toDate: "2026-10-31" }, 1, session)).toEqual({
      fromDate: "2026-11-01",
      toDate: "2026-11-01",
    });
  });

  it("collapses a range to one day (3.0: dEFrom ± 1, dETo = dEFrom)", () => {
    expect(stepDay({ fromDate: "2026-10-01", toDate: "2026-10-09" }, -1, session)).toEqual({
      fromDate: "2026-09-30",
      toDate: "2026-09-30",
    });
    expect(stepDay({ fromDate: "2026-10-01", toDate: "2026-10-09" }, 1, session)).toEqual({
      fromDate: "2026-10-02",
      toDate: "2026-10-02",
    });
  });

  it("is a no-op at the year's edges", () => {
    expect(stepDay({ fromDate: FY.begin, toDate: FY.begin }, -1, session)).toBeNull();
    expect(stepDay({ fromDate: FY.end, toDate: FY.end }, 1, session)).toBeNull();
  });
});

describe("defaults and the pre-Show check", () => {
  it("defaults to today, clamped into the year", () => {
    expect(defaultDate(session, "2026-10-09")).toBe("2026-10-09");
    expect(defaultDate(session, "2027-05-01")).toBe(FY.end);
    expect(defaultDate(session, "2026-01-15")).toBe(FY.begin);
  });

  it("refuses reversed and out-of-year dates", () => {
    expect(checkFilters({ fromDate: "2026-10-09", toDate: "2026-10-08" }, session)?.message).toBe(
      "The To date is before the Date.",
    );
    expect(checkFilters({ fromDate: "2026-03-31", toDate: "2026-04-02" }, session)?.message).toBe(
      "The dates must be inside the year 2026-2027 (01/04/2026 – 31/03/2027).",
    );
    expect(checkFilters({ fromDate: "2026-10-09", toDate: "2026-10-09" }, session)).toBeNull();
  });
});

describe("request queries and part keys", () => {
  it("omits the branch for All branches and the type for all types", () => {
    const q = summaryQuery(session, parse("branch=all"));
    expect(q).toEqual({
      companyId: COMPANY_ID,
      accYear: FY.accYear,
      fromDate: "2026-10-09",
      toDate: "2026-10-09",
      clearingAsBank: true,
      groupLevel: "REPORT",
      zeroRows: false,
    });
  });

  it("asks drafts without legs", () => {
    const q = vouchersQuery(session, parse("list=drafts&legs=1"), 1, 200);
    expect(q.draftsOnly).toBe(true);
    expect(q.withLegs).toBe(false);
  });

  it("keys a part on exactly what its route is asked", () => {
    const base = parse("");
    // The group level is a summary parameter: the vouchers list does not move.
    expect(vouchersKey(session, { ...base, groupLevel: "PRIMARY" })).toBe(vouchersKey(session, base));
    expect(summaryKey(session, { ...base, groupLevel: "PRIMARY" })).not.toBe(summaryKey(session, base));
    // Count drafts is display only: nothing refetches.
    expect(summaryKey(session, { ...base, countDrafts: false })).toBe(summaryKey(session, base));
    expect(vouchersKey(session, { ...base, countDrafts: false })).toBe(vouchersKey(session, base));
    // Include cancelled pairs is a /vouchers parameter only (D2).
    expect(summaryKey(session, { ...base, includeCancelledPairs: false })).toBe(summaryKey(session, base));
    expect(queryKey("x", { b: 1, a: undefined, c: "z" })).toBe("x?b=1&c=z");
  });
});

describe("the tender day book's queries (notes 126 §4)", () => {
  it("asks the scope only: no voucher type (the DTO's whitelist would refuse it), no branch for every branch", () => {
    const f = parse("type=3&branch=all&tab=tender&date=2026-10-07&to=2026-10-09");
    expect(noTenderQuery(session, f)).toEqual({
      companyId: COMPANY_ID,
      accYear: FY.accYear,
      fromDate: "2026-10-07",
      toDate: "2026-10-09",
      limit: NO_TENDER_LIMIT,
    });
    expect(tenderDayBookQuery(session, { ...f, branchId: BRANCH_MAIN })).toEqual({
      companyId: COMPANY_ID,
      accYear: FY.accYear,
      branchId: BRANCH_MAIN,
      fromDate: "2026-10-07",
      toDate: "2026-10-09",
      groupBy: "TENDER",
      // The groups only; limit=1 holds the rows the server sends despite withRows=false.
      withRows: false,
      limit: 1,
    });
    expect(NO_TENDER_LIMIT).toBe(500);
  });

  it("keys the two lists apart: the group-by moves By tender only, the voucher-type filters neither", () => {
    const base = parse("tab=tender");
    const byType = { ...base, tenderGroupBy: "TYPE" as const };
    expect(tenderKey(session, byType)).not.toBe(tenderKey(session, base));
    expect(noTenderKey(session, byType)).toBe(noTenderKey(session, base));
    expect(tenderKey(session, { ...base, voucherTypeId: 3, clearingAsBank: false })).toBe(tenderKey(session, base));
    expect(noTenderKey(session, { ...base, toDate: "2026-10-10" })).not.toBe(noTenderKey(session, base));
  });
});

describe("drill-downs", () => {
  const base = parse("tab=summary&type=3");

  it("a tile opens the Vouchers tab on its vchr_nature (never a tile code); the cash tile on cash", () => {
    expect(tileDrill(base, "SALES")).toMatchObject({ tab: "vouchers", natureFilter: "SALES", moneyKind: null });
    expect(tileDrill(base, "SALE_RETURNS").natureFilter).toBe("CREDIT_NOTE");
    expect(tileDrill(base, "RECEIPTS").natureFilter).toBe("RECEIPT");
    expect(tileDrill(base, "PAYMENTS").natureFilter).toBe("PAYMENT");
    expect(tileDrill(base, "CASH_IN_HAND")).toMatchObject({ tab: "vouchers", natureFilter: null, moneyKind: "CASH" });
    // An unknown tile opens the list without a filter the server would refuse.
    expect(tileDrill(base, "PURCHASES").natureFilter).toBeNull();
  });

  it("the Expenses tile drills by the ExpV type, or by its nature until the list has come", () => {
    expect(tileDrill(parse(""), "EXPENSES", 40)).toMatchObject({ voucherTypeId: 40, natureFilter: null });
    expect(tileDrill(parse(""), "EXPENSES", null)).toMatchObject({ voucherTypeId: null, natureFilter: "PAYMENT" });
  });

  it("a type row opens the Vouchers tab on that type", () => {
    expect(typeDrill(parse("nature=SALES"), 12)).toMatchObject({ tab: "vouchers", voucherTypeId: 12, natureFilter: null });
  });

  it("a day row opens the Summary tab on that one day", () => {
    expect(dayDrill(parse("date=2026-10-01&to=2026-10-09&tab=daily"), "2026-10-05")).toMatchObject({
      tab: "summary",
      fromDate: "2026-10-05",
      toDate: "2026-10-05",
    });
  });
});
