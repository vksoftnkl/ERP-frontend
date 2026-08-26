import { describe, expect, it } from "vitest";
import type { AppSettingScope, EffectiveSetting, ScopeTarget } from "../types";
import { buildOverride } from "./build-override";
import {
  deriveScope,
  hasOverrideAtScope,
  isCounterWithoutBranch,
  isEditableAtScope,
  maxScopeExplanation,
  resolveQuery,
  sourceLabel,
} from "./scope";
import { isSessionScope, sessionQuery } from "./session-scope";
import { isSameValue, parseBool, toText, validateText } from "./value-text";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const BRANCH = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";

function setting(overrides: Partial<EffectiveSetting> = {}): EffectiveSetting {
  return {
    asdId: "asd-1",
    asdKey: "sales.default_price_level",
    asdModule: "SALES",
    asdGroup: "Pricing",
    asdLabel: "Default price level",
    asdDescription: null,
    asdDataType: "INT",
    asdDefaultValue: "1",
    asdAllowedValues: null,
    asdMinValue: 1,
    asdMaxValue: 10,
    asdMaxScope: "BRANCH",
    asdSortOrder: 10,
    asdNeedsRelogin: false,
    source: "DEFAULT",
    value: "1",
    override: null,
    ...overrides,
  };
}

function override(scope: AppSettingScope, asvId = "asv-1") {
  return {
    asvId,
    asvScope: scope,
    asvCompanyId: scope === "COMPANY" ? COMPANY : null,
    asvBranchId: scope === "BRANCH" ? BRANCH : null,
    asvDeviceId: scope === "DEVICE" ? DEVICE : null,
    asvUserId: null,
    asvValue: "3",
    asvRemarks: null,
    asvSyncDate: null,
    asvCreatedOn: "2026-08-25T00:00:00.000Z",
    asvCreatedBy: "tester",
    asvModifiedOn: null,
    asvModifiedBy: null,
  };
}

const target = (over: Partial<ScopeTarget> = {}): ScopeTarget => ({
  companyId: COMPANY,
  branchId: null,
  deviceId: null,
  ...over,
});

describe("deriveScope — the level is which of branch and counter are set", () => {
  it("company + all branches + all counters is COMPANY", () => {
    expect(deriveScope(target())).toBe("COMPANY");
  });

  it("company + a branch + all counters is BRANCH", () => {
    expect(deriveScope(target({ branchId: BRANCH }))).toBe("BRANCH");
  });

  it("company + a branch + a counter is DEVICE", () => {
    expect(deriveScope(target({ branchId: BRANCH, deviceId: DEVICE }))).toBe("DEVICE");
  });

  it("ignores a counter chosen with no branch — a till belongs to a branch", () => {
    const incoherent = target({ deviceId: DEVICE });
    expect(isCounterWithoutBranch(incoherent)).toBe(true);
    expect(deriveScope(incoherent)).toBe("COMPANY");
    expect(resolveQuery(incoherent)).toEqual({ companyId: COMPANY });
  });
});

describe("resolveQuery — only the layers being edited may win", () => {
  it("sends the company alone at COMPANY, so a branch override cannot leak in", () => {
    expect(resolveQuery(target({ branchId: null, deviceId: null }))).toEqual({
      companyId: COMPANY,
    });
  });

  it("sends company + branch at BRANCH", () => {
    expect(resolveQuery(target({ branchId: BRANCH }))).toEqual({
      companyId: COMPANY,
      branchId: BRANCH,
    });
  });

  it("sends all three at DEVICE, and never a userId", () => {
    const query = resolveQuery(target({ branchId: BRANCH, deviceId: DEVICE }));
    expect(query).toEqual({ companyId: COMPANY, branchId: BRANCH, deviceId: DEVICE });
    expect("userId" in query).toBe(false);
  });
});

