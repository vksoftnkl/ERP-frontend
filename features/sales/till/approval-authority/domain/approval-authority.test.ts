import { describe, expect, it } from "vitest";
import type { GridRow } from "@/features/sales/till/approval-setup/domain/approval-setup";
import {
  canCopyGrants,
  canToggleGrant,
  copyConfirmText,
  copyGrantBodies,
  copyRefusal,
  grantCellText,
  grantEventChoices,
  grantFacts,
  grantFormBody,
  grantFormOf,
  grantFormProblem,
  grantHeading,
  grantListEmptyText,
  grantListParams,
  grantOpen,
  grantRowHint,
  grantStatusTone,
  sameGrantForm,
  storedGrantBody,
  todayIso,
  toggleGrantBody,
  toggleGrantWords,
  whoCheck,
  withEveryCompany,
} from "./approval-authority";

const CO = "co-1";
const BR = "br-1";
const TODAY = "2026-10-14";

/** A grid 152 row, as the runner serialises it. */
function grant(over: Partial<Record<string, unknown>> = {}): GridRow {
  return {
    taa_id: "g1",
    taa_user_id: "u1",
    approver: "Ravi",
    user_role: "MANAGER",
    pin_set: true,
    taa_company_id: CO,
    company_name: "Acme",
    taa_branch_id: BR,
    branch_name: "Main",
    taa_role: "STORE_MANAGER",
    taa_event_code: "CASH_VARIANCE",
    event_label: "CASH_VARIANCE",
    taa_max_amount: "10000.00",
    max_label: "10,000.00",
    taa_can_remote: true,
    taa_valid_from: "2026-10-01",
    taa_valid_to: "",
    valid_from_label: "01-10-2026",
    valid_to_label: "",
    taa_remarks: "",
    taa_is_active: true,
    grant_open: true,
    grant_status: "ACTIVE",
    ...over,
  };
}

/** Every company, every branch, every event, no ceiling — the server's NULLs. */
const GROUP = grant({
  taa_id: "g2",
  taa_company_id: null,
  company_name: "(every company)",
  taa_branch_id: null,
  branch_name: "(every branch)",
  taa_event_code: "",
  event_label: "(every event)",
  taa_max_amount: null,
  max_label: "no ceiling",
  taa_remarks: "  group finance  ",
});

