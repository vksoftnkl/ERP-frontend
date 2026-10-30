import { describe, expect, it } from "vitest";
import { PURCHASE_TYPE_OPTIONS, SUPPLIER_INITIAL_FORM_VALUES } from "./constants";
import {
  buildSupplierPurchasePayload,
  buildSupplierRequestPayload,
  validateSupplierAgreedDays,
  validateSupplierGstin,
  validateSupplierOverseasState,
} from "./form-builder";
import {
  buildSupplierLookupValues,
  formatCollectionDays,
  toGstTypeValue,
  toSupplierPurchaseValues,
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
  it("starts on LOCAL and REGULAR", () => {
    expect(SUPPLIER_INITIAL_FORM_VALUES.supPurchaseType).toBe("LOCAL");
    expect(SUPPLIER_INITIAL_FORM_VALUES.supGstType).toBe("REGULAR");
    expect(PURCHASE_TYPE_OPTIONS.map((option) => option.value)).toEqual(["LOCAL", "IMPORT"]);
  });
});

describe("toGstTypeValue", () => {
  it("loads any old spelling onto the five codes (party rules D2)", () => {
    expect(toGstTypeValue("Regular")).toBe("REGULAR");
    expect(toGstTypeValue("composition")).toBe("COMPOSITION");
    expect(toGstTypeValue("Unregistered")).toBe("UNREGISTERED");
    expect(toGstTypeValue("SEZ Unit")).toBe("SEZ");
    expect(toGstTypeValue("Overseas")).toBe("OVERSEAS");
    expect(toGstTypeValue("Goods")).toBe("");
  });
});

describe("validateSupplierGstin", () => {
  it("requires a GSTIN for REGULAR / COMPOSITION / SEZ only", () => {
    for (const gstType of ["REGULAR", "COMPOSITION", "SEZ"]) {
      expect(validateSupplierGstin("", values({ supGstType: gstType }), STATE_CODES)).toMatch(
        /must have a GST No/,
      );
    }
    for (const gstType of ["UNREGISTERED", "OVERSEAS"]) {
      expect(validateSupplierGstin("", values({ supGstType: gstType }), STATE_CODES)).toBeNull();
    }
  });

  it("refuses a GSTIN on an Unregistered or Overseas supplier", () => {
    expect(
      validateSupplierGstin(GSTIN_33, values({ supGstType: "UNREGISTERED", supStateName: "Tamil Nadu" }), STATE_CODES),
    ).toMatch(/has no GST No/);
    expect(
      validateSupplierGstin(GSTIN_33, values({ supGstType: "OVERSEAS" }), STATE_CODES),
    ).toMatch(/An Overseas supplier has no GST No/);
  });

  it("refuses a normal GSTIN whose checksum does not hold", () => {
    expect(
      validateSupplierGstin("33ABNPL5414F1ZA", values({ supStateName: "Tamil Nadu" }), STATE_CODES),
    ).toMatch(/does not match/i);
  });

  it("refuses a GSTIN issued in another state than the one picked", () => {
    expect(
      validateSupplierGstin(GSTIN_33, values({ supStateName: "Kerala" }), STATE_CODES),
    ).toMatch(/from state 33, but the state is 32/);
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
    ).toMatch(/from state 33, but the state is 29/);
  });
});

describe("validateSupplierOverseasState", () => {
  const CODES = { ...STATE_CODES, "Other Country": "96" };
  it("needs state 96 Other Country for an Overseas supplier", () => {
    expect(
      validateSupplierOverseasState(values({ supGstType: "OVERSEAS", supGstNo: "", supStateName: "Kerala" }), CODES),
    ).toMatch(/Other Country/);
    expect(
      validateSupplierOverseasState(
        values({ supGstType: "OVERSEAS", supGstNo: "", supStateName: "Other Country" }),
        CODES,
      ),
    ).toBeNull();
    expect(
      validateSupplierOverseasState(values({ supGstType: "REGULAR", supStateName: "Kerala" }), CODES),
    ).toBeNull();
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
  it("saves the GST type as its code, caps Credit Days at 999, sends no supBilledDate", () => {
    const payload = buildSupplierRequestPayload(
      values({ supGstType: "Regular", supCreditDays: "1500", supStateName: "Tamil Nadu" }) as SupplierFormValues,
      STATE_CODES,
      false,
      null,
    );
    expect(payload.supGstType).toBe("REGULAR");
    expect(payload).not.toHaveProperty("supBilledDate");
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
  it("writes the lookup's registration type as its code, SEZ included", () => {
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
    ).toBe("REGULAR");
    expect(
      buildSupplierLookupValues({ ...base, gstRegType: "SEZ" }, { "33": "Tamil Nadu" }).supGstType,
    ).toBe("SEZ");
    expect(
      buildSupplierLookupValues({ ...base, gstRegType: "SEZ" }, { "33": "Tamil Nadu" })
        .supStateName,
    ).toBe("Tamil Nadu");
  });
});

describe("supplier Purchase tab (MST-01)", () => {
  it("reads /suppliers/get and sends every key back, blanks as null", () => {
    const values = toSupplierPurchaseValues({
      supMsmeCategory: "micro",
      supMsmeActivity: "WHOLESALE",
      supMsmeAgreement: true,
      supMsmeAgreedDays: 30,
      supDrugLicenceExpiry: "2027-03-31",
      supFssaiNo: null,
      supFssaiValidTo: null,
      supDefaultGodownId: "g1",
      supShowNotesOnEntry: true,
      supIsImport: false,
    });
    expect(values).toMatchObject({
      supMsmeCategory: "MICRO",
      supMsmeActivity: "",
      supMsmeAgreement: "true",
      supMsmeAgreedDays: "30",
      supDrugLicenceExpiry: "2027-03-31",
      supFssaiValidTo: "",
      supDefaultGodownId: "g1",
      supShowNotesOnEntry: "true",
      supIsImport: "false",
    });
    expect(buildSupplierPurchasePayload(values)).toEqual({
      supMsmeCategory: "MICRO",
      supMsmeActivity: null,
      supMsmeAgreement: true,
      supMsmeAgreedDays: 30,
      supDrugLicenceExpiry: "2027-03-31",
      supFssaiNo: null,
      supFssaiValidTo: null,
      supDefaultGodownId: "g1",
      supShowNotesOnEntry: true,
      supIsImport: false,
    });
  });

  it("keeps agreed days within 0–45", () => {
    expect(validateSupplierAgreedDays("")).toBeNull();
    expect(validateSupplierAgreedDays("45")).toBeNull();
    expect(validateSupplierAgreedDays("46")).toMatch(/0 to 45/);
    expect(buildSupplierPurchasePayload({ supMsmeAgreedDays: "" }).supMsmeAgreedDays).toBeNull();
  });
});
