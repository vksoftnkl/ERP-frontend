import { describe, expect, it } from "vitest";
import {
  bodyOf,
  counterBody,
  counterFormFromRow,
  counterWarnings,
  denominationBody,
  denominationFormFromRow,
  denominationLocked,
  denominationReadOnly,
  headingOf,
  newCounterForm,
  newDenominationForm,
  newReasonForm,
  newSafeForm,
  problemOf,
  reasonCategoryCounts,
  reasonFormFromRow,
  reasonReadOnly,
  reasonWarnings,
  safeBody,
  safeWarnings,
  subtitleOf,
  toAmount,
  visibleRows,
  type GridRow,
} from "./till-masters";

const CTX = { companyId: "c1", branchId: "b1", id: null };
const NEW = { rows: [] as GridRow[], category: "EXPENSE", today: "2026-10-09" };

// Rows as the grid runner sends them: numerics as strings, ints and bools as themselves.
const COUNTER_ROW: GridRow = {
  tcn_id: "tcn-1",
  tcn_code: "C01",
  tcn_name: "Counter 1",
  tcn_kind: "EXPRESS",
  tcn_drawer_mode: "TRAY",
  tcn_device_id: null,
  device_name: "",
  tcn_safe_id: "tsf-1",
  safe_name: "S1 · Main safe",
  tcn_default_float: "2000.00",
  tcn_cash_alert_limit: "20000.00",
  tcn_cash_block_limit: "30000.00",
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
  used_30d: "0",
  used_amount_30d: "0",
};

describe("counters", () => {
  it("reads a grid row and posts it back as the DTO wants", () => {
    const form = counterFormFromRow(COUNTER_ROW);
    expect(form.defaultFloat).toBe("2000");
    expect(form.drawerMode).toBe("TRAY");
    const body = counterBody(form, { ...CTX, id: "tcn-1" });
    expect(body).toMatchObject({
      tcnId: "tcn-1",
      tcnCompanyId: "c1",
      tcnBranchId: "b1",
      tcnCode: "C01",
      tcnKind: "EXPRESS",
      tcnDrawerMode: "TRAY",
      tcnDeviceId: null,
      tcnSafeId: "tsf-1",
      tcnDefaultFloat: 2000,
      tcnCashAlertLimit: 20000,
      tcnCashBlockLimit: 30000,
      tcnRequiresSession: true,
      tcnSortOrder: 10,
      tcnRemarks: null,
      tcnIsActive: true,
    });
  });

  it("a new counter has no id, and starts POS / DRAWER / needs a session", () => {
    const form = newCounterForm({ ...NEW, rows: [COUNTER_ROW] });
    expect(form.sortOrder).toBe("20");
    const body = counterBody({ ...form, code: " c02 ", name: "Two" }, CTX);
    expect(body).not.toHaveProperty("tcnId");
    expect(body).toMatchObject({ tcnCode: "C02", tcnKind: "POS", tcnDrawerMode: "DRAWER", tcnRequiresSession: true });
  });

  it("refuses a blank code and a block limit under the alert limit", () => {
    const form = newCounterForm(NEW);
    expect(problemOf("counters", { ...form, name: "X" }, null)).toMatch(/code/);
    expect(problemOf("counters", { ...form, code: "C1", name: "X", alertLimit: "500", blockLimit: "100" }, null)).toMatch(
      /block limit/,
    );
    expect(problemOf("counters", { ...form, code: "C1", name: "X", alertLimit: "500", blockLimit: "0" }, null)).toBe("");
  });

  it("warns while a session is live and for a cashless lane with a float", () => {
    const live = { ...COUNTER_ROW, live_session_no: "C01-0042", live_operator: "Ravi" };
    const form = { ...counterFormFromRow(live), drawerMode: "NONE" as const, active: false };
    const warn = counterWarnings(form, live);
    expect(warn[0]).toBe("Device and drawer locked while C01-0042 is live");
    expect(warn).toContain("a cashless lane takes no float");
    expect(warn).toContain("close the live session before deactivating");
  });
});

describe("safes", () => {
  it("the first safe of a branch is its default", () => {
    expect(newSafeForm(NEW).isDefault).toBe(true);
    expect(newSafeForm({ ...NEW, rows: [{ tsf_id: "x" }] }).isDefault).toBe(false);
  });

  it("insists on a ledger and refuses an inactive default", () => {
    const form = { ...newSafeForm(NEW), code: "S1", name: "Main" };
    expect(problemOf("safes", form, null)).toMatch(/cash ledger/);
    expect(problemOf("safes", { ...form, ledgerId: "led-1", active: false }, null)).toMatch(/inactive safe/);
  });

  it("leaves tsfLedgerId out when none is picked", () => {
    expect(safeBody(newSafeForm(NEW), CTX)).not.toHaveProperty("tsfLedgerId");
    expect(safeBody({ ...newSafeForm(NEW), ledgerId: "led-1" }, CTX).tsfLedgerId).toBe("led-1");
  });

  it("warns when an inactive safe still holds cash or takes drops", () => {
    const row = { tsf_id: "s", balance: "1500.00", counter_count: "2", counter_codes: "C01 C02" };
    const warn = safeWarnings({ ...newSafeForm(NEW), active: false }, row);
    expect(warn).toEqual(["this safe still holds 1,500.00", "counters C01 C02 drop into it"]);
  });
});

