import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRANCH_OPTION,
  DEFAULT_TENDER_TYPE_OPTION,
  TENDER_INITIAL_FORM_VALUES,
  buildLookupOptions,
  buildTenderFormFields,
  buildTenderRequestPayload,
  mapTenderFormValues,
  toNullableBoolean,
  toTriStateSelect,
} from "./tender";

const TYPES = [
  { value: "", label: "Select Tender Type" },
  { value: "1", label: "Cash" },
  { value: "2", label: "Google UPI" },
];
const LEDGERS = [
  { value: "", label: "Select Account Ledger" },
  { value: "10", label: "Cash Ledger" },
];

function fields() {
  return buildTenderFormFields(TYPES, LEDGERS, [], [], []);
}
function field(name: string) {
  const found = fields().find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`no field ${name}`);
  }
  return found;
}
function customOf(name: string) {
  const custom = field(name).validation?.custom;
  if (!custom) {
    throw new Error(`no custom validation on ${name}`);
  }
  return (value: string, values: Record<string, string>) => custom(value, values, field(name));
}

describe("tri-state select values", () => {
  it("keeps blank, null and undefined as blank (inherit from the tender type)", () => {
    expect(toTriStateSelect(null)).toBe("");
    expect(toTriStateSelect(undefined)).toBe("");
    expect(toTriStateSelect("")).toBe("");
  });

  it("turns real booleans, numbers and words into true or false", () => {
    expect(toTriStateSelect(true)).toBe("true");
    expect(toTriStateSelect(false)).toBe("false");
    expect(toTriStateSelect("1")).toBe("true");
    expect(toTriStateSelect("No")).toBe("false");
    expect(toTriStateSelect(0)).toBe("false");
  });

  it("treats unrecognised values as false rather than inherit", () => {
    expect(toTriStateSelect("maybe")).toBe("false");
  });

  it("maps the form string back to true, false or null", () => {
    expect(toNullableBoolean("")).toBeNull();
    expect(toNullableBoolean("   ")).toBeNull();
    expect(toNullableBoolean("true")).toBe(true);
    expect(toNullableBoolean(" true ")).toBe(true);
    expect(toNullableBoolean("false")).toBe(false);
  });
});

describe("lookup options", () => {
  it("puts the placeholder first and sorts the rest by label", () => {
    const options = buildLookupOptions(
      { data: [{ id: 2, name: "Zeta" }, { id: 1, name: "Alpha" }] },
      DEFAULT_TENDER_TYPE_OPTION,
    );
    expect(options).toEqual([
      DEFAULT_TENDER_TYPE_OPTION,
      { value: "1", label: "Alpha" },
      { value: "2", label: "Zeta" },
    ]);
  });

  it("reads value/label keys, finds a bare array and keeps the first of a duplicate id", () => {
    const options = buildLookupOptions(
      [
        { value: "7", label: "Seven" },
        { id: "7", name: "Again" },
      ],
      DEFAULT_BRANCH_OPTION,
    );
    expect(options).toEqual([DEFAULT_BRANCH_OPTION, { value: "7", label: "Seven" }]);
  });

  it("skips rows without an id or a name and rows that are not objects", () => {
    const options = buildLookupOptions(
      { items: [{ id: 1 }, { name: "No id" }, { id: 0, name: "" }, null, "x", [1], { id: 5, name: "Ok" }] },
      DEFAULT_BRANCH_OPTION,
    );
    expect(options).toEqual([DEFAULT_BRANCH_OPTION, { value: "5", label: "Ok" }]);
  });

  it("returns just the placeholder for payloads with no rows", () => {
    expect(buildLookupOptions(null, DEFAULT_BRANCH_OPTION)).toEqual([DEFAULT_BRANCH_OPTION]);
    expect(buildLookupOptions({ data: [] }, DEFAULT_BRANCH_OPTION)).toEqual([DEFAULT_BRANCH_OPTION]);
  });
});

