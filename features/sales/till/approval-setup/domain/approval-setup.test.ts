import { describe, expect, it } from "vitest";
import {
  APPROVER_LEVELS,
  allEvents,
  approvalErrorText,
  effectiveRule,
  gapEvents,
  gapText,
  grantLive,
  levelRank,
  lowestOkLevel,
  removeRowMessage,
  ruleBody,
  ruleEditCaption,
  ruleFormFrom,
  ruleInForceText,
  ruleLayers,
  ruleMatrix,
  ruleProblem,
  ruleSummary,
  ruleWarning,
  sameRule,
  scopeRow,
  thresholdText,
  whoCanApprove,
  withRuleMode,
  type GridRow,
} from "./approval-setup";

const CO = "co-1";
const BR = "br-1";
const OTHER_BR = "br-2";
const TODAY = "2026-10-10";

function rule(over: Partial<Record<string, unknown>>): GridRow {
  return {
    tar_id: "r",
    tar_company_id: null,
    tar_branch_id: null,
    branch_name: "",
    layer: "SHIPPED",
    tar_event_code: "CASH_VARIANCE",
    tar_mode: "OVER_AMOUNT",
    tar_threshold_amount: "10.00",
    tar_threshold_count: 0,
    tar_threshold_percent: "0.000",
    tar_channel: "EITHER",
    tar_min_role: "SUPERVISOR",
    tar_two_person: false,
    tar_allow_self: false,
    tar_blocks_till: true,
    tar_expire_minutes: 0,
    tar_effective_from: "2000-01-01",
    tar_remarks: "",
    tar_is_active: true,
    ...over,
  };
}

function grant(over: Partial<Record<string, unknown>>): GridRow {
  return {
    taa_id: "g",
    taa_user_id: "u1",
    approver: "Ravi",
    user_role: "MANAGER",
    pin_set: true,
    taa_company_id: CO,
    company_name: "Acme",
    taa_branch_id: null,
    branch_name: "(every branch)",
    taa_role: "STORE_MANAGER",
    taa_event_code: "",
    taa_max_amount: "10000.00",
    taa_can_remote: true,
    taa_valid_from: "2026-10-01",
    taa_valid_to: "",
    taa_remarks: "",
    taa_is_active: true,
    ...over,
  };
}

const SHIPPED = rule({ tar_id: "s1" });
const COMPANY = rule({
  tar_id: "c1",
  tar_company_id: CO,
  layer: "COMPANY",
  tar_threshold_amount: "25.00",
  tar_effective_from: "2026-10-01",
});
const BRANCH = rule({
  tar_id: "b1",
  tar_company_id: CO,
  tar_branch_id: BR,
  layer: "BRANCH",
  tar_threshold_amount: "50.00",
  tar_expire_minutes: 30,
  tar_effective_from: "2026-10-09",
});

describe("vocabulary", () => {
  it("ranks levels the server's way (STORE_MANAGER below CASH_OFFICE)", () => {
    expect(APPROVER_LEVELS[0]).toBe("SUPERVISOR");
    expect(levelRank("STORE_MANAGER")).toBeLessThan(levelRank("CASH_OFFICE"));
    expect(levelRank("")).toBe(-1);
  });

  it("hides the void module's events unless asked", () => {
    expect(allEvents(false)).not.toContain("VOID_BILL");
    expect(allEvents(true)).toContain("RETENDER");
    expect(allEvents(false)).toHaveLength(23);
  });
});