describe("reasons", () => {
  it("a shipped reason is read-only, and Save says how to change it", () => {
    expect(reasonReadOnly(SHIPPED_TEA)).toBe(true);
    expect(problemOf("reasons", reasonFormFromRow(SHIPPED_TEA), SHIPPED_TEA)).toMatch(/Copy shipped to edit/);
    expect(reasonWarnings(reasonFormFromRow(SHIPPED_TEA), SHIPPED_TEA)[0]).toMatch(/^Shipped by the system/);
  });

  it("a copy of a shipped reason posts as the company's own row with the same code", () => {
    const body = bodyOf("reasons", reasonFormFromRow(SHIPPED_TEA), CTX);
    expect(body).not.toHaveProperty("trsId");
    expect(body).toMatchObject({ trsCompanyId: "c1", trsCategory: "EXPENSE", trsCode: "TEA" });
  });

  it("a new reason starts in the selected category", () => {
    expect(newReasonForm({ ...NEW, category: "PAID_IN" }).category).toBe("PAID_IN");
    expect(newReasonForm({ ...NEW, category: "NOPE" }).category).toBe("EXPENSE");
  });

  it("a default ledger only means something for EXPENSE and PAID_IN", () => {
    const form = { ...newReasonForm({ ...NEW, category: "VARIANCE" }), ledgerId: "led-1" };
    expect(reasonWarnings(form, null)).toEqual(["a default ledger only means something for EXPENSE and PAID_IN"]);
  });

  it("lists by category; replaced and inactive rows only with the box ticked", () => {
    const own = { ...SHIPPED_TEA, trs_id: "own", shipped: false };
    const replaced = { ...SHIPPED_TEA, overridden: true };
    const other = { ...SHIPPED_TEA, trs_id: "v", trs_category: "VARIANCE" };
    const rows = [replaced, own, other];
    const filter = { search: "", showInactive: false, category: "EXPENSE" };
    expect(visibleRows("reasons", rows, filter).map((row) => row.trs_id)).toEqual(["own"]);
    expect(visibleRows("reasons", rows, { ...filter, showInactive: true })).toHaveLength(2);
    expect(reasonCategoryCounts(rows)).toEqual({ EXPENSE: 1, VARIANCE: 1 });
  });
});

describe("denominations", () => {
  const SHIPPED_500: GridRow = {
    tdn_id: "d500",
    tdn_company_id: "",
    tdn_currency: "INR",
    tdn_value: "500.00",
    tdn_kind: "NOTE",
    tdn_label: "₹500",
    tdn_bundle_qty: 100,
    tdn_sort_order: 10,
    tdn_valid_to: "",
    tdn_is_active: true,
    shipped: true,
    used: true,
  };

  it("shipped rows are read-only; a used row locks value, kind and currency", () => {
    expect(denominationReadOnly(SHIPPED_500)).toBe(true);
    expect(denominationLocked(SHIPPED_500)).toBe(true);
    expect(problemOf("denominations", denominationFormFromRow(SHIPPED_500, "2026-10-09"), SHIPPED_500)).toMatch(
      /read-only/,
    );
  });

  it("a blank valid-to posts null; a ticked one posts the date", () => {
    const form = { ...newDenominationForm(NEW), value: "7", kind: "COIN" as const, label: "₹7" };
    expect(denominationBody(form, CTX)).toMatchObject({ tdnValue: 7, tdnKind: "COIN", tdnValidTo: null, tdnBundleQty: 100 });
    expect(denominationBody({ ...form, hasValidTo: true, validTo: "2027-03-31" }, CTX).tdnValidTo).toBe("2027-03-31");
  });

  it("refuses a value of zero and a currency that is not three letters", () => {
    const form = { ...newDenominationForm(NEW), label: "x" };
    expect(problemOf("denominations", form, null)).toMatch(/above zero/);
    expect(problemOf("denominations", { ...form, value: "1", currency: "RS" }, null)).toMatch(/3-letter/);
  });
});

describe("words", () => {
  it("amounts parse forgivingly", () => {
    expect(toAmount("1,250.555")).toBe(1250.56);
    expect(toAmount("")).toBe(0);
    expect(toAmount("-4")).toBe(0);
  });

  it("subtitle and heading", () => {
    expect(subtitleOf("counters", [COUNTER_ROW], "Acme")).toBe(
      "Acme · 1 counters in this branch, 1 active · the lane a session is opened on",
    );
    expect(subtitleOf("reasons", [SHIPPED_TEA], "")).toMatch(/^1 shipped reasons \+ 0 of this company/);
    expect(headingOf("counters", COUNTER_ROW)).toBe("C01 · Counter 1");
    expect(headingOf("safes", null)).toBe("New safe");
  });
});
