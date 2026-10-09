import { describe, expect, it } from "vitest";
import {
  buildSearch,
  calendarWindow,
  changeSide,
  checkFilters,
  defaultAsOn,
  exportQuery,
  filterQuery,
  normaliseBuckets,
  parseFilters,
  partiesQuery,
  reportKey,
  type Filters,
  type Session,
} from "./params";

const SESSION: Session = {
  companyId: "c0000000-0000-4000-8000-000000000000",
  branchId: "b0000000-0000-4000-8000-000000000001",
  yearBegin: "2026-04-01",
  yearEnd: "2027-03-31",
};
const DEFAULTS = { asOn: "2026-09-25", branchId: SESSION.branchId };
const U = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const full: Filters = {
  side: "RECEIVABLE",
  asOn: "2026-09-25",
  branchId: U(1),
  groupId: U(2),
  areaId: U(3),
  salesmanId: U(4),
  collectionDay: "THU",
  partyId: U(5),
  minDueDays: 10,
  maxDueDays: 90,
  ageBy: "DUE_DATE",
  buckets: "15,45,90",
  onlyOverdue: true,
  includeOnAccount: false,
  deductPdc: true,
  hideZero: false,
  tab: "calendar",
  sort: "bucket2",
  dir: "asc",
  selected: U(6),
  billSort: "overdue",
  billDir: "desc",
  dueOn: "2026-10-02",
  groupBy: "SALESMAN",
  calFrom: "2026-09-25",
  calTo: "2026-10-25",
};

describe("the URL round trip", () => {
  it("parse(build(f)) ≡ f for every filter", () => {
    expect(parseFilters(buildSearch(full), DEFAULTS)).toEqual(full);
  });

  it("keeps the plain defaults too", () => {
    const f = parseFilters(new URLSearchParams(), DEFAULTS);
    expect(f).toMatchObject({
      side: "RECEIVABLE",
      asOn: "2026-09-25",
      branchId: SESSION.branchId,
      groupId: null,
      ageBy: "BILL_DATE",
      buckets: "30,60,90,180",
      onlyOverdue: false,
      includeOnAccount: true,
      deductPdc: false,
      hideZero: true,
      tab: "parties",
      sort: "net",
      dir: "desc",
    });
    expect(parseFilters(buildSearch(f), DEFAULTS)).toEqual(f);
  });

  it("tells 'all branches' from 'no choice made'", () => {
    expect(parseFilters(new URLSearchParams("branch=all"), DEFAULTS).branchId).toBeNull();
    expect(parseFilters(new URLSearchParams(""), DEFAULTS).branchId).toBe(SESSION.branchId);
  });

  it("never carries companyId or a year", () => {
    const search = buildSearch(full).toString();
    expect(search).not.toContain(SESSION.companyId);
    expect(search).not.toMatch(/company|accYear|year=/i);
    expect(Object.keys(filterQuery(SESSION, full))).not.toContain("accYear");
  });

  it("drops customer-only filters from a Payable link", () => {
    const f = parseFilters(buildSearch({ ...full, side: "PAYABLE" }), DEFAULTS);
    expect(f).toMatchObject({ side: "PAYABLE", areaId: null, salesmanId: null, collectionDay: null });
    const q = filterQuery(SESSION, { ...full, side: "PAYABLE" });
    expect(q).not.toHaveProperty("areaId");
    expect(q).not.toHaveProperty("salesmanId");
    expect(q).not.toHaveProperty("collectionDay");
  });
});

describe("buckets", () => {
  it.each([
    ["30 60 90 180", "30,60,90,180"],
    ["30,60,90,180", "30,60,90,180"],
    ["30·60·90·180", "30,60,90,180"],
    [" 30 · 60 ·90, 180 ", "30,60,90,180"],
    ["90 30", "90,30"],
  ])("normalises %j → %s, without judging order", (text, expected) => {
    expect(normaliseBuckets(text)).toBe(expected);
  });

  it("round-trips a normalised list through the URL", () => {
    const f = parseFilters(new URLSearchParams("b=30%2060%2090"), DEFAULTS);
    expect(f.buckets).toBe("30,60,90");
  });
});

describe("a Side change", () => {
  it("clears every side-specific id and keeps the rest", () => {
    const next = changeSide(full, "PAYABLE");
    expect(next).toMatchObject({
      side: "PAYABLE",
      groupId: null,
      areaId: null,
      salesmanId: null,
      collectionDay: null,
      partyId: null,
      asOn: full.asOn,
      buckets: full.buckets,
      branchId: full.branchId,
    });
    expect(changeSide(full, "RECEIVABLE")).toBe(full);
  });
});

describe("request queries", () => {
  it("sends the booleans explicitly and omits absent ids", () => {
    const f = parseFilters(new URLSearchParams("branch=all"), DEFAULTS);
    const q = partiesQuery(SESSION, f, 1);
    expect(q).toEqual({
      companyId: SESSION.companyId,
      asOn: "2026-09-25",
      side: "RECEIVABLE",
      ageBy: "BILL_DATE",
      buckets: "30,60,90,180",
      onlyOverdue: false,
      includeOnAccount: true,
      deductPdc: false,
      hideZero: true,
      sort: "net",
      dir: "desc",
      page: 1,
      pageSize: 200,
    });
  });

  it("sends no dueOn to the export, which does not take it", () => {
    expect(exportQuery(SESSION, full, "BILLS")).not.toHaveProperty("dueOn");
    expect(exportQuery(SESSION, full, "PARTY_STATEMENT").partyId).toBe(full.selected);
  });

  it("leaves the view state out of the report's identity", () => {
    const view: Filters = { ...full, tab: "parties", sort: "name", selected: null };
    expect(reportKey(full)).toBe(reportKey(view));
    expect(reportKey(full)).not.toBe(reportKey({ ...full, deductPdc: false }));
  });

  it("defaults the calendar to As on → As on + 30", () => {
    expect(calendarWindow({ ...full, calFrom: null, calTo: null })).toEqual({ from: "2026-09-25", to: "2026-10-25" });
  });
});

describe("defaults and checks", () => {
  it("defaults As on to today, or the year end once today is past it", () => {
    expect(defaultAsOn(SESSION, "2026-10-09")).toBe("2026-10-09");
    expect(defaultAsOn(SESSION, "2027-05-01")).toBe("2027-03-31");
  });

  it("catches a reversed due-days window before Show", () => {
    expect(checkFilters({ ...full, minDueDays: 100, maxDueDays: 10 })?.field).toBe("dueDays");
    expect(checkFilters(full)).toBeNull();
  });
});