describe("effectiveRule — TillApprovalService.ruleFor", () => {
  const rules = [SHIPPED, COMPANY, BRANCH];
  const at = (branchId: string, extra: Partial<{ today: string; excludeId: string }> = {}) =>
    effectiveRule(rules, { event: "CASH_VARIANCE", branchId, companyId: CO, today: TODAY, ...extra });

  it("branch beats company beats shipped", () => {
    expect(at(BR)?.tar_id).toBe("b1");
    expect(at(OTHER_BR)?.tar_id).toBe("c1");
    expect(at("")?.tar_id).toBe("c1");
  });

  it("ignores rows not yet effective, inactive rows and the excluded row", () => {
    expect(at(BR, { today: "2026-10-05" })?.tar_id).toBe("c1");
    expect(effectiveRule([SHIPPED, { ...COMPANY, tar_is_active: false }], {
      event: "CASH_VARIANCE",
      branchId: "",
      companyId: CO,
      today: TODAY,
    })?.tar_id).toBe("s1");
    expect(at(BR, { excludeId: "b1" })?.tar_id).toBe("c1");
  });

  it("takes the latest effective-from within a layer, and another company's rows never", () => {
    const later = rule({ ...COMPANY, tar_id: "c2", tar_effective_from: "2026-10-08" });
    const foreign = rule({ ...COMPANY, tar_id: "x", tar_company_id: "co-9", tar_effective_from: "2026-10-09" });
    expect(effectiveRule([COMPANY, later, foreign], { event: "CASH_VARIANCE", branchId: "", companyId: CO, today: TODAY })?.tar_id).toBe("c2");
  });

  it("answers null with no row", () => {
    expect(effectiveRule([], { event: "PICKUP", branchId: BR, companyId: CO, today: TODAY })).toBeNull();
  });
});

describe("scope rows and layers", () => {
  const rules = [SHIPPED, COMPANY, BRANCH];

  it("finds THIS scope's own row only", () => {
    expect(scopeRow(rules, { event: "CASH_VARIANCE", companyId: CO, scopeBranch: BR })?.tar_id).toBe("b1");
    expect(scopeRow(rules, { event: "CASH_VARIANCE", companyId: CO, scopeBranch: "" })?.tar_id).toBe("c1");
    expect(scopeRow(rules, { event: "CASH_VARIANCE", companyId: CO, scopeBranch: OTHER_BR })).toBeNull();
    expect(scopeRow([SHIPPED], { event: "CASH_VARIANCE", companyId: CO, scopeBranch: "" })).toBeNull();
  });

  it("shows the branch layer only for the branch in scope", () => {
    expect(ruleLayers(rules, "CASH_VARIANCE", BR)).toEqual({ branch: BRANCH, company: COMPANY, shipped: SHIPPED });
    expect(ruleLayers(rules, "CASH_VARIANCE", "").branch).toBeNull();
    expect(ruleLayers(rules, "CASH_VARIANCE", OTHER_BR).branch).toBeNull();
  });

  it("captions the form by scope and ownership", () => {
    expect(ruleEditCaption(true, BR)).toBe("EDIT · BRANCH ROW");
    expect(ruleEditCaption(false, "")).toBe("NEW · COMPANY ROW  (from the layer in force)");
  });
});