describe("isEditableAtScope — asdMaxScope caps how deep a setting goes", () => {
  const cases: Array<[EffectiveSetting["asdMaxScope"], Record<string, boolean>]> = [
    ["GLOBAL", { COMPANY: false, BRANCH: false, DEVICE: false }],
    ["COMPANY", { COMPANY: true, BRANCH: false, DEVICE: false }],
    ["BRANCH", { COMPANY: true, BRANCH: true, DEVICE: false }],
    ["DEVICE", { COMPANY: true, BRANCH: true, DEVICE: true }],
    ["USER", { COMPANY: true, BRANCH: true, DEVICE: true }],
  ];

  it.each(cases)("max scope %s", (maxScope, expected) => {
    for (const [scope, isEditable] of Object.entries(expected)) {
      expect(isEditableAtScope(setting({ asdMaxScope: maxScope }), scope as AppSettingScope)).toBe(
        isEditable,
      );
    }
  });

  it("explains a read-only row instead of hiding it", () => {
    expect(maxScopeExplanation(setting({ asdMaxScope: "COMPANY" }), "BRANCH")).toBe(
      "Set at company level — switch the bar to company to change it.",
    );
    expect(maxScopeExplanation(setting({ asdMaxScope: "BRANCH" }), "BRANCH")).toBeNull();
  });
});

describe("override at this scope vs an override at all", () => {
  it("a broader override is not an override here", () => {
    const row = setting({ source: "OVERRIDE", override: override("COMPANY") });
    expect(hasOverrideAtScope(row, "COMPANY")).toBe(true);
    expect(hasOverrideAtScope(row, "BRANCH")).toBe(false);
  });

  it("the badge names the layer the value was set at, not just that it was set", () => {
    expect(sourceLabel(setting())).toBe("Default");
    expect(sourceLabel(setting({ source: "OVERRIDE", override: override("BRANCH") }))).toBe(
      "Set on branch",
    );
  });
});

describe("toText — the value goes back as text, whatever the data type", () => {
  it("BOOL both ways, lower case as the catalog seeds it", () => {
    expect(toText(true, "BOOL")).toBe("true");
    expect(toText(false, "BOOL")).toBe("false");
    expect(toText("t", "BOOL")).toBe("true");
    expect(toText("no", "BOOL")).toBe("false");
  });

  it("INT rounds", () => {
    expect(toText(3, "INT")).toBe("3");
    expect(toText("3.7", "INT")).toBe("4");
    expect(toText(-2.5, "INT")).toBe("-2");
  });

  it("DECIMAL never leaves in exponent form and trims trailing zeros", () => {
    expect(toText(1.5, "DECIMAL")).toBe("1.5");
    expect(toText(2, "DECIMAL")).toBe("2");
    expect(toText("1e-5", "DECIMAL")).toBe("0.00001");
    expect(toText(1e21, "DECIMAL")).toBe("1000000000000000000000");
    expect(toText(-0, "DECIMAL")).toBe("0");
    expect(toText(1.5, "DECIMAL")).not.toMatch(/e/i);
  });

  it("TEXT, UUID and DATE pass through trimmed", () => {
    expect(toText("  warning ", "TEXT")).toBe("warning");
    expect(toText(COMPANY, "UUID")).toBe(COMPANY);
    expect(toText("2026-08-25", "DATE")).toBe("2026-08-25");
  });

  it("null and undefined become the empty string", () => {
    expect(toText(null, "TEXT")).toBe("");
    expect(toText(undefined, "INT")).toBe("");
  });

  it("hands an uncastable number back as typed, so the server error names it", () => {
    expect(toText("abc", "INT")).toBe("abc");
  });
});

describe("parseBool", () => {
  it("takes the whole Postgres vocabulary", () => {
    for (const yes of ["true", "T", "yes", "y", "on", "1"]) {
      expect(parseBool(yes)).toBe(true);
    }
    for (const no of ["false", "f", "no", "off", "0", "", null, undefined, "banana"]) {
      expect(parseBool(no)).toBe(false);
    }
  });
});

describe("validateText — the same three checks the catalog imposes", () => {
  it("refuses a blank rather than blanking the setting by accident", () => {
    expect(validateText("  ", setting())).toBe("Enter a value, or reset the setting to inherit it.");
  });

  it("refuses an uncastable value", () => {
    expect(validateText("nine", setting())).toBe("Not a valid INT value.");
  });

  it("refuses a value outside the allowed list", () => {
    const row = setting({
      asdDataType: "TEXT",
      asdAllowedValues: ["restrict", "warning", "allow"],
      asdMinValue: null,
      asdMaxValue: null,
    });
    expect(validateText("maybe", row)).toBe("Must be one of: restrict, warning, allow.");
    expect(validateText("warning", row)).toBeNull();
  });

  it("refuses a value outside the range, and only for the numeric types", () => {
    expect(validateText("0", setting())).toBe("Must be 1 or more.");
    expect(validateText("11", setting())).toBe("Must be 10 or less.");
    expect(validateText("5", setting())).toBeNull();
  });
});

