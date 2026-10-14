import { describe, expect, it } from "vitest";
import { tillErrorText } from "./api-error";
import {
  amountInputText,
  bundleAfterKindChange,
  canEditRow,
  canSetDefault,
  canToggleRow,
  cellText,
  entryBody,
  entryFacts,
  entryHeading,
  entryModeOf,
  entryWarnings,
  firstField,
  gridParamsOf,
  initialForm,
  lockedFields,
  moneyText,
  nextSortOf,
  overInsured,
  paiseOf,
  problemOf,
  reasonBody,
  rowHint,
  rowMuted,
  scopeMissingText,
  setDefaultBody,
  toAmount,
  toggleBody,
  toggleRefusal,
  toggleWords,
  type CounterForm,
  type DenominationForm,
  type GridRow,
  type ReasonForm,
  type SafeForm,
} from "./till-masters";

const SCOPE = { companyId: "c1", branchId: "b1" };
const NEW = { nextSort: 10, firstSafe: false, category: "" };
const ALL = { canCreate: true, canEdit: true };
const EDIT_ONLY = { canCreate: false, canEdit: true };
const CREATE_ONLY = { canCreate: true, canEdit: false };

// Rows as the grid runner sends them: numerics as strings, ints and bools as themselves.
const COUNTER_ROW: GridRow = {
  tcn_id: "tcn-1",
  tcn_code: "ZT1",
  tcn_name: "Counter 1",
  tcn_kind: "EXPRESS",
  tcn_drawer_mode: "TRAY",
  tcn_device_id: null,
  device_name: "",
  tcn_safe_id: "tsf-1",
  safe_name: "S1 · Main safe",
  tcn_default_float: "2000.00",
  tcn_cash_alert_limit: "20000.00",
  tcn_cash_block_limit: "30000.50",
  tcn_z_last_no: 4,
  tcn_requires_session: true,
  tcn_sort_order: 10,
  tcn_remarks: "",
  tcn_is_active: true,
  live_session_no: "",
  live_operator: "",
  sessions_30d: "3",
  last_closed: "",
};

const SAFE_ROW: GridRow = {
  tsf_id: "tsf-1",
  tsf_code: "ZTS",
  tsf_name: "Main safe",
  tsf_ledger_id: "led-cash",
  ledger_name: "Cash In Safe",
  tsf_insured_limit: "50000.00",
  tsf_is_default: false,
  tsf_remarks: "",
  tsf_is_active: true,
  counter_codes: "C01 C02",
  counter_count: "2",
  balance: "51250.00",
  last_count: "",
  last_remit: "05-10-2026 · 10,000.00",
};

const SHIPPED_TEA: GridRow = {
  trs_id: "trs-tea",
  trs_company_id: "",
  trs_category: "EXPENSE",
  trs_code: "TEA",
  trs_name: "Tea & refreshments",
  trs_ledger_id: null,
  ledger_name: "",
  trs_needs_note: false,
  trs_needs_ref: false,
  trs_max_amount: "0.00",
  trs_sort_order: 10,
  trs_is_active: true,
  shipped: true,
  overridden: false,
  used_30d: "2",
  used_amount_30d: "120.00",
};

const SHIPPED_COIN: GridRow = {
  tdn_id: "d5",
  tdn_company_id: "",
  tdn_currency: "INR",
  tdn_value: "5.00",
  tdn_kind: "COIN",
  tdn_label: "₹5",
  tdn_bundle_qty: 0,
  tdn_sort_order: 80,
  tdn_valid_to: "",
  tdn_is_active: true,
  shipped: true,
  overridden: false,
  used: true,
};

describe("money in paise", () => {
  it("parses the runner's strings without floats", () => {
    expect(paiseOf("1,250.555")).toBe(125056);
    expect(paiseOf("500.00")).toBe(50000);
    expect(paiseOf("")).toBe(0);
    expect(paiseOf("abc")).toBe(0);
    expect(paiseOf("-4.5")).toBe(-450);
    expect(paiseOf(12.3)).toBe(1230);
    expect(paiseOf(null)).toBe(0);
  });

  it("shows amounts Indian-style with two places", () => {
    expect(moneyText("176300")).toBe("1,76,300.00");
    expect(moneyText("0")).toBe("0.00");
    expect(moneyText("51250.5")).toBe("51,250.50");
  });

  it("posts amounts as non-negative numbers; blank is 0", () => {
    expect(toAmount("1,250.555")).toBe(1250.56);
    expect(toAmount("")).toBe(0);
    expect(toAmount("-4")).toBe(0);
  });

  it("an input holds 2000.00 as 2000 and 2000.50 as itself", () => {
    expect(amountInputText("2000.00")).toBe("2000");
    expect(amountInputText("2000.50")).toBe("2000.50");
  });
});

