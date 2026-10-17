import { describe, expect, it } from "vitest";
import { liveUserPayload } from "./fixtures";
import {
  EMPTY_IDENTITY,
  factsFromPayload,
  identityFromPayload,
  SUPER_ADMIN_LOCK_NOTE,
  superAdminLock,
  userRoleOptions,
  userTypeLabel,
  validateIdentity,
} from "./identity";
import { USER_TYPE_VALUES } from "./wire";

const base = { ...EMPTY_IDENTITY, loginName: "zt", password: "pw" };

describe("validateIdentity — till PIN", () => {
  it("accepts a blank PIN (keep) and 4 to 6 digits", () => {
    expect(validateIdentity(base, "create").pin).toBeUndefined();
    expect(validateIdentity({ ...base, pin: "1234" }, "create").pin).toBeUndefined();
    expect(validateIdentity({ ...base, pin: "123456" }, "create").pin).toBeUndefined();
  });

  it("refuses a short, long or non-digit PIN", () => {
    for (const pin of ["123", "1234567", "12a4"]) {
      expect(validateIdentity({ ...base, pin }, "create").pin).toBe("The till PIN is 4 to 6 digits.");
    }
  });

  it("refuses a new PIN and Clear together", () => {
    expect(validateIdentity({ ...base, pin: "1234", clearPin: true }, "edit").pin).toBe(
      "Either type a new till PIN or clear it, not both.",
    );
    expect(validateIdentity({ ...base, clearPin: true }, "edit").pin).toBeUndefined();
  });
});

describe("identity from the payload", () => {
  it("starts the PIN box empty and reads only whether one is set", () => {
    const payload = { ...liveUserPayload(), usrPinSet: true, usrEmployeeId: "e1", usrEmployeeName: "Ravi" };
    const identity = identityFromPayload(payload);
    expect(identity.pin).toBe("");
    expect(identity.clearPin).toBe(false);
    expect(identity.employeeId).toBe("e1");
    expect(identity.employeeName).toBe("Ravi");
    expect(factsFromPayload(payload).pinSet).toBe(true);
    expect(factsFromPayload({ ...payload, usrPinSet: undefined }).pinSet).toBe(false);
  });
});

describe("userRoleOptions (Qt 425fa80, notes 125)", () => {
  const values = (options: { value: string }[]) => options.map((option) => option.value);
  const OFFERED = [
    "CASHIER",
    "USER",
    "SUPERVISOR",
    "STORE MANAGER",
    "CASH OFFICE",
    "AREA MANAGER",
    "HO FINANCE",
    "ADMIN",
  ];

  it("offers the till approval levels then ADMIN, and never SUPER ADMIN to anyone else", () => {
    expect(values(userRoleOptions("ADMIN", ""))).toEqual(OFFERED);
    expect(values(userRoleOptions(null, "USER"))).toEqual(OFFERED);
  });

  it("adds SUPER ADMIN last for a signed-in SUPER ADMIN", () => {
    expect(values(userRoleOptions("SUPER ADMIN", ""))).toEqual([...OFFERED, "SUPER ADMIN"]);
    expect(values(userRoleOptions(" super admin ", ""))).toEqual([...OFFERED, "SUPER ADMIN"]);
  });

  it("keeps a stored role the list no longer offers, once", () => {
    expect(values(userRoleOptions("ADMIN", "VIEWER"))).toEqual([...OFFERED, "VIEWER"]);
    expect(values(userRoleOptions("ADMIN", "MANAGER"))).toEqual([...OFFERED, "MANAGER"]);
    expect(values(userRoleOptions("ADMIN", "SUPER ADMIN"))).toEqual([...OFFERED, "SUPER ADMIN"]);
    expect(values(userRoleOptions("SUPER ADMIN", "SUPER ADMIN"))).toEqual([...OFFERED, "SUPER ADMIN"]);
  });

  it("names every role the DTO accepts, and an unknown one as itself", () => {
    for (const value of USER_TYPE_VALUES) {
      expect(userTypeLabel(value)).not.toBe(value);
    }
    expect(userRoleOptions("ADMIN", "MANAGER").at(-1)).toEqual({ value: "MANAGER", label: "MANAGER" });
    expect(userRoleOptions("ADMIN", "").find((option) => option.value === "HO FINANCE")?.label).toBe(
      "HO Finance",
    );
  });

  it("offers only roles the DTO accepts", () => {
    for (const value of values(userRoleOptions("SUPER ADMIN", ""))) {
      expect(USER_TYPE_VALUES as readonly string[]).toContain(value);
    }
  });
});

describe("superAdminLock", () => {
  it("locks a SUPER ADMIN user for everyone but a SUPER ADMIN", () => {
    expect(superAdminLock("SUPER ADMIN", "ADMIN")).toBe(SUPER_ADMIN_LOCK_NOTE);
    expect(superAdminLock("SUPER ADMIN", null)).toBe(SUPER_ADMIN_LOCK_NOTE);
    expect(superAdminLock("SUPER ADMIN", "SUPER ADMIN")).toBeNull();
    expect(superAdminLock("ADMIN", "ADMIN")).toBeNull();
    expect(superAdminLock(null, "CASHIER")).toBeNull();
  });
});

describe("a stored role on load", () => {
  it("is kept as it came, even one the client does not know", () => {
    expect(identityFromPayload({ ...liveUserPayload(), usrType: "VIEWER" }).userType).toBe("VIEWER");
    expect(identityFromPayload({ ...liveUserPayload(), usrType: "MANAGER" }).userType).toBe("MANAGER");
    expect(identityFromPayload({ ...liveUserPayload(), usrType: null }).userType).toBe("");
  });
});
