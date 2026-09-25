import { describe, expect, it } from "vitest";
import {
  buildSearch,
  checkFilters,
  defaultRange,
  parseFilters,
  reportKey,
  TABS,
  vouchersQuery,
  type Filters,
  type Session,
} from "./params";

const LEDGER = "33333333-3333-4333-8333-333333333333";
const BRANCH = "22222222-2222-4222-8222-222222222222";
const session: Session = {
  companyId: "11111111-1111-4111-8111-111111111111",
  accYear: "2026-2027",
  yearBegin: "2026-04-01",
  yearEnd: "2027-03-31",
  branchId: BRANCH,
};
const defaults = { fromDate: "2026-04-01", toDate: "2026-09-25", branchId: BRANCH };

function* everyFilter(): Generator<Filters> {
  for (const ledgerId of [LEDGER, null])
    for (const branchId of [BRANCH, null])
      for (const tab of TABS)
        for (const includeCancelled of [true, false])
          for (const withBillRefs of [true, false])
            for (const withLegs of [true, false])
              yield {
                ledgerId,
                fromDate: "2026-08-01",
                toDate: "2026-09-25",
                branchId,
                tab,
                includeCancelled,
                withBillRefs,
                withLegs,
              };
}

describe("params round trip", () => {
  it("parse(build(f)) ≡ f for every filter combination", () => {
    let n = 0;
    for (const filters of everyFilter()) {
      expect(parseFilters(buildSearch(filters), defaults)).toEqual(filters);
      n += 1;
    }
    expect(n).toBe(2 * 2 * 3 * 2 * 2 * 2);
  });

  it("never carries company or year in the URL", () => {
    for (const filters of everyFilter()) {
      const search = buildSearch(filters).toString();
      expect(search).not.toContain(session.companyId);
      expect(search).not.toContain(session.accYear);
      expect(search).not.toMatch(/company|year/i);
    }
  });

  it("keeps 'All branches (combined)' apart from 'not chosen yet'", () => {
    expect(parseFilters(new URLSearchParams("branch=all"), defaults).branchId).toBeNull();
    expect(parseFilters(new URLSearchParams(""), defaults).branchId).toBe(BRANCH);
  });

  it("falls back to defaults for junk", () => {
    const f = parseFilters(new URLSearchParams("ledger=x&from=2026-02-30&tab=weird&cancelled=maybe"), defaults);
    expect(f).toMatchObject({ ledgerId: null, fromDate: "2026-04-01", tab: "vouchers", includeCancelled: true });
  });
});

describe("request queries", () => {
  it("omit branchId for All branches, and send false flags as false", () => {
    const filters = parseFilters(new URLSearchParams("branch=all&cancelled=0&refs=0"), defaults);
    const q = vouchersQuery(session, filters, LEDGER, 2, 200);
    expect("branchId" in q).toBe(false);
    expect(q).toMatchObject({
      companyId: session.companyId,
      accYear: "2026-2027",
      includeCancelled: false,
      withBillRefs: false,
      withLegs: false,
      page: 2,
    });
  });

  it("reportKey ignores the tab but not any server filter", () => {
    const base = parseFilters(new URLSearchParams(`ledger=${LEDGER}`), defaults);
    expect(reportKey({ ...base, tab: "daily" })).toBe(reportKey(base));
    expect(reportKey({ ...base, withLegs: true })).not.toBe(reportKey(base));
  });
});

describe("defaults and the client check", () => {
  it("runs From = year begin, To = today clamped to the year", () => {
    expect(defaultRange(session, "2026-09-25")).toEqual({ fromDate: "2026-04-01", toDate: "2026-09-25" });
    expect(defaultRange(session, "2027-06-01")).toEqual({ fromDate: "2026-04-01", toDate: "2027-03-31" });
  });

  it("names what is wrong", () => {
    const f = parseFilters(new URLSearchParams(`ledger=${LEDGER}`), defaults);
    expect(checkFilters(f, session)).toBeNull();
    expect(checkFilters({ ...f, ledgerId: null }, session)?.field).toBe("ledger");
    expect(checkFilters({ ...f, fromDate: "2026-10-01", toDate: "2026-09-01" }, session)?.message).toBe(
      "From is after To.",
    );
    expect(checkFilters({ ...f, fromDate: "2026-03-01" }, session)?.message).toBe(
      "Both dates must fall inside 01-04-2026 – 31-03-2027.",
    );
  });
});