describe("the lists", () => {
  it("always sends every quoted token; counters and safes need a branch", () => {
    expect(gridParamsOf("counters", { companyId: "c1", branchId: "b1", showInactive: false, category: "" })).toEqual({
      icompany_id: "c1",
      ibranch_id: "b1",
      iinactive: "false",
    });
    expect(gridParamsOf("safes", { companyId: "c1", branchId: "", showInactive: true, category: "" })).toBeNull();
    expect(gridParamsOf("denominations", { companyId: "c1", branchId: "", showInactive: true, category: "" })).toEqual({
      icompany_id: "c1",
      iinactive: "true",
    });
    expect(gridParamsOf("counters", { companyId: "", branchId: "b1", showInactive: false, category: "" })).toBeNull();
  });

  it("reasons always send icategory, '' for all categories", () => {
    const base = { companyId: "c1", branchId: "", showInactive: false };
    expect(gridParamsOf("reasons", { ...base, category: "" })).toEqual({
      icompany_id: "c1",
      iinactive: "false",
      icategory: "",
    });
    expect(gridParamsOf("reasons", { ...base, category: "NO_SALE" })?.icategory).toBe("NO_SALE");
  });

  it("says what is missing from the header", () => {
    expect(scopeMissingText("safes")).toBe("Safes belong to a branch — choose one in the header first.");
    expect(scopeMissingText("reasons")).toBe("Choose a company in the header first.");
  });

  it("draws cells by their SQL name", () => {
    expect(cellText("tcn_default_float", COUNTER_ROW)).toBe("2,000.00");
    expect(cellText("tcn_is_active", COUNTER_ROW)).toBe("Active");
    expect(cellText("tsf_is_default", { tsf_is_default: "t" })).toBe("★");
    expect(cellText("shipped", SHIPPED_TEA)).toBe("✓");
    expect(cellText("overridden", SHIPPED_TEA)).toBe("");
    expect(cellText("tdn_valid_to", { tdn_valid_to: "2027-03-31" })).toBe("31-03-2027");
    expect(cellText("tcn_name", COUNTER_ROW)).toBe("Counter 1");
  });

  it("a safe over its insured limit shows red; inactive and replaced rows grey", () => {
    expect(overInsured(SAFE_ROW)).toBe(true);
    expect(overInsured({ ...SAFE_ROW, tsf_insured_limit: "0" })).toBe(false);
    expect(rowMuted("reasons", { ...SHIPPED_TEA, overridden: true })).toBe(true);
    expect(rowMuted("counters", { ...COUNTER_ROW, tcn_is_active: false })).toBe(true);
    expect(rowMuted("counters", COUNTER_ROW)).toBe(false);
  });

  it("a new counter sorts after the rows listed", () => {
    expect(nextSortOf(3)).toBe(40);
    expect(nextSortOf(null)).toBe(10);
  });

  it("the hint speaks about the highlighted row", () => {
    expect(rowHint("reasons", SHIPPED_TEA)).toMatch(/^Shipped and shared/);
    expect(rowHint("counters", { ...COUNTER_ROW, live_session_no: "ZT1-0042", live_operator: "Ravi" })).toBe(
      "ZT1-0042 is live on this counter (Ravi) — its device and drawer are locked.",
    );
    expect(rowHint("counters", null)).toBe("");
  });
});