describe("isSameValue — a row retyped into its own value is not dirty", () => {
  it("compares by meaning for the typed columns", () => {
    expect(isSameValue("1.50", "1.5", "DECIMAL")).toBe(true);
    expect(isSameValue("t", "true", "BOOL")).toBe(true);
    expect(isSameValue("1", "2", "INT")).toBe(false);
    expect(isSameValue(null, "", "TEXT")).toBe(true);
    expect(isSameValue(null, "x", "TEXT")).toBe(false);
  });
});

describe("buildOverride — the three ways to get the write wrong", () => {
  it("a new override omits asvId entirely, so the server upserts on the target", () => {
    const entry = buildOverride(setting(), "COMPANY", target(), "3");
    expect("asvId" in entry).toBe(false);
    expect(entry).toEqual({
      asvSettingKey: "sales.default_price_level",
      asvScope: "COMPANY",
      asvCompanyId: COMPANY,
      asvBranchId: null,
      asvDeviceId: null,
      asvUserId: null,
      asvValue: "3",
    });
  });

  it("an override at THIS scope is updated in place by its id", () => {
    const row = setting({ source: "OVERRIDE", override: override("BRANCH", "asv-branch") });
    const entry = buildOverride(row, "BRANCH", target({ branchId: BRANCH }), "4");
    expect(entry.asvId).toBe("asv-branch");
  });

  it("an override at a BROADER scope is not this scope's row — editing creates one", () => {
    const row = setting({ source: "OVERRIDE", override: override("COMPANY") });
    const entry = buildOverride(row, "BRANCH", target({ branchId: BRANCH }), "4");
    expect("asvId" in entry).toBe(false);
    expect(entry.asvBranchId).toBe(BRANCH);
    expect(entry.asvCompanyId).toBeNull();
  });

  it("carries exactly one scope id — the one its scope names", () => {
    const full = target({ branchId: BRANCH, deviceId: DEVICE });
    const ids = (scope: "COMPANY" | "BRANCH" | "DEVICE") => {
      const entry = buildOverride(setting({ asdMaxScope: "DEVICE" }), scope, full, "1");
      return [entry.asvCompanyId, entry.asvBranchId, entry.asvDeviceId, entry.asvUserId];
    };
    expect(ids("COMPANY")).toEqual([COMPANY, null, null, null]);
    expect(ids("BRANCH")).toEqual([null, BRANCH, null, null]);
    expect(ids("DEVICE")).toEqual([null, null, DEVICE, null]);
  });

  it("never writes a USER override from this screen", () => {
    expect(buildOverride(setting(), "DEVICE", target({ branchId: BRANCH, deviceId: DEVICE }), "1").asvUserId).toBeNull();
  });
});

describe("isSessionScope — saved values only take hold in the session's own context", () => {
  const session = { companyId: COMPANY, branchId: BRANCH, deviceId: DEVICE, userId: "user-1" };

  it("accepts the session's own company with all branches and all counters", () => {
    expect(isSessionScope(target(), session)).toBe(true);
  });

  it("accepts the session's own branch and counter", () => {
    expect(isSessionScope(target({ branchId: BRANCH }), session)).toBe(true);
    expect(isSessionScope(target({ branchId: BRANCH, deviceId: DEVICE }), session)).toBe(true);
  });

  it("refuses another company — an administrator editing one must not adopt its settings", () => {
    expect(isSessionScope(target({ companyId: "other" }), session)).toBe(false);
  });

  it("refuses another branch or another counter", () => {
    expect(isSessionScope(target({ branchId: "other" }), session)).toBe(false);
    expect(isSessionScope(target({ branchId: BRANCH, deviceId: "other" }), session)).toBe(false);
  });

  it("refuses when the session has no company of its own to compare", () => {
    expect(isSessionScope(target(), { ...session, companyId: null })).toBe(false);
  });

  it("re-reads every layer down to the person", () => {
    expect(sessionQuery(session)).toEqual({
      companyId: COMPANY,
      branchId: BRANCH,
      deviceId: DEVICE,
      userId: "user-1",
    });
  });
});