describe("the list", () => {
  it("always sends both quoted tokens, and nothing without a company", () => {
    expect(grantListParams({ companyId: CO, showInactive: false })).toEqual({ icompany_id: CO, iinactive: "false" });
    expect(grantListParams({ companyId: CO, showInactive: true })).toEqual({ icompany_id: CO, iinactive: "true" });
    expect(grantListParams({ companyId: "", showInactive: true })).toBeNull();
    expect(grantListEmptyText({ companyId: "", showInactive: false })).toBe("Choose a company in the header first.");
  });

  it("draws ticks and tones the status", () => {
    expect(grantCellText("taa_can_remote", grant())).toBe("✓");
    expect(grantCellText("pin_set", grant({ pin_set: false }))).toBe("");
    expect(grantCellText("max_label", GROUP)).toBe("no ceiling");
    expect(grantStatusTone(grant())).toBe("success");
    expect(grantStatusTone(grant({ grant_status: "FUTURE" }))).toBe("info");
    expect(grantStatusTone(grant({ grant_status: "ENDED" }))).toBe("muted");
  });

  it("says what happens to the highlighted grant", () => {
    expect(grantRowHint(null)).toBe("");
    expect(grantRowHint(grant())).toBe("");
    expect(grantRowHint(grant({ grant_status: "ENDED", valid_to_label: "05-10-2026" }))).toBe(
      "Ended 05-10-2026 — Active on reopens it with no end date",
    );
    expect(grantRowHint(grant({ valid_to_label: "31-12-2026", pin_set: false }))).toBe(
      "Ends on its own 31-12-2026 · Ravi has no till PIN — remote approvals only",
    );
    expect(grantRowHint(grant({ grant_status: "OFF" }))).toBe("Switched off — Active on reopens it");
  });

  it("gates Active on / off on EDIT and Copy grants on CREATE", () => {
    const row = grant();
    expect(canToggleGrant(row, { canCreate: true, canEdit: false })).toBe(false);
    expect(canToggleGrant(row, { canCreate: false, canEdit: true })).toBe(true);
    expect(canToggleGrant(null, { canCreate: true, canEdit: true })).toBe(false);
    expect(canCopyGrants(row, { canCreate: true, canEdit: false })).toBe(true);
    expect(canCopyGrants(row, { canCreate: false, canEdit: true })).toBe(false);
  });

  it("reads today as the local calendar date", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("Active on / off", () => {
  it("posts the grant as stored, blanks as NULLs, remarks trimmed", () => {
    expect(storedGrantBody(GROUP)).toEqual({
      taaId: "g2",
      taaUserId: "u1",
      taaCompanyId: null,
      taaBranchId: null,
      taaRole: "STORE_MANAGER",
      taaEventCode: null,
      taaMaxAmount: null,
      taaCanRemote: true,
      taaValidFrom: "2026-10-01",
      taaValidTo: null,
      taaRemarks: "group finance",
      taaIsActive: true,
    });
    expect(storedGrantBody(grant())).toMatchObject({ taaCompanyId: CO, taaBranchId: BR, taaMaxAmount: 10000 });
  });

  it("switches off at once and keeps the dates", () => {
    const row = grant({ taa_valid_to: "2026-12-31" });
    expect(grantOpen(row)).toBe(true);
    expect(toggleGrantBody(row, false, TODAY)).toMatchObject({ taaId: "g1", taaIsActive: false, taaValidTo: "2026-12-31" });
  });

  it("reopens an ended grant with no end date, and keeps a future end", () => {
    const ended = grant({ taa_valid_to: "2026-10-05", grant_open: false, grant_status: "ENDED", valid_to_label: "05-10-2026" });
    expect(toggleGrantBody(ended, true, TODAY)).toMatchObject({ taaIsActive: true, taaValidTo: null });
    const off = grant({ taa_is_active: false, taa_valid_to: "2026-12-31", grant_open: false, grant_status: "OFF" });
    expect(toggleGrantBody(off, true, TODAY)).toMatchObject({ taaIsActive: true, taaValidTo: "2026-12-31" });
    expect(toggleGrantWords(ended, true, TODAY)).toEqual({
      title: "Reactivate",
      message: 'Reactivate grant "Ravi · STORE_MANAGER · CASH_VARIANCE"?',
      note: "Its Valid To (05-10-2026) has passed: it reopens with no end date.",
      done: "Ravi's grant reactivated.",
    });
    expect(toggleGrantWords(off, true, TODAY).note).toBe("");
    expect(toggleGrantWords(GROUP, false, TODAY).message).toBe(
      'Deactivate grant "Ravi · STORE_MANAGER · (every event)"? It stays in history and can be reactivated.',
    );
  });
});

describe("the grant popup", () => {
  it("opens a new grant on this company, every branch and event, SUPERVISOR, from today", () => {
    expect(grantFormOf(null, TODAY)).toEqual({
      userId: "",
      userName: "",
      level: "SUPERVISOR",
      everyCompany: false,
      branchId: "",
      branchName: "",
      event: "",
      max: "",
      remote: false,
      validFrom: TODAY,
      validTo: "",
      active: true,
      remarks: "",
    });
    expect(grantHeading(null)).toMatchObject({ title: "New Approval Grant", submitLabel: "Save" });
    expect(grantFacts(null)).toBe("");
  });

  it("fills from the grid row, the grid's '(every branch)' left to the placeholder", () => {
    expect(grantFormOf(grant({ taa_valid_to: "2026-12-31" }), TODAY)).toEqual({
      userId: "u1",
      userName: "Ravi",
      level: "STORE_MANAGER",
      everyCompany: false,
      branchId: BR,
      branchName: "Main",
      event: "CASH_VARIANCE",
      max: "10000.00",
      remote: true,
      validFrom: "2026-10-01",
      validTo: "2026-12-31",
      active: true,
      remarks: "",
    });
    expect(grantFormOf(GROUP, TODAY)).toMatchObject({ everyCompany: true, branchId: "", branchName: "", event: "", max: "" });
    expect(grantHeading(grant())).toMatchObject({ title: "Approval Grant · Ravi", submitLabel: "Update" });
  });

  it("round-trips a row to the body it was saved with", () => {
    for (const row of [grant(), GROUP, grant({ taa_valid_to: "2026-12-31", taa_is_active: false })]) {
      expect(grantFormBody(grantFormOf(row, TODAY), { rowId: String(row.taa_id), companyId: CO })).toEqual(
        storedGrantBody(row),
      );
    }
  });

  it("posts every company with no branch, blanks as NULLs, and a new grant without taaId", () => {
    const form = { ...grantFormOf(null, TODAY), userId: "u7", branchId: BR, branchName: "Main", max: "500" };
    expect(grantFormBody(form, { rowId: null, companyId: CO })).toEqual({
      taaUserId: "u7",
      taaCompanyId: CO,
      taaBranchId: BR,
      taaRole: "SUPERVISOR",
      taaEventCode: null,
      taaMaxAmount: 500,
      taaCanRemote: false,
      taaValidFrom: TODAY,
      taaValidTo: null,
      taaRemarks: null,
      taaIsActive: true,
    });
    // A stale branch never rides along with every company, even if the form still held one.
    expect(grantFormBody({ ...form, everyCompany: true }, { rowId: "g1", companyId: CO })).toMatchObject({
      taaId: "g1",
      taaCompanyId: null,
      taaBranchId: null,
    });
    expect(withEveryCompany(form, true)).toMatchObject({ everyCompany: true, branchId: "", branchName: "" });
    expect(withEveryCompany(form, false)).toMatchObject({ everyCompany: false, branchId: BR });
  });

  it("refuses in field order, Valid To before Valid From last", () => {
    const form = { ...grantFormOf(null, TODAY), userId: "u1" };
    expect(grantFormProblem({ ...form, userId: "" })).toEqual({ field: "userId", message: "Pick the user who may approve." });
    expect(grantFormProblem({ ...form, max: "1.2.3" })?.field).toBe("max");
    expect(grantFormProblem({ ...form, validFrom: "" })).toEqual({
      field: "validFrom",
      message: "Enter the date the grant starts.",
    });
    expect(grantFormProblem({ ...form, validTo: "2026-10-01" })).toEqual({
      field: "validTo",
      message: "Valid To is before Valid From.",
    });
    expect(grantFormProblem({ ...form, validTo: TODAY })).toBeNull();
  });

  it("is unchanged when only the spelling of a figure differs", () => {
    const form = grantFormOf(grant(), TODAY);
    expect(sameGrantForm(form, { ...form, max: "10000" })).toBe(true);
    expect(sameGrantForm(form, { ...form, remarks: "  " })).toBe(true);
    expect(sameGrantForm(form, { ...form, active: false })).toBe(false);
  });

  it("keeps a saved event the live list leaves out", () => {
    expect(grantEventChoices("")).not.toContain("VOID_BILL");
    expect(grantEventChoices("VOID_BILL").at(-1)).toBe("VOID_BILL");
    expect(grantEventChoices("PICKUP").filter((event) => event === "PICKUP")).toHaveLength(1);
  });

  it("states whether the approver can reach the counter", () => {
    expect(grantFacts(grant())).toBe("Ravi has a till PIN — can approve at the counter  ·  user role MANAGER");
    expect(grantFacts(grant({ pin_set: false, user_role: "" }))).toBe(
      "Ravi has NO till PIN — can only approve remotely (User Administration, menu 58, sets one)",
    );
  });
});

describe("Copy grants", () => {
  const rows = [
    grant(),
    grant({ taa_id: "g-ended", taa_valid_to: "2026-10-05" }),
    grant({ taa_id: "g-future", taa_valid_from: "2026-11-01" }),
    grant({ taa_id: "g-off", taa_is_active: false }),
    { ...GROUP, taa_valid_to: "2026-12-31" },
    grant({ taa_id: "g-other", taa_user_id: "u2", approver: "Meena" }),
  ];

  it("re-makes the source's LIVE grants for the target, from today, as new grants", () => {
    const bodies = copyGrantBodies(rows, { fromUserId: "u1", toUserId: "u7", today: TODAY });
    expect(bodies).toEqual([
      {
        taaUserId: "u7",
        taaCompanyId: CO,
        taaBranchId: BR,
        taaRole: "STORE_MANAGER",
        taaEventCode: "CASH_VARIANCE",
        taaMaxAmount: 10000,
        taaCanRemote: true,
        taaValidFrom: TODAY,
        taaValidTo: null,
        taaRemarks: null,
        taaIsActive: true,
      },
      {
        taaUserId: "u7",
        taaCompanyId: null,
        taaBranchId: null,
        taaRole: "STORE_MANAGER",
        taaEventCode: null,
        taaMaxAmount: null,
        taaCanRemote: true,
        taaValidFrom: TODAY,
        taaValidTo: "2026-12-31",
        taaRemarks: "group finance",
        taaIsActive: true,
      },
    ]);
    expect(bodies.some((body) => "taaId" in body)).toBe(false);
    expect(copyGrantBodies(rows, { fromUserId: "u9", toUserId: "u7", today: TODAY })).toEqual([]);
  });

  it("wants another user, and asks before giving", () => {
    expect(copyRefusal("u1", null)).toBe("Pick another user to give the grants to.");
    expect(copyRefusal("u1", { id: "u1" })).toBe("Pick another user to give the grants to.");
    expect(copyRefusal("u1", { id: "u7" })).toBe("");
    expect(copyConfirmText(2, "Kumar", "Ravi")).toBe("Give Kumar the same 2 active grant(s) as Ravi?");
  });
});

describe("Who can approve?", () => {
  const rules: GridRow[] = [
    {
      tar_id: "s1",
      tar_company_id: null,
      tar_branch_id: null,
      layer: "SHIPPED",
      tar_event_code: "CASH_VARIANCE",
      tar_mode: "OVER_AMOUNT",
      tar_threshold_amount: "10.00",
      tar_channel: "EITHER",
      tar_min_role: "SUPERVISOR",
      tar_expire_minutes: 0,
      tar_effective_from: "2000-01-01",
      tar_is_active: true,
    },
  ];

  it("gives the verdicts, the rule in force and the gaps in one check", () => {
    const result = whoCheck(rules, [grant(), grant({ taa_id: "g9", taa_user_id: "u9", approver: "Devi", taa_max_amount: "500.00" })], {
      companyId: CO,
      branchId: BR,
      event: "CASH_VARIANCE",
      amount: "1000.00",
      today: TODAY,
    });
    expect(result.lines.map((line) => [line.name, line.ok])).toEqual([
      ["Ravi", true],
      ["Devi", false],
    ]);
    expect(result.ruleLine).toBe(
      "Rule in force: CASH_VARIANCE · OVER 10.00 · EITHER · SUPERVISOR (shipped row) → the lowest level that covers 1,000.00 is STORE_MANAGER.",
    );
    expect(result.gaps).toEqual([]);
    expect(whoCheck(rules, [], { companyId: CO, branchId: BR, event: "CASH_VARIANCE", amount: "1", today: TODAY }).gaps).toEqual([
      "CASH_VARIANCE",
    ]);
  });
});