describe("the popup's mode", () => {
  it("new, edit, a copy of a shipped row, or a replaced shipped row shown locked", () => {
    expect(entryModeOf("counters", null)).toBe("new");
    expect(entryModeOf("counters", COUNTER_ROW)).toBe("edit");
    expect(entryModeOf("reasons", SHIPPED_TEA)).toBe("copy");
    expect(entryModeOf("reasons", { ...SHIPPED_TEA, overridden: true })).toBe("locked");
    expect(entryModeOf("reasons", { ...SHIPPED_TEA, shipped: false })).toBe("edit");
    expect(entryModeOf("denominations", SHIPPED_COIN)).toBe("copy");
  });

  it("titles, subtitles and Save / Update as Qt's NexCrudForm", () => {
    expect(entryHeading("counters", null, "new")).toMatchObject({ title: "New Till Counter", submitLabel: "Save" });
    expect(entryHeading("counters", COUNTER_ROW, "edit")).toMatchObject({
      title: "Till Counter · ZT1",
      submitLabel: "Update",
    });
    expect(entryHeading("reasons", SHIPPED_TEA, "copy")).toMatchObject({
      title: "Till Reason · TEA",
      submitLabel: "Save",
    });
    expect(entryHeading("reasons", SHIPPED_TEA, "copy").subtitle).toMatch(/^A shipped reason, shared by every company/);
    expect(entryHeading("denominations", SHIPPED_COIN, "locked").subtitle).toBe(
      "This company has its own row of this value — edit that one instead.",
    );
  });

  it("locks what Qt locks", () => {
    expect(lockedFields("counters", "edit", { ...COUNTER_ROW, live_session_no: "ZT1-0042" })).toEqual([
      "deviceId",
      "drawerMode",
    ]);
    expect(lockedFields("counters", "edit", COUNTER_ROW)).toEqual([]);
    expect(lockedFields("reasons", "copy", SHIPPED_TEA)).toEqual(["category", "code"]);
    expect(lockedFields("reasons", "new", null)).toEqual([]);
    expect(lockedFields("denominations", "copy", SHIPPED_COIN)).toEqual(["currency", "kind", "value"]);
    const ownUsed = { ...SHIPPED_COIN, shipped: false, used: true };
    expect(lockedFields("denominations", "edit", ownUsed)).toEqual(["currency", "kind", "value"]);
    expect(lockedFields("denominations", "edit", { ...ownUsed, used: false })).toEqual([]);
  });

  it("the caret starts in the first field that is not locked", () => {
    expect(firstField("counters", "new", null, false)).toBe("code");
    expect(firstField("reasons", "copy", SHIPPED_TEA, false)).toBe("name");
    expect(firstField("denominations", "copy", SHIPPED_COIN, false)).toBe("label");
    expect(firstField("reasons", "locked", SHIPPED_TEA, false)).toBeNull();
    expect(firstField("counters", "edit", COUNTER_ROW, true)).toBeNull();
  });
});

describe("counters", () => {
  it("fills from the grid row and posts back as the DTO wants", () => {
    const form = initialForm("counters", COUNTER_ROW, "edit", NEW);
    expect(form).toMatchObject({ defaultFloat: "2000", blockLimit: "30000.50", drawerMode: "TRAY", safeName: "S1 · Main safe" });
    expect(entryBody("counters", form, COUNTER_ROW, "edit", SCOPE)).toEqual({
      tcnId: "tcn-1",
      tcnCompanyId: "c1",
      tcnBranchId: "b1",
      tcnCode: "ZT1",
      tcnName: "Counter 1",
      tcnKind: "EXPRESS",
      tcnSortOrder: 10,
      tcnDeviceId: null,
      tcnDrawerMode: "TRAY",
      tcnRequiresSession: true,
      tcnDefaultFloat: 2000,
      tcnSafeId: "tsf-1",
      tcnCashAlertLimit: 20000,
      tcnCashBlockLimit: 30000.5,
      tcnIsActive: true,
      tcnRemarks: null,
    });
  });

  it("a new counter has no id, starts POS / DRAWER / needs a session, code upper-cased", () => {
    const form = initialForm("counters", null, "new", { ...NEW, nextSort: 40 });
    expect(form.sortOrder).toBe("40");
    const body = entryBody("counters", { ...form, code: " zq7 ", name: "  Split   test " }, null, "new", SCOPE);
    expect(body).not.toHaveProperty("tcnId");
    expect(body).toMatchObject({
      tcnCode: "ZQ7",
      tcnName: "Split test",
      tcnKind: "POS",
      tcnDrawerMode: "DRAWER",
      tcnRequiresSession: true,
      tcnDefaultFloat: 0,
      tcnCashAlertLimit: 0,
    });
  });

  it("refuses a blank code, then a blank name, then a block limit under the alert limit", () => {
    const form = initialForm("counters", null, "new", NEW);
    expect(problemOf("counters", form)).toEqual({ field: "code", message: "Give the counter a code (C01, EXP1 …)." });
    expect(problemOf("counters", { ...form, code: "C1" })?.field).toBe("name");
    const limits: CounterForm = { ...form, code: "C1", name: "X", alertLimit: "20000", blockLimit: "10000" };
    expect(problemOf("counters", limits)).toEqual({
      field: "blockLimit",
      message: "The block limit must be at least the alert limit (or 0 to switch it off).",
    });
    expect(problemOf("counters", { ...limits, blockLimit: "30000" })).toBeNull();
    expect(problemOf("counters", { ...limits, blockLimit: "" })).toBeNull();
  });

  it("warns while a session is live, for a cashless lane with a float, and with no device", () => {
    const live = { ...COUNTER_ROW, live_session_no: "ZT1-0042", live_operator: "Ravi" };
    const form: CounterForm = { ...initialForm("counters", live, "edit", NEW), drawerMode: "NONE", active: false };
    expect(entryWarnings("counters", form, live, "edit")).toEqual([
      "Device and drawer are locked while ZT1-0042 is live.",
      "A cashless lane takes no float.",
      "No device: any device may claim it from the free list, one session at a time.",
      "Close the live session before deactivating.",
    ]);
  });

  it("its facts line", () => {
    expect(entryFacts("counters", COUNTER_ROW, "edit")).toBe("last Z 4  ·  3 sessions in 30 days");
    expect(entryFacts("counters", null, "new")).toBe("");
  });
});