describe("tender form fields", () => {
  it("has unique field names", () => {
    const names = fields().map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has a field for every form value the screen keeps", () => {
    const names = new Set(fields().map((entry) => entry.name));
    for (const key of Object.keys(TENDER_INITIAL_FORM_VALUES)) {
      expect(names.has(key)).toBe(true);
    }
  });

  it("keeps the columns the legacy dialog does not show in the form but never renders them", () => {
    for (const name of [
      "tndSettlementLedgerId",
      "tndSettlementDays",
      "tndBankAccountId",
      "tndHotkey",
      "tndColour",
      "tndEffectiveFrom",
      "tndEffectiveTo",
    ]) {
      expect(field(name).visibleWhen?.({})).toBe(false);
    }
    expect(field("tndShortName").visibleWhen).toBeUndefined();
  });

  it("offers None instead of the placeholder on the optional surcharge ledger", () => {
    const options = field("tndSurchargeLedgerId").options;
    expect(options).toEqual([
      { value: "", label: "None" },
      { value: "10", label: "Cash Ledger" },
    ]);
    expect(field("tndLedgerId").options).toBe(LEDGERS);
  });

  it("enables the payment block only for a tender type whose label says UPI", () => {
    const vpa = field("tndUpiVpa");
    expect(vpa.disabledWhen?.({ tndTypeId: "2" })).toBe(false);
    expect(vpa.disabledWhen?.({ tndTypeId: " 2 " })).toBe(false);
    expect(vpa.disabledWhen?.({ tndTypeId: "1" })).toBe(true);
    expect(vpa.disabledWhen?.({ tndTypeId: "" })).toBe(true);
    expect(vpa.disabledWhen?.({})).toBe(true);
    for (const name of ["tndMerchantId", "tndTerminalId", "tndUpiQrPayload"]) {
      expect(field(name).disabledWhen?.({ tndTypeId: "1" })).toBe(true);
    }
  });

  it("keeps the payment block disabled until the tender types have loaded", () => {
    const loading = buildTenderFormFields([{ value: "", label: "Select Tender Type" }], [], [], [], []);
    const vpa = loading.find((entry) => entry.name === "tndUpiVpa");
    expect(vpa?.disabledWhen?.({ tndTypeId: "2" })).toBe(true);
  });

  it("carries the required-field messages", () => {
    expect(field("tndCompanyId").validation?.requiredMessage).toBe("Company is required.");
    expect(field("tndTypeId").validation?.requiredMessage).toBe("Tender Type is required.");
    expect(field("tndLedgerId").validation?.requiredMessage).toBe("Posting Ledger is required.");
    expect(field("tndShortName").validation?.requiredMessage).toBe("Short Name is required.");
    expect(field("tndMinAmount").validation?.requiredMessage).toBe("Minimum Amount is required.");
  });
});

describe("maximum amount validation", () => {
  const check = customOf("tndMaxAmount");

  it("allows a blank maximum (no limit)", () => {
    expect(check("", { tndMinAmount: "10" })).toBeNull();
    expect(check("   ", { tndMinAmount: "10" })).toBeNull();
  });

  it("rejects text that is not a number", () => {
    expect(check("abc", {})).toBe("Maximum Amount must be a valid number.");
  });

  it("rejects a maximum below the minimum", () => {
    expect(check("5", { tndMinAmount: "10" })).toBe(
      "Maximum Amount must be greater than or equal to Minimum Amount.",
    );
  });

  it("accepts a maximum equal to or above the minimum", () => {
    expect(check("10", { tndMinAmount: "10" })).toBeNull();
    expect(check(" 10.5 ", { tndMinAmount: "10" })).toBeNull();
  });

  it("skips the comparison when the minimum is not a number", () => {
    expect(check("5", { tndMinAmount: "abc" })).toBeNull();
  });
});

describe("conversion rate validation", () => {
  const check = customOf("tndConversionRate");

  it("rejects non-numbers, zero and negatives with the exact message", () => {
    expect(check("x", {})).toBe("Conversion Rate must be a valid number.");
    expect(check("0", {})).toBe("Conversion Rate must be greater than 0.");
    expect(check("-1", {})).toBe("Conversion Rate must be greater than 0.");
  });

  it("accepts a positive rate", () => {
    expect(check("0.0001", {})).toBeNull();
    expect(check("83.5", {})).toBeNull();
  });
});