describe("summaries and the matrix", () => {
  it("summarises a rule the Qt way", () => {
    expect(ruleSummary(BRANCH)).toBe("OVER 50.00 · EITHER · SUPERVISOR · exp 30 · from 09/10/2026");
    expect(ruleSummary(SHIPPED)).toBe("OVER 10.00 · EITHER · SUPERVISOR");
    expect(ruleSummary(rule({ tar_mode: "NEVER", tar_two_person: true }))).toBe("NEVER · two-person");
    expect(ruleSummary(null)).toBe("— none —");
  });

  it("shows counts and percents as themselves", () => {
    expect(thresholdText(rule({ tar_mode: "OVER_COUNT", tar_threshold_count: 3 }))).toBe("3");
    expect(thresholdText(rule({ tar_mode: "OVER_PERCENT", tar_threshold_percent: "2.500" }))).toBe("2.5 %");
    expect(thresholdText(rule({ tar_mode: "ALWAYS" }))).toBe("");
    expect(thresholdText(rule({ tar_threshold_amount: "1000.00" }))).toBe("1,000.00");
  });

  it("builds one line per event under its section, with the layer in force", () => {
    const lines = ruleMatrix([SHIPPED, COMPANY, BRANCH, rule({ tar_id: "p", tar_event_code: "PAID_IN", tar_mode: "NEVER", tar_blocks_till: true })], {
      companyId: CO,
      scopeBranch: BR,
      today: TODAY,
      showReserved: false,
    });
    expect(lines.filter((line) => line.kind === "section")).toHaveLength(6);
    const cash = lines.find((line) => line.kind === "event" && line.event === "CASH_VARIANCE");
    expect(cash).toMatchObject({
      mode: "OVER_AMOUNT",
      modeTone: "warning",
      threshold: "50.00",
      channel: "EITHER",
      expires: "30",
      from: "09/10/2026",
      effective: "BRANCH  overrides",
      effectiveTone: "branch",
      blocks: true,
    });
    const paidIn = lines.find((line) => line.kind === "event" && line.event === "PAID_IN");
    expect(paidIn).toMatchObject({ mode: "NEVER", channel: "", minRole: "", blocks: false, effective: "SHIPPED" });
    const pickup = lines.find((line) => line.kind === "event" && line.event === "PICKUP");
    expect(pickup).toMatchObject({ mode: "—", effective: "no rule" });
    expect(ruleMatrix([], { companyId: CO, scopeBranch: "", today: TODAY, showReserved: true }).some(
      (line) => line.kind === "section" && line.title.startsWith("RESERVED"),
    )).toBe(true);
  });
});

describe("the rule form", () => {
  it("fills from the layer in force for a new override, dated today", () => {
    const form = ruleFormFrom(SHIPPED, { ownRow: false, today: TODAY });
    expect(form).toEqual({
      mode: "OVER_AMOUNT",
      threshold: "10.00",
      channel: "EITHER",
      minRole: "SUPERVISOR",
      expire: "0",
      from: TODAY,
      twoPerson: false,
      allowSelf: false,
      blocksTill: true,
    });
    expect(ruleFormFrom(BRANCH, { ownRow: true, today: TODAY }).from).toBe("2026-10-09");
  });

  it("fills a blank event as NEVER · COUNTER · SUPERVISOR · blocks", () => {
    expect(ruleFormFrom(null, { ownRow: false, today: TODAY })).toMatchObject({
      mode: "NEVER",
      channel: "COUNTER",
      minRole: "SUPERVISOR",
      blocksTill: true,
    });
  });

  it("rounds a figure to a count when the mode becomes OVER_COUNT", () => {
    const form = ruleFormFrom(SHIPPED, { ownRow: false, today: TODAY });
    expect(withRuleMode({ ...form, threshold: "2.5" }, "OVER_COUNT").threshold).toBe("3");
    expect(withRuleMode(form, "ALWAYS").threshold).toBe("10.00");
  });

  it("posts the figure only in its own mode's field, and the scope's id when it has a row", () => {
    const form = { ...ruleFormFrom(BRANCH, { ownRow: true, today: TODAY }), threshold: "75" };
    expect(ruleBody(form, { ownId: "b1", companyId: CO, scopeBranch: BR, event: "CASH_VARIANCE" })).toEqual({
      tarId: "b1",
      tarCompanyId: CO,
      tarBranchId: BR,
      tarEventCode: "CASH_VARIANCE",
      tarMode: "OVER_AMOUNT",
      tarThresholdAmount: 75,
      tarThresholdCount: 0,
      tarThresholdPercent: 0,
      tarChannel: "EITHER",
      tarMinRole: "SUPERVISOR",
      tarTwoPerson: false,
      tarAllowSelf: false,
      tarBlocksTill: true,
      tarExpireMinutes: 30,
      tarEffectiveFrom: "2026-10-09",
      tarIsActive: true,
    });
    const count = ruleBody({ ...form, mode: "OVER_COUNT", threshold: "3" }, {
      ownId: null,
      companyId: CO,
      scopeBranch: "",
      event: "NO_SALE",
    });
    expect(count).not.toHaveProperty("tarId");
    expect(count).toMatchObject({ tarBranchId: null, tarThresholdAmount: 0, tarThresholdCount: 3 });
  });

  it("is dirty on a real change only", () => {
    const form = ruleFormFrom(SHIPPED, { ownRow: false, today: TODAY });
    expect(sameRule(form, { ...form, threshold: "10" })).toBe(true);
    expect(sameRule(form, { ...form, threshold: "11" })).toBe(false);
    expect(ruleProblem({ event: "CASH_VARIANCE", dirty: false })).toBe("Nothing changed.");
    expect(ruleProblem({ event: "", dirty: true })).toBe("Pick an event.");
    expect(ruleProblem({ event: "CASH_VARIANCE", dirty: true })).toBe("");
  });

  it("warns, never refuses, when no grant reaches the level", () => {
    const form = { ...ruleFormFrom(SHIPPED, { ownRow: false, today: TODAY }), minRole: "AREA_MANAGER" };
    const context = { event: "CASH_VARIANCE", grants: [grant({})], companyId: CO, scopeBranch: "", loginBranch: BR };
    expect(ruleWarning(form, context)).toContain("No grant at this scope reaches AREA_MANAGER for CASH_VARIANCE");
    // The grants live on their own menu since the Qt split (a449b8c).
    expect(ruleWarning(form, context)).toContain("(Till Approval Authority, menu 285)");
    expect(ruleWarning({ ...form, minRole: "STORE_MANAGER" }, context)).toBe("");
    // Probed a paisa above the threshold: a 10,000 ceiling does not cover OVER 10,000.
    expect(ruleWarning({ ...form, minRole: "SUPERVISOR", threshold: "10000" }, context)).not.toBe("");
    expect(ruleWarning({ ...form, mode: "NEVER" }, { ...context, grants: [] })).toBe("");
  });

  it("says what is in force once a row is removed", () => {
    const below = effectiveRule([SHIPPED, COMPANY, BRANCH], {
      event: "CASH_VARIANCE",
      branchId: BR,
      companyId: CO,
      today: TODAY,
      excludeId: "b1",
    });
    expect(removeRowMessage(BR, "CASH_VARIANCE", below)).toBe(
      "Remove this branch row for CASH_VARIANCE? Then in force: OVER 25.00 · EITHER · SUPERVISOR · from 01/10/2026 (COMPANY).",
    );
  });
});