describe("safes", () => {
  it("the branch's first safe starts as its default", () => {
    expect(initialForm("safes", null, "new", { ...NEW, firstSafe: true }).isDefault).toBe(true);
    expect(initialForm("safes", null, "new", NEW).isDefault).toBe(false);
  });

  it("insists on a ledger and refuses an inactive default", () => {
    const form: SafeForm = { ...initialForm("safes", null, "new", NEW), code: "S1", name: "Main" };
    expect(problemOf("safes", form)).toEqual({ field: "ledgerId", message: "Pick the cash ledger this safe posts to." });
    expect(problemOf("safes", { ...form, ledgerId: "led-1", isDefault: true, active: false })?.message).toBe(
      "An inactive safe cannot be the branch default.",
    );
  });

  it("leaves tsfLedgerId out when none is picked (the DTO does not take null)", () => {
    const form = initialForm("safes", null, "new", NEW);
    expect(entryBody("safes", form, null, "new", SCOPE)).not.toHaveProperty("tsfLedgerId");
  });

  it("carries the drop-safe flag from the row to the body (notes 110)", () => {
    expect(initialForm("safes", null, "new", NEW).isDropSafe).toBe(false);
    const form = initialForm("safes", { ...SAFE_ROW, tsf_is_drop_safe: "t" }, "edit", NEW);
    expect(form.isDropSafe).toBe(true);
    expect(entryBody("safes", form, SAFE_ROW, "edit", SCOPE)).toMatchObject({ tsfIsDropSafe: true });
    expect(setDefaultBody({ ...SAFE_ROW, tsf_is_drop_safe: true }, SCOPE)).toMatchObject({ tsfIsDropSafe: true });
  });

  it("warns when it is switched off still holding cash or taking drops; facts from the row", () => {
    const form: SafeForm = { ...initialForm("safes", SAFE_ROW, "edit", NEW), active: false };
    expect(entryWarnings("safes", form, SAFE_ROW, "edit")).toEqual([
      "This safe still holds 51,250.00.",
      "Counters C01 C02 drop into it.",
    ]);
    expect(entryFacts("safes", SAFE_ROW, "edit")).toBe(
      "balance 51,250.00 — over the insured limit  ·  counters C01 C02  ·  last count —  ·  last remit 05-10-2026 · 10,000.00",
    );
  });

  it("Set default: an active safe not already the default, posted as its own save with the flag", () => {
    expect(canSetDefault(SAFE_ROW, ALL)).toBe(true);
    expect(canSetDefault({ ...SAFE_ROW, tsf_is_default: true }, ALL)).toBe(false);
    expect(canSetDefault({ ...SAFE_ROW, tsf_is_active: false }, ALL)).toBe(false);
    expect(canSetDefault(SAFE_ROW, CREATE_ONLY)).toBe(false);
    expect(setDefaultBody(SAFE_ROW, SCOPE)).toMatchObject({
      tsfId: "tsf-1",
      tsfCode: "ZTS",
      tsfLedgerId: "led-cash",
      tsfInsuredLimit: 50000,
      tsfIsDefault: true,
      tsfIsActive: true,
    });
  });
});