describe("tender row to form values", () => {
  it("falls back to the create defaults for an empty row", () => {
    expect(mapTenderFormValues({ source: null, defaults: {} })).toEqual(TENDER_INITIAL_FORM_VALUES);
  });

  it("maps a camelCase server row", () => {
    const values = mapTenderFormValues({
      source: {
        tndName: "HDFC Card",
        tndShortName: "HDFC",
        tndCompanyId: "c1",
        tndBranchId: "b1",
        tndTypeId: 3,
        tndLedgerId: "l1",
        tndSettlementLedgerId: "l2",
        tndSettlementDays: 2,
        tndBankAccountId: "ba",
        tndMinAmount: "100.00",
        tndMaxAmount: "5000",
        tndDailyLimit: 20000,
        tndSurchargePerc: "1.5",
        tndSurchargeAmount: 0,
        tndSurchargeLedgerId: "l3",
        tndEditSurcharge: true,
        tndEditLedger: false,
        tndUpiVpa: "shop@bank",
        tndUpiQrPayload: "upi://pay",
        tndMerchantId: "m1",
        tndTerminalId: "t1",
        tndConversionRate: "1.25",
        tndOpenCashDrawer: "true",
        tndIsDefault: true,
        tndDisplayPosition: 4,
        tndHotkey: "F2",
        tndColour: "#ff0000",
        tndEffectiveFrom: "2026-01-05T00:00:00.000Z",
        tndEffectiveTo: "2026-12-31",
        tndIsActive: false,
        tndRemarks: "note",
      },
      defaults: {},
    });
    expect(values).toEqual({
      masterName: "HDFC Card",
      tndCompanyId: "c1",
      tndBranchId: "b1",
      tndTypeId: "3",
      tndShortName: "HDFC",
      tndLedgerId: "l1",
      tndSettlementLedgerId: "l2",
      tndSettlementDays: "2",
      tndBankAccountId: "ba",
      tndMinAmount: "100.00",
      tndMaxAmount: "5000",
      tndDailyLimit: "20000",
      tndSurchargePerc: "1.5",
      tndSurchargeAmount: "0",
      tndSurchargeLedgerId: "l3",
      tndEditSurcharge: "true",
      tndEditLedger: "false",
      tndUpiVpa: "shop@bank",
      tndUpiQrPayload: "upi://pay",
      tndMerchantId: "m1",
      tndTerminalId: "t1",
      tndConversionRate: "1.25",
      tndNeedsRef: "",
      tndAllowChange: "",
      tndAllowInReturn: "",
      tndOpenCashDrawer: "true",
      tndIsDefault: "true",
      position: "4",
      tndHotkey: "F2",
      tndColour: "#ff0000",
      tndEffectiveFrom: "2026-01-05",
      tndEffectiveTo: "2026-12-31",
      tndIsActive: "false",
      masterDescription: "note",
    });
  });

  it("reads snake_case keys", () => {
    const values = mapTenderFormValues({
      source: { tnd_name: "Cash", tnd_type_id: "1", tnd_min_amount: "5", tnd_is_active: "0", tnd_remarks: "r" },
      defaults: {},
    });
    expect(values).toMatchObject({
      masterName: "Cash",
      tndTypeId: "1",
      tndMinAmount: "5",
      tndIsActive: "false",
      masterDescription: "r",
    });
  });

  it("keeps tri-state flags blank when null and pins them when set", () => {
    const blank = mapTenderFormValues({
      source: { tndNeedsRef: null, tndAllowChange: "", tndAllowInReturn: undefined },
      defaults: {},
    });
    expect([blank.tndNeedsRef, blank.tndAllowChange, blank.tndAllowInReturn]).toEqual(["", "", ""]);
    const pinned = mapTenderFormValues({
      source: { tndNeedsRef: true, tndAllowChange: false, tndAllowInReturn: "true" },
      defaults: {},
    });
    expect([pinned.tndNeedsRef, pinned.tndAllowChange, pinned.tndAllowInReturn]).toEqual([
      "true",
      "false",
      "true",
    ]);
  });

  it("keeps a stored zero rather than replacing it with the default", () => {
    const values = mapTenderFormValues({
      source: { tndConversionRate: 0, tndSurchargePerc: 0, tndMinAmount: 0 },
      defaults: {},
    });
    expect(values.tndConversionRate).toBe("0");
    expect(values.tndSurchargePerc).toBe("0");
    expect(values.tndMinAmount).toBe("0");
  });

  it("treats null optional columns as blank and active as the default for a missing flag", () => {
    const values = mapTenderFormValues({
      source: { tndBranchId: null, tndMaxAmount: null, tndEffectiveFrom: null, tndIsActive: null },
      defaults: {},
    });
    expect(values.tndBranchId).toBe("");
    expect(values.tndMaxAmount).toBe("");
    expect(values.tndEffectiveFrom).toBe("");
    expect(values.tndIsActive).toBe("true");
  });

  it("uses the supplied defaults where the row has nothing", () => {
    const values = mapTenderFormValues({
      source: {},
      defaults: { tndCompanyId: "c9", masterName: "Draft", tndConversionRate: "2" },
    });
    expect(values.tndCompanyId).toBe("c9");
    expect(values.masterName).toBe("Draft");
    expect(values.tndConversionRate).toBe("2");
  });
});

