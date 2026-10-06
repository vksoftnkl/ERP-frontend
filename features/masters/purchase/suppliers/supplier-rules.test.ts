import { describe, expect, it } from "vitest";
import { PURCHASE_TYPE_OPTIONS, SUPPLIER_INITIAL_FORM_VALUES } from "./constants";
import { buildSupplierRequestPayload, validateSupplierGstin } from "./form-builder";
import {
  buildSupplierLookupValues,
  formatCollectionDays,
  toGstTypeValue,
  withStoredPurchaseType,
} from "./transformers";
import type { SupplierFormValues } from "./types";

// A GSTIN that passes the mod-36 checksum, issued in state 33.
const GSTIN_33 = "33ABNPL5414F1ZU";
const STATE_CODES = { "Tamil Nadu": "33", Kerala: "32" };

const values = (overrides: Record<string, string>): Record<string, string> => ({
  ...SUPPLIER_INITIAL_FORM_VALUES,
  ...overrides,
});

describe("new supplier defaults (Qt Supplier Entry)", () => {
  it("starts on LOCAL and Regular", () => {
    expect(SUPPLIER_INITIAL_FORM_VALUES.supPurchaseType).toBe("LOCAL");
    expect(SUPPLIER_INITIAL_FORM_VALUES.supGstType).toBe("Regular");
    expect(PURCHASE_TYPE_OPTIONS.map((option) => option.value)).toEqual(["LOCAL", "IMPORT"]);
  });
});

describe("toGstTypeValue", () => {
  it("loads any casing onto the Qt words", () => {
    expect(toGstTypeValue("REGULAR")).toBe("Regular");
    expect(toGstTypeValue("composition")).toBe("Composition");
    expect(toGstTypeValue("Unregistered")).toBe("Unregistered");
    expect(toGstTypeValue("sez")).toBe("SEZ");
    expect(toGstTypeValue("OVERSEAS")).toBe("Overseas");
    expect(toGstTypeValue("Goods")).toBe("");
  });
});

describe("validateSupplierGstin", () => {
  it("requires a GSTIN for every type but Unregistered", () => {
    for (const gstType of ["Regular", "Composition", "SEZ", "Overseas"]) {
      expect(validateSupplierGstin("", values({ supGstType: gstType }), STATE_CODES)).toMatch(
        /required/i,
      );
    }
    expect(
      validateSupplierGstin("", values({ supGstType: "Unregistered" }), STATE_CODES),
    ).toBeNull();
  });

  it("refuses a GSTIN whose checksum does not hold", () => {
    expect(
      validateSupplierGstin("33ABNPL5414F1ZA", values({ supStateName: "Tamil Nadu" }), STATE_CODES),
    ).toMatch(/not valid/i);
  });

  it("refuses a GSTIN issued in another state than the one picked", () => {
    expect(
      validateSupplierGstin(GSTIN_33, values({ supStateName: "Kerala" }), STATE_CODES),
    ).toMatch(/state code 33.*32/);
    expect(
      validateSupplierGstin(GSTIN_33, values({ supStateName: "Tamil Nadu" }), STATE_CODES),
    ).toBeNull();
  });

  it("falls back to the record's own state code for a state not in the map", () => {
    expect(
      validateSupplierGstin(
        GSTIN_33,
        values({ supStateName: "Somewhere", supStateCode: "29" }),
        STATE_CODES,
      ),
    ).toMatch(/state code 33.*29/);
  });
});

describe("collection days", () => {
  it("count from 0 = Monday, as the Qt widget writes them", () => {
    expect(formatCollectionDays([0, 2])).toBe("Monday, Wednesday");
    expect(formatCollectionDays([6])).toBe("Sunday");
    expect(formatCollectionDays("{3,4,5}")).toBe("Thursday, Friday, Saturday");
    expect(formatCollectionDays([])).toBe("-");
    expect(formatCollectionDays(null)).toBe("-");
  });

  it("are sent as the checked indices", () => {
    const payload = buildSupplierRequestPayload(
      values({ supCollectionDays: "0,6", supStateName: "Tamil Nadu" }) as SupplierFormValues,
      STATE_CODES,
      false,
      null,
    );
    expect(payload.supCollectionDays).toEqual([0, 6]);
  });
});

describe("buildSupplierRequestPayload", () => {
  it("saves the GST type in the Qt words and caps Credit Days at 999", () => {
    const payload = buildSupplierRequestPayload(
      values({ supGstType: "REGULAR", supCreditDays: "1500", supStateName: "Tamil Nadu" }) as SupplierFormValues,
      STATE_CODES,
      false,
      null,
    );
    expect(payload.supGstType).toBe("Regular");
    expect(payload.supCreditDays).toBe(999);
    expect(payload.supStateCode).toBe("33");
    expect(payload).not.toHaveProperty("__editing");
  });
});

describe("withStoredPurchaseType", () => {
  it("keeps an older record's own value selectable", () => {
    expect(withStoredPurchaseType(PURCHASE_TYPE_OPTIONS, "Goods Supplier").map((o) => o.value)).toEqual([
      "LOCAL",
      "IMPORT",
      "Goods Supplier",
    ]);
    expect(withStoredPurchaseType(PURCHASE_TYPE_OPTIONS, "IMPORT")).toBe(PURCHASE_TYPE_OPTIONS);
    expect(withStoredPurchaseType(PURCHASE_TYPE_OPTIONS, "")).toBe(PURCHASE_TYPE_OPTIONS);
  });
});

describe("buildSupplierLookupValues", () => {
  it("writes the lookup's registration type in the Qt words, SEZ included", () => {
    const base = {
      gstin: GSTIN_33,
      legalName: "ACME FOODS PRIVATE LIMITED",
      tradeName: "ACME FOODS",
      status: "Active",
      registrationType: "Regular",
      stateCode: "33",
      panNo: "ABNPL5414F",
      registeredOn: null,
      address: null,
    };
    expect(
      buildSupplierLookupValues({ ...base, gstRegType: "REGULAR" }, { "33": "Tamil Nadu" })
        .supGstType,
    ).toBe("Regular");
    expect(
      buildSupplierLookupValues({ ...base, gstRegType: "SEZ" }, { "33": "Tamil Nadu" }).supGstType,
    ).toBe("SEZ");
    expect(
      buildSupplierLookupValues({ ...base, gstRegType: "SEZ" }, { "33": "Tamil Nadu" })
        .supStateName,
    ).toBe("Tamil Nadu");
  });
});