describe("reasons", () => {
  it("a new reason starts in the list's category, else EXPENSE", () => {
    expect(initialForm("reasons", null, "new", { ...NEW, category: "PAID_IN" }).category).toBe("PAID_IN");
    expect(initialForm("reasons", null, "new", NEW).category).toBe("EXPENSE");
  });

  it("Edit on a shipped reason posts this company's copy: no id, same category and code, switched on", () => {
    const shippedOff = { ...SHIPPED_TEA, trs_is_active: false };
    const form = initialForm("reasons", shippedOff, "copy", NEW);
    expect(form.active).toBe(true);
    const body = entryBody("reasons", { ...form, ledgerId: "led-exp" }, shippedOff, "copy", SCOPE);
    expect(body).not.toHaveProperty("trsId");
    expect(body).toMatchObject({
      trsCompanyId: "c1",
      trsCategory: "EXPENSE",
      trsCode: "TEA",
      trsLedgerId: "led-exp",
      trsIsActive: true,
    });
  });

  it("a default ledger outside EXPENSE / PAID_IN is not saved, and the popup says so", () => {
    const form: ReasonForm = { ...initialForm("reasons", null, "new", { ...NEW, category: "VARIANCE" }), ledgerId: "led-1" };
    expect(reasonBody(form, { ...SCOPE, id: null }).trsLedgerId).toBeNull();
    expect(entryWarnings("reasons", form, null, "new")).toEqual([
      "A default ledger only means something for EXPENSE and PAID_IN; it is not saved.",
    ]);
    expect(entryWarnings("reasons", { ...form, category: "REFUND", ledgerId: "" }, null, "new")).toEqual([
      "REFUND is reserved for the void module, which is not built yet.",
    ]);
  });

  it("its facts line on an edit", () => {
    expect(entryFacts("reasons", { ...SHIPPED_TEA, overridden: true }, "locked")).toBe(
      "SHARED — shipped for every company · used 2 times in 30 days (120.00)",
    );
    expect(entryFacts("reasons", SHIPPED_TEA, "copy")).toBe("");
  });

  it("refuses a blank code and name", () => {
    const form = initialForm("reasons", null, "new", NEW);
    expect(problemOf("reasons", form)?.message).toBe("Give the reason a code.");
    expect(problemOf("reasons", { ...form, code: "X" })?.message).toBe("Give the reason a name.");
  });
});

describe("denominations", () => {
  it("a new one starts INR / NOTE / a bundle of 100, no end date", () => {
    const form = initialForm("denominations", null, "new", NEW);
    expect(form).toMatchObject({ currency: "INR", kind: "NOTE", bundleQty: "100", validTo: "" });
  });

  it("a new coin starts loose, a new note in a bundle; an edit keeps its own", () => {
    expect(bundleAfterKindChange("COIN", "100", "new")).toBe("0");
    expect(bundleAfterKindChange("NOTE", "0", "new")).toBe("100");
    expect(bundleAfterKindChange("COIN", "50", "new")).toBe("50");
    expect(bundleAfterKindChange("COIN", "100", "edit")).toBe("100");
  });

  it("a blank valid-to posts null; a date posts itself", () => {
    const form: DenominationForm = {
      ...initialForm("denominations", null, "new", NEW),
      kind: "COIN",
      value: "7",
      label: "₹7",
      bundleQty: "0",
    };
    expect(entryBody("denominations", form, null, "new", SCOPE)).toEqual({
      tdnCompanyId: "c1",
      tdnCurrency: "INR",
      tdnKind: "COIN",
      tdnValue: 7,
      tdnLabel: "₹7",
      tdnBundleQty: 0,
      tdnSortOrder: 0,
      tdnValidTo: null,
      tdnIsActive: true,
    });
    expect(entryBody("denominations", { ...form, validTo: "2027-03-31" }, null, "new", SCOPE).tdnValidTo).toBe(
      "2027-03-31",
    );
  });

  it("refuses in Qt's order: currency, value, label, then a bad currency, then zero", () => {
    const blank: DenominationForm = { ...initialForm("denominations", null, "new", NEW), currency: "" };
    expect(problemOf("denominations", blank)?.message).toBe("The currency is a 3-letter code (INR).");
    const form: DenominationForm = { ...blank, currency: "INR" };
    expect(problemOf("denominations", form)?.message).toBe("Enter the face value.");
    expect(problemOf("denominations", { ...form, value: "5" })?.message).toBe("Give the denomination a label (₹500).");
    expect(problemOf("denominations", { ...form, value: "5", label: "x", currency: "RS" })?.field).toBe("currency");
    expect(problemOf("denominations", { ...form, value: "0", label: "x" })?.message).toBe("The value must be above zero.");
  });

  it("a used company row warns that its key is locked", () => {
    const own = { ...SHIPPED_COIN, shipped: false };
    expect(entryWarnings("denominations", initialForm("denominations", own, "edit", NEW), own, "edit")).toHaveLength(1);
    expect(entryWarnings("denominations", initialForm("denominations", SHIPPED_COIN, "copy", NEW), SHIPPED_COIN, "copy")).toEqual(
      [],
    );
  });
});

