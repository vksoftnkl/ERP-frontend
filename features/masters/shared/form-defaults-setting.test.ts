import { describe, expect, it } from "vitest";
import {
  buildScopedOverride,
  buildSessionScopeOverride,
  CUSTOMER_FORM_DEFAULTS_SETTING_KEY,
  findEffectiveSettingValue,
  findSessionBranchOverride,
  parseSettingObject,
} from "./form-defaults-setting";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";

const COMPANY = "019c8ea6-19e9-78a8-b15f-749e1cde7292";
const BRANCH = "019c8ea7-b0f5-72d5-96a5-1abfc80cc8ab";
const SESSION = { companyId: COMPANY, branchId: BRANCH, deviceId: "dev-1", userId: "user-1" };

describe("buildScopedOverride", () => {
  // ck_asv_scope_ids takes the id its scope names and NOTHING else, so the
  // null/non-null pair is the whole of the write contract.
  it("sends the company id alone for All Branches", () => {
    expect(
      buildScopedOverride(CUSTOMER_FORM_DEFAULTS_SETTING_KEY, "{}", "COMPANY", SESSION),
    ).toEqual({
      asvSettingKey: "masters.customer_form_defaults",
      asvScope: "COMPANY",
      asvCompanyId: COMPANY,
      asvBranchId: null,
      asvDeviceId: null,
      asvUserId: null,
      asvValue: "{}",
    });
  });

  it("sends the branch id alone for This Branch Only", () => {
    expect(
      buildScopedOverride(CUSTOMER_FORM_DEFAULTS_SETTING_KEY, "{}", "BRANCH", SESSION),
    ).toEqual({
      asvSettingKey: "masters.customer_form_defaults",
      asvScope: "BRANCH",
      asvCompanyId: null,
      asvBranchId: BRANCH,
      asvDeviceId: null,
      asvUserId: null,
      asvValue: "{}",
    });
  });

  // /create upserts on (setting, scope target). A client-minted uuid is an id
  // the server cannot find, and neither writer reads the override list, so
  // neither could supply a real one. If this ever has to change, it changes
  // here first.
  it("never sends an asvId, at either scope", () => {
    for (const scope of ["COMPANY", "BRANCH"] as const) {
      expect(
        buildScopedOverride(CUSTOMER_FORM_DEFAULTS_SETTING_KEY, "{}", scope, SESSION),
      ).not.toHaveProperty("asvId");
    }
  });

  it("keeps the value a string — asv_value is a text column", () => {
    const json = JSON.stringify({ cusCreditDays: 35 });
    expect(
      buildScopedOverride(CUSTOMER_FORM_DEFAULTS_SETTING_KEY, json, "BRANCH", SESSION).asvValue,
    ).toBe(json);
  });
});

describe("buildSessionScopeOverride", () => {
  it("writes at the deepest layer the session names", () => {
    expect(buildSessionScopeOverride("k", "v", SESSION).asvScope).toBe("BRANCH");
    expect(
      buildSessionScopeOverride("k", "v", { ...SESSION, branchId: null }).asvScope,
    ).toBe("COMPANY");
    expect(
      buildSessionScopeOverride("k", "v", { ...SESSION, branchId: null, companyId: null }),
    ).toMatchObject({ asvScope: "GLOBAL", asvCompanyId: null, asvBranchId: null });
  });
});

describe("findEffectiveSettingValue", () => {
  const rows = [
    { asdKey: "masters.customer_form_defaults", value: '{"cusCity":"MUSIRI"}' },
    { asdKey: "masters.item_form_defaults", value: "   " },
  ] as EffectiveSetting[];

  it("reads one setting's raw text and treats blank as unset", () => {
    expect(findEffectiveSettingValue(rows, "masters.customer_form_defaults")).toBe(
      '{"cusCity":"MUSIRI"}',
    );
    expect(findEffectiveSettingValue(rows, "masters.item_form_defaults")).toBeNull();
    expect(findEffectiveSettingValue(rows, "nothing.here")).toBeNull();
    expect(findEffectiveSettingValue(undefined, "masters.customer_form_defaults")).toBeNull();
  });
});

describe("parseSettingObject", () => {
  it("returns the object, or null for anything that is not one", () => {
    expect(parseSettingObject('{"a":1}')).toEqual({ a: 1 });
    expect(parseSettingObject("[1,2]")).toBeNull();
    expect(parseSettingObject("not json")).toBeNull();
    expect(parseSettingObject("")).toBeNull();
    expect(parseSettingObject(null)).toBeNull();
  });
});

describe("findSessionBranchOverride", () => {
  const KEY = CUSTOMER_FORM_DEFAULTS_SETTING_KEY;
  const row = (override: Partial<EffectiveSetting["override"]> | null) =>
    [{ asdKey: KEY, value: "{}", override }] as unknown as EffectiveSetting[];

  // The whole point: a COMPANY save made from here would be written and then
  // never read, because this row keeps winning /effective.
  it("finds this branch's own override", () => {
    expect(
      findSessionBranchOverride(
        row({ asvId: "ovr-1", asvScope: "BRANCH", asvBranchId: BRANCH }),
        KEY,
        SESSION,
      )?.asvId,
    ).toBe("ovr-1");
  });

  it("ignores an override that cannot shadow a company save", () => {
    // Already the company row — nothing to warn about.
    expect(
      findSessionBranchOverride(
        row({ asvId: "ovr-2", asvScope: "COMPANY", asvBranchId: null }),
        KEY,
        SESSION,
      ),
    ).toBeNull();
    // Catalog default, no override at all.
    expect(findSessionBranchOverride(row(null), KEY, SESSION)).toBeNull();
    // A branch row left in a stale cache entry from a branch just switched away
    // from is not this session's.
    expect(
      findSessionBranchOverride(
        row({ asvId: "ovr-3", asvScope: "BRANCH", asvBranchId: "another-branch" }),
        KEY,
        SESSION,
      ),
    ).toBeNull();
    // A session with no branch cannot be shadowed by one.
    expect(
      findSessionBranchOverride(
        row({ asvId: "ovr-4", asvScope: "BRANCH", asvBranchId: BRANCH }),
        KEY,
        { ...SESSION, branchId: null },
      ),
    ).toBeNull();
    expect(findSessionBranchOverride(undefined, KEY, SESSION)).toBeNull();
    expect(findSessionBranchOverride(row({ asvScope: "BRANCH", asvBranchId: BRANCH }), "other.key", SESSION)).toBeNull();
  });
});