describe("tender form to save payload", () => {
  const values = {
    ...TENDER_INITIAL_FORM_VALUES,
    masterName: "  HDFC Card ",
    tndShortName: " HDFC ",
    tndCompanyId: " c1 ",
    tndTypeId: "3",
    tndLedgerId: "l1",
    tndMinAmount: "100",
    tndMaxAmount: "5000.50",
    tndSurchargePerc: "2.5",
    tndEditSurcharge: "true",
    position: "7",
    masterDescription: "  note ",
  };

  it("trims text, converts numbers and flags, and nulls blank optional columns", () => {
    expect(buildTenderRequestPayload({ values, shouldUpdate: false, editingItemId: null })).toEqual({
      tndCompanyId: "c1",
      tndBranchId: null,
      tndTypeId: "3",
      tndName: "HDFC Card",
      tndShortName: "HDFC",
      tndLedgerId: "l1",
      tndSettlementLedgerId: null,
      tndSettlementDays: 0,
      tndBankAccountId: null,
      tndMinAmount: 100,
      tndMaxAmount: 5000.5,
      tndDailyLimit: null,
      tndSurchargePerc: 2.5,
      tndSurchargeAmount: 0,
      tndSurchargeLedgerId: null,
      tndEditSurcharge: true,
      tndEditLedger: false,
      tndUpiVpa: null,
      tndUpiQrPayload: null,
      tndMerchantId: null,
      tndTerminalId: null,
      tndConversionRate: 1,
      tndNeedsRef: null,
      tndAllowChange: null,
      tndAllowInReturn: null,
      tndOpenCashDrawer: false,
      tndIsDefault: false,
      tndDisplayPosition: 7,
      tndHotkey: null,
      tndColour: null,
      tndEffectiveFrom: null,
      tndEffectiveTo: null,
      tndIsActive: true,
      tndRemarks: "note",
    });
  });

  it("leaves the short name out when it is blank so the server derives it", () => {
    const payload = buildTenderRequestPayload({
      values: { ...values, tndShortName: "   " },
      shouldUpdate: false,
      editingItemId: null,
    });
    expect("tndShortName" in payload).toBe(false);
  });

  it("adds the tender id only on update", () => {
    expect(buildTenderRequestPayload({ values, shouldUpdate: true, editingItemId: 12 }).tndId).toBe("12");
    expect(buildTenderRequestPayload({ values, shouldUpdate: true, editingItemId: " ab " }).tndId).toBe("ab");
    expect("tndId" in buildTenderRequestPayload({ values, shouldUpdate: true, editingItemId: null })).toBe(false);
    expect("tndId" in buildTenderRequestPayload({ values, shouldUpdate: false, editingItemId: 12 })).toBe(false);
  });

  it("sends a chosen branch and pins tri-state flags to true or false", () => {
    const payload = buildTenderRequestPayload({
      values: { ...values, tndBranchId: "b2", tndNeedsRef: "true", tndAllowChange: "false", tndAllowInReturn: "" },
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.tndBranchId).toBe("b2");
    expect(payload.tndNeedsRef).toBe(true);
    expect(payload.tndAllowChange).toBe(false);
    expect(payload.tndAllowInReturn).toBeNull();
  });

  it("falls back to safe numbers for bad input", () => {
    const payload = buildTenderRequestPayload({
      values: {
        ...values,
        tndMinAmount: "-5",
        tndMaxAmount: "abc",
        tndSettlementDays: "1.9",
        tndSurchargePerc: "x",
        position: "-1",
      },
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload).toMatchObject({
      tndMinAmount: 0,
      tndMaxAmount: null,
      tndSettlementDays: 1,
      tndSurchargePerc: 0,
      tndDisplayPosition: 0,
    });
  });

  it("sends dates as typed and inactive when the status is false", () => {
    const payload = buildTenderRequestPayload({
      values: { ...values, tndEffectiveFrom: " 2026-01-01 ", tndIsActive: "false" },
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.tndEffectiveFrom).toBe("2026-01-01");
    expect(payload.tndIsActive).toBe(false);
  });
});