describe("Active on / off", () => {
  it("EDIT on a company row; CREATE on a shipped one; never on a replaced shipped row", () => {
    expect(canToggleRow("counters", COUNTER_ROW, EDIT_ONLY)).toBe(true);
    expect(canToggleRow("counters", COUNTER_ROW, CREATE_ONLY)).toBe(false);
    expect(canToggleRow("reasons", SHIPPED_TEA, CREATE_ONLY)).toBe(true);
    expect(canToggleRow("reasons", SHIPPED_TEA, EDIT_ONLY)).toBe(false);
    expect(canToggleRow("reasons", { ...SHIPPED_TEA, overridden: true }, ALL)).toBe(false);
    expect(canToggleRow("counters", null, ALL)).toBe(false);
  });

  it("Edit on a shipped row needs CREATE (it makes a copy)", () => {
    expect(canEditRow("denominations", SHIPPED_COIN, EDIT_ONLY)).toBe(false);
    expect(canEditRow("denominations", SHIPPED_COIN, CREATE_ONLY)).toBe(true);
    expect(canEditRow("counters", COUNTER_ROW, EDIT_ONLY)).toBe(true);
  });

  it("a counter with a live session is not switched off; a replaced row says which to switch", () => {
    const live = { ...COUNTER_ROW, live_session_no: "ZT1-0042" };
    expect(toggleRefusal("counters", live, false)).toBe("ZT1-0042 is live on this counter — close that session first.");
    expect(toggleRefusal("counters", live, true)).toBe("");
    expect(toggleRefusal("reasons", { ...SHIPPED_TEA, overridden: true }, false)).toBe(
      "This company has its own copy of this reason — switch that row on or off instead.",
    );
  });

  it("asks in Qt's words", () => {
    expect(toggleWords("counters", COUNTER_ROW, false)).toEqual({
      title: "Deactivate",
      message: 'Deactivate counter "Counter 1"? It stays in history and can be reactivated.',
      done: "Counter 1 deactivated.",
    });
    expect(toggleWords("denominations", SHIPPED_COIN, true).message).toBe('Reactivate denomination "₹5"?');
  });

  it("posts the row as stored with Active changed", () => {
    expect(toggleBody("counters", COUNTER_ROW, false, SCOPE)).toMatchObject({
      tcnId: "tcn-1",
      tcnCode: "ZT1",
      tcnSafeId: "tsf-1",
      tcnCashBlockLimit: 30000.5,
      tcnIsActive: false,
    });
  });

  it("an inactive safe is never the default", () => {
    expect(toggleBody("safes", { ...SAFE_ROW, tsf_is_default: true }, false, SCOPE)).toMatchObject({
      tsfId: "tsf-1",
      tsfIsActive: false,
      tsfIsDefault: false,
    });
  });

  it("off on a shipped row saves an inactive company copy (no id)", () => {
    const body = toggleBody("reasons", SHIPPED_TEA, false, SCOPE);
    expect(body).not.toHaveProperty("trsId");
    expect(body).toMatchObject({ trsCompanyId: "c1", trsCode: "TEA", trsCategory: "EXPENSE", trsIsActive: false });
    const coin = toggleBody("denominations", SHIPPED_COIN, false, SCOPE);
    expect(coin).not.toHaveProperty("tdnId");
    expect(coin).toMatchObject({ tdnValue: 5, tdnKind: "COIN", tdnValidTo: null, tdnIsActive: false });
  });
});

describe("error text", () => {
  it("reads the till filter's flat body and the global filter's nested one", () => {
    const flat = {
      status: 400,
      data: {
        success: false,
        message: "Validation failed",
        errors: [{ field: "tcnCode", code: "TILL_BAD_REQUEST", message: "Counter code ZT1 is already used in this branch" }],
      },
    };
    expect(tillErrorText(flat, "Save Failed")).toBe("Validation failed\nCounter code ZT1 is already used in this branch");
    const nested = {
      status: 403,
      data: { success: false, statusCode: 403, message: { success: false, message: "No right to edit till counters", errors: [] } },
    };
    expect(tillErrorText(nested, "Save Failed")).toBe("No right to edit till counters");
    expect(tillErrorText(undefined, "Save Failed")).toBe("Save Failed");
  });
});
