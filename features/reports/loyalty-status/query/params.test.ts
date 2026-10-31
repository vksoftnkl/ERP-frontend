import { describe, expect, it } from "vitest";
import { deletedScheme, scheme, TODAY } from "../testing/fixtures";
import {
  calendarQuery,
  defaultFilters,
  defaultStatement,
  digitsOnly,
  expiringQuery,
  exportQuery,
  filterSummary,
  keepScheme,
  membersQuery,
  schemeChoicesOf,
  schemeChoicesQuery,
  schemeDetailQuery,
  schemesQuery,
  statementQuery,
  subtitleOf,
  withinDaysOf,
  yearStartOf,
} from "./params";

const C = "019c8ea6-19e9-78a8-b15f-749e1cde7292";
const BR = { id: "019c8ea7-b0f5-72d5-96a5-1abfc80cc8ab", text: "Acme Foods - Coimbatore Branch" };

describe("defaults (Qt resetFilters)", () => {
  it("starts the year on 1 April", () => {
    expect(yearStartOf("2026-10-31")).toBe("2026-04-01");
    expect(yearStartOf("2027-02-10")).toBe("2026-04-01");
    expect(yearStartOf("2026-04-01")).toBe("2026-04-01");
  });

  it("sends exactly what Qt sends on open", () => {
    const f = defaultFilters(TODAY);
    expect(membersQuery(C, f.members)).toEqual({ companyId: C, status: "ACTIVE", balanceGtZero: "true" });
    expect(expiringQuery(C, f.expiring)).toEqual({
      companyId: C,
      withinDays: "30",
      hasMobile: "true",
      activeOnly: "true",
    });
    expect(schemesQuery(C, f.schemes)).toEqual({
      companyId: C,
      from: "2026-04-01",
      to: TODAY,
      includeClosedHolding: "true",
      splitBy: "scheme",
    });
    expect(calendarQuery(C, f.expiring)).toEqual({ companyId: C, days: "90" });
    expect(statementQuery(C, "m1", defaultStatement(TODAY))).toEqual({
      companyId: C,
      memberId: "m1",
      from: "2026-04-01",
      to: TODAY,
      showReversals: "true",
    });
    expect(schemeChoicesQuery(C, TODAY)).toEqual({ companyId: C, from: "2026-04-01", to: TODAY });
  });
});

describe("queries", () => {
  it("sends every member filter that is set, trimmed", () => {
    const f = defaultFilters(TODAY).members;
    const q = membersQuery(C, {
      ...f,
      lscId: "L1",
      branch: BR,
      status: "",
      find: "  lakshmi ",
      balanceGtZero: false,
      eligibleOnly: true,
      pointsMin: "100",
      pointsMax: "",
      includeMergedClosed: true,
      earned: true,
    });
    expect(q).toEqual({
      companyId: C,
      branchId: BR.id,
      lscId: "L1",
      search: "lakshmi",
      balanceGtZero: "false",
      eligibleOnly: "true",
      pointsMin: "100",
      includeMergedClosed: "true",
      earnedFrom: "2026-04-01",
      earnedTo: TODAY,
    });
  });

  it("drops the earned dates unless both are real days", () => {
    const f = { ...defaultFilters(TODAY).members, earned: true, earnedTo: "" };
    expect(membersQuery(C, f).earnedFrom).toBeUndefined();
  });

  it("bounds 'expiring within' to 1–365", () => {
    expect(withinDaysOf("")).toBe(1);
    expect(withinDaysOf("0")).toBe(1);
    expect(withinDaysOf("45")).toBe(45);
    expect(withinDaysOf("999")).toBe(365);
    expect(digitsOnly("1a2-3")).toBe("123");
  });

  it("asks the month-wise chart and the gifts for the scheme on the cursor", () => {
    const f = { ...defaultFilters(TODAY).schemes, branch: BR, lscId: "ignored" };
    expect(schemeDetailQuery(C, f, "L9")).toEqual({
      companyId: C,
      branchId: BR.id,
      lscId: "L9",
      from: "2026-04-01",
      to: TODAY,
    });
  });

  it("exports a tab with that tab's query, its name and the format", () => {
    const all = defaultFilters(TODAY);
    expect(exportQuery("members", C, all, "xlsx")).toEqual({
      companyId: C,
      status: "ACTIVE",
      balanceGtZero: "true",
      tab: "members",
      format: "xlsx",
    });
    expect(exportQuery("schemes", C, all, "pdf")).toMatchObject({ tab: "schemes", format: "pdf", splitBy: "scheme" });
    expect(exportQuery("expiring", C, all, "pdf")).toMatchObject({ tab: "expiring", withinDays: "30" });
  });
});

describe("scheme pickers (Qt loadSchemeChoices)", () => {
  it("adds the code to a name met twice, and marks a deleted scheme", () => {
    const choices = schemeChoicesOf([scheme, deletedScheme]);
    expect(choices).toEqual([
      { value: "", label: "All schemes" },
      { value: scheme.lscId, label: "Loyalty concurrency test · TSTCONCmuusitzt" },
      { value: deletedScheme.lscId, label: "Loyalty concurrency test · TSTCONCold (deleted)" },
    ]);
    expect(keepScheme(scheme.lscId, choices)).toBe(scheme.lscId);
    expect(keepScheme("gone", choices)).toBe("");
  });
});

describe("the lines (Qt filterSummary / refreshSubtitle)", () => {
  const choices = schemeChoicesOf([scheme]);

  it("words the filters in force per tab", () => {
    const all = defaultFilters(TODAY);
    expect(filterSummary("members", all, choices)).toBe("Scheme: All  ·  Branch: All  ·  Status: ACTIVE  ·  Balance > 0");
    expect(filterSummary("expiring", all, choices)).toBe(
      "Scheme: All  ·  Branch: All  ·  Expiring within 30 days  ·  Has mobile  ·  Active only",
    );
    expect(filterSummary("schemes", all, choices)).toBe(
      "Scheme: All  ·  Branch: All  ·  01/04/2026 → 31/10/2026  ·  split by Scheme  ·  incl. closed / deleted holding points",
    );
    const narrowed = {
      ...all,
      members: {
        ...all.members,
        lscId: scheme.lscId,
        branch: BR,
        status: "" as const,
        eligibleOnly: true,
        pointsMax: "500",
        earned: true,
        includeMergedClosed: true,
        find: "lak",
      },
    };
    expect(filterSummary("members", narrowed, choices)).toBe(
      "Scheme: Loyalty concurrency test  ·  Branch: Acme Foods - Coimbatore Branch  ·  Status: All  ·  Balance > 0  ·  " +
        "Eligible for a gift  ·  Points any – 500  ·  Earned 01/04/2026 → 31/10/2026  ·  incl. merged / closed  ·  Find: lak",
    );
  });

  it("names the company, the branch and the tab's window", () => {
    const all = defaultFilters(TODAY);
    expect(subtitleOf("members", all, "Amazon Retail", TODAY)).toBe("Amazon Retail  ·  All branches  ·  as on 31/10/2026");
    expect(subtitleOf("expiring", all, "Amazon Retail", TODAY)).toBe(
      "Amazon Retail  ·  All branches  ·  lots expiring 31/10/2026 → 30/11/2026",
    );
    expect(subtitleOf("schemes", { ...all, schemes: { ...all.schemes, branch: BR } }, "Amazon Retail", TODAY)).toBe(
      "Amazon Retail  ·  Acme Foods - Coimbatore Branch  ·  01/04/2026 → 31/10/2026",
    );
  });
});