describe("grants", () => {
  it("counts a grant live only while active, started and not past its valid-to", () => {
    expect(grantLive(grant({}), TODAY)).toBe(true);
    expect(grantLive(grant({ taa_valid_to: TODAY }), TODAY)).toBe(true);
    expect(grantLive(grant({ taa_valid_to: "2026-10-05" }), TODAY)).toBe(false);
    expect(grantLive(grant({ taa_valid_from: "2026-11-01" }), TODAY)).toBe(false);
    expect(grantLive(grant({ taa_is_active: false }), TODAY)).toBe(false);
  });
});

describe("who can approve? and the gap check", () => {
  const rules = [SHIPPED, rule({ tar_id: "p", tar_event_code: "PICKUP", tar_mode: "ALWAYS", tar_channel: "COUNTER" })];
  const grants = [
    grant({ taa_id: "g1" }),
    grant({ taa_id: "g1b", taa_role: "SUPERVISOR", taa_max_amount: null }),
    grant({ taa_id: "g2", taa_user_id: "u2", approver: "Meena", taa_role: "SUPERVISOR", pin_set: false, taa_can_remote: false }),
    grant({ taa_id: "g3", taa_user_id: "u3", approver: "Arun", taa_branch_id: OTHER_BR }),
    grant({ taa_id: "g4", taa_user_id: "u4", approver: "Devi", taa_branch_id: BR, taa_max_amount: "1000.00", pin_set: false }),
  ];
  const args = { companyId: CO, branchId: BR, event: "CASH_VARIANCE", amount: "4000", today: TODAY };

  it("judges each user's best live grant against the rule in force", () => {
    const lines = whoCanApprove(rules, grants, args);
    expect(lines.map((line) => [line.name, line.level, line.verdict])).toEqual([
      ["Ravi", "STORE_MANAGER", "✓ can approve (all branches)"],
      ["Meena", "SUPERVISOR", "✗ no till PIN, not remote"],
      ["Arun", "", "✗ no grant here"],
      ["Devi", "STORE_MANAGER", "✗ amount over 1,000.00"],
    ]);
    expect(lowestOkLevel(lines)).toBe("STORE_MANAGER");
    const pickup = whoCanApprove(rules, grants, { ...args, event: "PICKUP", amount: "1" });
    expect(pickup.find((line) => line.name === "Devi")?.verdict).toBe("✗ no till PIN");
  });

  it("reads remote-only on EITHER and the level floor", () => {
    const remoteOnly = grant({ taa_id: "g9", taa_user_id: "u9", approver: "Sam", pin_set: false });
    expect(whoCanApprove(rules, [remoteOnly], args)[0].verdict).toBe("✓ remote only");
    const floor = [rule({ tar_id: "f", tar_min_role: "AREA_MANAGER" })];
    expect(whoCanApprove(floor, [grant({})], args)[0].verdict).toBe("✗ level below AREA_MANAGER");
  });

  it("explains the rule in force", () => {
    const shipped = effectiveRule(rules, { event: "CASH_VARIANCE", branchId: BR, companyId: CO, today: TODAY });
    expect(ruleInForceText(shipped, { event: "CASH_VARIANCE", amount: "4000", lowest: "STORE_MANAGER" })).toBe(
      "Rule in force: CASH_VARIANCE · OVER 10.00 · EITHER · SUPERVISOR (shipped row) → the lowest level that covers 4,000.00 is STORE_MANAGER.",
    );
    expect(ruleInForceText(shipped, { event: "CASH_VARIANCE", amount: "5", lowest: "" })).toBe(
      "Rule in force: CASH_VARIANCE · OVER 10.00 · EITHER · SUPERVISOR (shipped row) → 5.00 does not need an approval.",
    );
    expect(ruleInForceText(shipped, { event: "CASH_VARIANCE", amount: "40", lowest: "" })).toContain(
      "NOBODY here can approve 40.00.",
    );
    expect(ruleInForceText(null, { event: "PAID_IN", amount: "1", lowest: "" })).toBe("No rule for PAID_IN — nothing to approve.");
  });

  it("lists the live events nobody could approve at their own threshold", () => {
    const gaps = gapEvents(rules, [grant({ pin_set: false, taa_can_remote: true })], { companyId: CO, branchId: BR, today: TODAY });
    // CASH_VARIANCE (EITHER) is covered remotely; PICKUP (COUNTER) needs a PIN.
    expect(gaps).toEqual(["PICKUP"]);
    expect(gapText(gaps)).toBe(
      "1 event(s) at this branch have nobody who could approve them at the rule's own threshold: PICKUP. Warning, not refusal.",
    );
  });
});

describe("approvalErrorText", () => {
  it("prefers the field lines of the till body", () => {
    const error = {
      status: 400,
      data: { success: false, message: "Validation failed", errors: [{ field: "taaValidTo", message: "taaValidTo cannot be before taaValidFrom" }] },
    };
    expect(approvalErrorText(error, "x")).toBe("Validation failed\ntaaValidTo cannot be before taaValidFrom");
    const single = { data: { message: "A rule keeps its scope; add a branch rule instead", errors: [{ message: "A rule keeps its scope; add a branch rule instead" }] } };
    expect(approvalErrorText(single, "x")).toBe("A rule keeps its scope; add a branch rule instead");
  });

  it("reads the global filter's nested body and falls back", () => {
    expect(approvalErrorText({ data: { statusCode: 401, message: { message: "Unauthorized", errors: [] } } }, "x")).toBe("Unauthorized");
    expect(approvalErrorText({ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" }, "x")).toBe("TypeError: Failed to fetch");
    expect(approvalErrorText(null, "The save failed.")).toBe("The save failed.");
  });
});
