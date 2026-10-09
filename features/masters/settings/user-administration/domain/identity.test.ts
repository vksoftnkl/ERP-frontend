import { describe, expect, it } from "vitest";
import { liveUserPayload } from "./fixtures";
import {
  EMPTY_IDENTITY,
  factsFromPayload,
  identityFromPayload,
  USER_TYPE_OPTIONS,
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

describe("USER_TYPE_OPTIONS", () => {
  it("offers every role the DTO accepts, cashier first and supervisor among them", () => {
    const values = USER_TYPE_OPTIONS.map((option) => option.value);
    expect([...values].sort()).toEqual([...USER_TYPE_VALUES].sort());
    expect(values[0]).toBe("CASHIER");
    expect(values).toContain("SUPERVISOR");
  });
});
