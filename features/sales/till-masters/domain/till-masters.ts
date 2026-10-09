/**
 * Till Masters (menu 271 › 275) — the rules of the screen, without React.
 *
 * Ported from the Qt `TillMastersEntry` (NexERP 09274cd, 2026-10-08): one
 * screen, four tabs — counters, safes, reasons, denominations. Every tab is a
 * configured-grid list on the left and the selected row's form on the right.
 * A row is shown straight from its grid row (the grid carries every field the
 * form needs), and Save posts the server's create-or-update route
 * (`/till/<master>/create`, an id in the body = update).
 *
 * Grid rows arrive the way the runner serialises Postgres: numerics as strings
 * ("500.00"), counts as strings ("0"), ints and booleans as themselves, and a
 * COALESCEd column as "" rather than null.
 */
import type { ConfiguredGridKey } from "@/lib/configured-grids";

export type TillTab = "counters" | "safes" | "reasons" | "denominations";

export const TILL_TABS: readonly TillTab[] = ["counters", "safes", "reasons", "denominations"];

export const TILL_TAB_LABELS: Record<TillTab, string> = {
  counters: "Counters",
  safes: "Safes",
  reasons: "Reasons",
  denominations: "Denominations",
};

export type GridRow = Record<string, unknown>;

/** Per tab: its grid, the grid row's id / active columns, and the save route. */
export const TAB_WIRE: Record<
  TillTab,
  {
    grid: ConfiguredGridKey;
    /** Counters and safes are per branch; reasons and denominations per company. */
    perBranch: boolean;
    rowId: string;
    rowActive: string;
    master: "counters" | "safes" | "reasons" | "denominations";
    bodyId: string;
    bodyActive: string;
  }
> = {
  counters: {
    grid: "tillCounterList",
    perBranch: true,
    rowId: "tcn_id",
    rowActive: "tcn_is_active",
    master: "counters",
    bodyId: "tcnId",
    bodyActive: "tcnIsActive",
  },
  safes: {
    grid: "tillSafeList",
    perBranch: true,
    rowId: "tsf_id",
    rowActive: "tsf_is_active",
    master: "safes",
    bodyId: "tsfId",
    bodyActive: "tsfIsActive",
  },
  reasons: {
    grid: "tillReasonList",
    perBranch: false,
    rowId: "trs_id",
    rowActive: "trs_is_active",
    master: "reasons",
    bodyId: "trsId",
    bodyActive: "trsIsActive",
  },
  denominations: {
    grid: "tillDenominationList",
    perBranch: false,
    rowId: "tdn_id",
    rowActive: "tdn_is_active",
    master: "denominations",
    bodyId: "tdnId",
    bodyActive: "tdnIsActive",
  },
};

/** ck_tcn_kind, in the server's order. */
export const COUNTER_KINDS = [
  "POS",
  "EXPRESS",
  "RETURNS_DESK",
  "SERVICE_DESK",
  "CASH_OFFICE",
  "MOBILE",
  "SELF_CHECKOUT",
] as const;

export type DrawerMode = "DRAWER" | "TRAY" | "NONE";

export const DRAWER_MODES: readonly { value: DrawerMode; label: string }[] = [
  { value: "DRAWER", label: "Drawer" },
  { value: "TRAY", label: "Tray (travels with cashier)" },
  { value: "NONE", label: "None (cashless lane)" },
];

/** ck_trs_category, in the server's order (TILL_REASON_CATEGORIES). */
export const REASON_CATEGORIES = [
  "VARIANCE",
  "FLOAT_MISMATCH",
  "EXPENSE",
  "PAID_IN",
  "PICKUP",
  "NO_SALE",
  "SUSPEND",
  "FORCE_CLOSE",
  "REOPEN",
  "SESSION_VOID",
  "MOVEMENT_VOID",
  "DAY_REOPEN",
  "REPRINT",
  "VOID_BILL",
  "VOID_LINE",
  "PRICE_OVERRIDE",
  "REFUND",
  "NONCASH",
] as const;

/** Reserved for the void module: listed, greyed. */
export const VOID_MODULE_CATEGORIES: readonly string[] = [
  "REPRINT",
  "VOID_BILL",
  "VOID_LINE",
  "PRICE_OVERRIDE",
  "REFUND",
];

/** The categories whose default ledger means something (the expense / paid-in line). */
export const LEDGER_CATEGORIES: readonly string[] = ["EXPENSE", "PAID_IN"];

/** The category the Reasons tab opens on. */
export const FIRST_REASON_CATEGORY = "EXPENSE";

// ── Reading a grid row ──────────────────────────────────────────────────────

export function rowText(row: GridRow | null | undefined, key: string): string {
  const value = row?.[key];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

export function rowBool(row: GridRow | null | undefined, key: string): boolean {
  const value = row?.[key];
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "t" || text === "1";
}

export function rowNum(row: GridRow | null | undefined, key: string): number {
  const value = Number(row?.[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function rowId(tab: TillTab, row: GridRow | null | undefined): string {
  return rowText(row, TAB_WIRE[tab].rowId);
}

export function rowActive(tab: TillTab, row: GridRow | null | undefined): boolean {
  return rowBool(row, TAB_WIRE[tab].rowActive);
}

const MONEY = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(value: number): string {
  return MONEY.format(value);
}

/** `YYYY-MM-DD` → `DD-MM-YYYY`; anything else as it came. */
export function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}

// ── Forms ───────────────────────────────────────────────────────────────────
//
// Numbers are held as the text the operator typed, so a half-typed "20." is
// not rewritten under the caret; the body parses them.

export type CounterForm = {
  code: string;
  name: string;
  kind: string;
  active: boolean;
  sortOrder: string;
  deviceId: string;
  deviceName: string;
  drawerMode: DrawerMode;
  requiresSession: boolean;
  defaultFloat: string;
  alertLimit: string;
  blockLimit: string;
  safeId: string;
  safeName: string;
  remarks: string;
};

export type SafeForm = {
  code: string;
  name: string;
  isDefault: boolean;
  ledgerId: string;
  ledgerName: string;
  insuredLimit: string;
  active: boolean;
  remarks: string;
};

export type ReasonForm = {
  category: string;
  code: string;
  name: string;
  ledgerId: string;
  ledgerName: string;
  needsNote: boolean;
  needsRef: boolean;
  maxAmount: string;
  sortOrder: string;
  active: boolean;
};

export type DenominationForm = {
  currency: string;
  value: string;
  kind: "NOTE" | "COIN";
  label: string;
  bundleQty: string;
  sortOrder: string;
  hasValidTo: boolean;
  validTo: string;
  active: boolean;
};

export type TillForms = {
  counters: CounterForm;
  safes: SafeForm;
  reasons: ReasonForm;
  denominations: DenominationForm;
};

export type TillForm = TillForms[TillTab];

/** What a new form needs to know about the tab it opens on. */
export type NewFormContext = {
  rows: readonly GridRow[];
  /** Reasons: the category selected on the side list. */
  category: string;
  /** Denominations: today, `YYYY-MM-DD` — the date box's starting value. */
  today: string;
};

function numberText(value: number): string {
  return value === 0 ? "0" : String(value);
}

export function newCounterForm({ rows }: NewFormContext): CounterForm {
  return {
    code: "",
    name: "",
    kind: "POS",
    active: true,
    sortOrder: String((rows.length + 1) * 10),
    deviceId: "",
    deviceName: "",
    drawerMode: "DRAWER",
    requiresSession: true,
    defaultFloat: "0",
    alertLimit: "0",
    blockLimit: "0",
    safeId: "",
    safeName: "",
    remarks: "",
  };
}

export function counterFormFromRow(row: GridRow): CounterForm {
  const kind = rowText(row, "tcn_kind");
  const drawer = rowText(row, "tcn_drawer_mode");
  return {
    code: rowText(row, "tcn_code"),
    name: rowText(row, "tcn_name"),
    kind: (COUNTER_KINDS as readonly string[]).includes(kind) ? kind : "POS",
    active: rowBool(row, "tcn_is_active"),
    sortOrder: String(Math.trunc(rowNum(row, "tcn_sort_order"))),
    deviceId: rowText(row, "tcn_device_id"),
    deviceName: rowText(row, "device_name"),
    drawerMode: drawer === "TRAY" || drawer === "NONE" ? drawer : "DRAWER",
    requiresSession: rowBool(row, "tcn_requires_session"),
    defaultFloat: numberText(rowNum(row, "tcn_default_float")),
    alertLimit: numberText(rowNum(row, "tcn_cash_alert_limit")),
    blockLimit: numberText(rowNum(row, "tcn_cash_block_limit")),
    safeId: rowText(row, "tcn_safe_id"),
    safeName: rowText(row, "safe_name"),
    remarks: rowText(row, "tcn_remarks"),
  };
}

export function newSafeForm({ rows }: NewFormContext): SafeForm {
  return {
    code: "",
    name: "",
    // The first safe of a branch is its default.
    isDefault: rows.length === 0,
    ledgerId: "",
    ledgerName: "",
    insuredLimit: "0",
    active: true,
    remarks: "",
  };
}

export function safeFormFromRow(row: GridRow): SafeForm {
  return {
    code: rowText(row, "tsf_code"),
    name: rowText(row, "tsf_name"),
    isDefault: rowBool(row, "tsf_is_default"),
    ledgerId: rowText(row, "tsf_ledger_id"),
    ledgerName: rowText(row, "ledger_name"),
    insuredLimit: numberText(rowNum(row, "tsf_insured_limit")),
    active: rowBool(row, "tsf_is_active"),
    remarks: rowText(row, "tsf_remarks"),
  };
}

export function newReasonForm({ category }: NewFormContext): ReasonForm {
  return {
    category: (REASON_CATEGORIES as readonly string[]).includes(category) ? category : FIRST_REASON_CATEGORY,
    code: "",
    name: "",
    ledgerId: "",
    ledgerName: "",
    needsNote: false,
    needsRef: false,
    maxAmount: "0",
    sortOrder: "0",
    active: true,
  };
}

export function reasonFormFromRow(row: GridRow): ReasonForm {
  const category = rowText(row, "trs_category");
  return {
    category: (REASON_CATEGORIES as readonly string[]).includes(category) ? category : FIRST_REASON_CATEGORY,
    code: rowText(row, "trs_code"),
    name: rowText(row, "trs_name"),
    ledgerId: rowText(row, "trs_ledger_id"),
    ledgerName: rowText(row, "ledger_name"),
    needsNote: rowBool(row, "trs_needs_note"),
    needsRef: rowBool(row, "trs_needs_ref"),
    maxAmount: numberText(rowNum(row, "trs_max_amount")),
    sortOrder: String(Math.trunc(rowNum(row, "trs_sort_order"))),
    active: rowBool(row, "trs_is_active"),
  };
}

export function newDenominationForm({ today }: NewFormContext): DenominationForm {
  return {
    currency: "INR",
    value: "0",
    kind: "NOTE",
    label: "",
    bundleQty: "100",
    sortOrder: "0",
    hasValidTo: false,
    validTo: today,
    active: true,
  };
}

export function denominationFormFromRow(row: GridRow, today: string): DenominationForm {
  const validTo = rowText(row, "tdn_valid_to");
  return {
    currency: rowText(row, "tdn_currency") || "INR",
    value: numberText(rowNum(row, "tdn_value")),
    kind: rowText(row, "tdn_kind") === "COIN" ? "COIN" : "NOTE",
    label: rowText(row, "tdn_label"),
    bundleQty: String(Math.trunc(rowNum(row, "tdn_bundle_qty"))),
    sortOrder: String(Math.trunc(rowNum(row, "tdn_sort_order"))),
    hasValidTo: /^\d{4}-\d{2}-\d{2}$/.test(validTo),
    validTo: /^\d{4}-\d{2}-\d{2}$/.test(validTo) ? validTo : today,
    active: rowBool(row, "tdn_is_active"),
  };
}

export function newForm<T extends TillTab>(tab: T, context: NewFormContext): TillForms[T] {
  const forms: { [K in TillTab]: (c: NewFormContext) => TillForms[K] } = {
    counters: newCounterForm,
    safes: newSafeForm,
    reasons: newReasonForm,
    denominations: newDenominationForm,
  };
  return forms[tab](context);
}

export function formFromRow<T extends TillTab>(tab: T, row: GridRow, today: string): TillForms[T] {
  const forms: { [K in TillTab]: (r: GridRow) => TillForms[K] } = {
    counters: counterFormFromRow,
    safes: safeFormFromRow,
    reasons: reasonFormFromRow,
    denominations: (r) => denominationFormFromRow(r, today),
  };
  return forms[tab](row);
}

// ── body() — what Save posts ────────────────────────────────────────────────

export type BodyContext = {
  companyId: string;
  branchId: string;
  /** The row being edited; null for a new one. */
  id: string | null;
};

/** A non-negative amount, two places; blank or junk is 0. */
export function toAmount(text: string): number {
  const value = Number(String(text).replace(/,/g, "").trim());
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

/** A non-negative whole number; blank or junk is 0. */
export function toCount(text: string): number {
  const value = Number(String(text).trim());
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.trunc(value);
}

function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
}

function idOrNull(id: string): string | null {
  return id.trim() ? id.trim() : null;
}

export function counterBody(form: CounterForm, { companyId, branchId, id }: BodyContext) {
  return {
    ...(id ? { tcnId: id } : {}),
    tcnCompanyId: companyId,
    tcnBranchId: branchId,
    tcnCode: form.code.trim().toUpperCase(),
    tcnName: form.name.trim(),
    tcnKind: form.kind,
    tcnDrawerMode: form.drawerMode,
    tcnDeviceId: idOrNull(form.deviceId),
    tcnSafeId: idOrNull(form.safeId),
    tcnDefaultFloat: toAmount(form.defaultFloat),
    tcnCashAlertLimit: toAmount(form.alertLimit),
    tcnCashBlockLimit: toAmount(form.blockLimit),
    tcnRequiresSession: form.requiresSession,
    tcnSortOrder: toCount(form.sortOrder),
    tcnRemarks: textOrNull(form.remarks),
    tcnIsActive: form.active,
  };
}

export function safeBody(form: SafeForm, { companyId, branchId, id }: BodyContext) {
  return {
    ...(id ? { tsfId: id } : {}),
    tsfCompanyId: companyId,
    tsfBranchId: branchId,
    tsfCode: form.code.trim().toUpperCase(),
    tsfName: form.name.trim(),
    // Left out on a new safe = the SAFE_CASH role's ledger; the screen insists on one.
    ...(form.ledgerId.trim() ? { tsfLedgerId: form.ledgerId.trim() } : {}),
    tsfInsuredLimit: toAmount(form.insuredLimit),
    tsfIsDefault: form.isDefault,
    tsfRemarks: textOrNull(form.remarks),
    tsfIsActive: form.active,
  };
}

export function reasonBody(form: ReasonForm, { companyId, id }: BodyContext) {
  return {
    ...(id ? { trsId: id } : {}),
    trsCompanyId: companyId,
    trsCategory: form.category,
    trsCode: form.code.trim().toUpperCase(),
    trsName: form.name.trim(),
    trsLedgerId: idOrNull(form.ledgerId),
    trsNeedsNote: form.needsNote,
    trsNeedsRef: form.needsRef,
    trsMaxAmount: toAmount(form.maxAmount),
    trsSortOrder: toCount(form.sortOrder),
    trsIsActive: form.active,
  };
}

export function denominationBody(form: DenominationForm, { companyId, id }: BodyContext) {
  return {
    ...(id ? { tdnId: id } : {}),
    tdnCompanyId: companyId,
    tdnCurrency: form.currency.trim().toUpperCase(),
    tdnValue: toAmount(form.value),
    tdnKind: form.kind,
    tdnLabel: form.label.trim(),
    tdnBundleQty: toCount(form.bundleQty),
    tdnSortOrder: toCount(form.sortOrder),
    tdnValidTo: form.hasValidTo && form.validTo ? form.validTo : null,
    tdnIsActive: form.active,
  };
}

export function bodyOf<T extends TillTab>(tab: T, form: TillForms[T], context: BodyContext): Record<string, unknown> {
  switch (tab) {
    case "counters":
      return counterBody(form as CounterForm, context);
    case "safes":
      return safeBody(form as SafeForm, context);
    case "reasons":
      return reasonBody(form as ReasonForm, context);
    default:
      return denominationBody(form as DenominationForm, context);
  }
}

// ── The shown row's state ───────────────────────────────────────────────────

/** A shipped (shared) reason is read-only: Copy shipped to edit makes the company's own. */
export function reasonReadOnly(shown: GridRow | null): boolean {
  return shown !== null && rowBool(shown, "shipped");
}

/** A shipped denomination is read-only; add the company's own row instead. */
export function denominationReadOnly(shown: GridRow | null): boolean {
  return shown !== null && rowBool(shown, "shipped");
}

/** Value, kind and currency are fixed once a count used the row. */
export function denominationLocked(shown: GridRow | null): boolean {
  return shown !== null && rowBool(shown, "used");
}

export function tabReadOnly(tab: TillTab, shown: GridRow | null): boolean {
  if (tab === "reasons") return reasonReadOnly(shown);
  if (tab === "denominations") return denominationReadOnly(shown);
  return false;
}

/** While a session is live on a counter, its device and drawer are locked. */
export function liveSessionNo(shown: GridRow | null): string {
  return rowText(shown, "live_session_no");
}

// ── problem() — why Save would refuse ──────────────────────────────────────

export function problemOf<T extends TillTab>(tab: T, form: TillForms[T], shown: GridRow | null): string {
  switch (tab) {
    case "counters": {
      const f = form as CounterForm;
      if (!f.code.trim()) return "Give the counter a code (C01, EXP1 …).";
      if (!f.name.trim()) return "Give the counter a name.";
      const alert = toAmount(f.alertLimit);
      const block = toAmount(f.blockLimit);
      if (alert > 0 && block > 0 && block < alert) {
        return "The block limit must be at least the alert limit (or 0 to switch it off).";
      }
      return "";
    }
    case "safes": {
      const f = form as SafeForm;
      if (!f.code.trim()) return "Give the safe a code (S1 …).";
      if (!f.name.trim()) return "Give the safe a name.";
      if (!f.ledgerId.trim()) return "Pick the cash ledger this safe posts to.";
      if (f.isDefault && !f.active) return "An inactive safe cannot be the branch default.";
      return "";
    }
    case "reasons": {
      const f = form as ReasonForm;
      if (reasonReadOnly(shown)) return "A shipped reason is read-only: use Copy shipped to edit.";
      if (!f.code.trim()) return "Give the reason a code.";
      if (!f.name.trim()) return "Give the reason a name.";
      return "";
    }
    default: {
      const f = form as DenominationForm;
      if (denominationReadOnly(shown)) return "A shipped denomination is read-only.";
      if (f.currency.trim().length !== 3) return "The currency is a 3-letter code (INR).";
      if (toAmount(f.value) <= 0) return "The value must be above zero.";
      if (!f.label.trim()) return "Give the denomination a label (₹500).";
      return "";
    }
  }
}

// ── warnings — the line under each form ────────────────────────────────────

export function counterWarnings(form: CounterForm, shown: GridRow | null): string[] {
  const live = liveSessionNo(shown);
  const warn: string[] = [];
  if (live) warn.push(`Device and drawer locked while ${live} is live`);
  const alert = toAmount(form.alertLimit);
  const block = toAmount(form.blockLimit);
  if (alert > 0 && block > 0 && block < alert) warn.push("block limit must be ≥ alert limit");
  if (form.drawerMode === "NONE" && toAmount(form.defaultFloat) > 0) warn.push("a cashless lane takes no float");
  if (!form.deviceId) warn.push("no device: the first device that opens a session here is linked to it");
  if (!form.active && live) warn.push("close the live session before deactivating");
  return warn;
}

export function safeWarnings(form: SafeForm, shown: GridRow | null): string[] {
  const warn: string[] = [];
  if (shown && !form.active) {
    const balance = rowNum(shown, "balance");
    if (Math.abs(balance) > 0.005) warn.push(`this safe still holds ${money(balance)}`);
    if (rowNum(shown, "counter_count") > 0) warn.push(`counters ${rowText(shown, "counter_codes")} drop into it`);
  }
  return warn;
}

export function reasonWarnings(form: ReasonForm, shown: GridRow | null): string[] {
  const warn: string[] = [];
  if (reasonReadOnly(shown)) {
    warn.push(
      "Shipped by the system and shared by every company — Copy shipped to edit makes this company's own row",
    );
  }
  if (!LEDGER_CATEGORIES.includes(form.category) && form.ledgerId) {
    warn.push("a default ledger only means something for EXPENSE and PAID_IN");
  }
  return warn;
}

export function denominationWarnings(shown: GridRow | null): string[] {
  return denominationReadOnly(shown)
    ? ["Shipped and shared by every company — add this company's own row instead"]
    : [];
}

// ── The lists ───────────────────────────────────────────────────────────────

export type ListFilter = {
  search: string;
  showInactive: boolean;
  /** Reasons only. */
  category: string;
};

function matches(row: GridRow, codeKey: string, nameKey: string, search: string): boolean {
  const find = search.trim().toLowerCase();
  if (!find) return true;
  return (
    rowText(row, codeKey).toLowerCase().includes(find) || rowText(row, nameKey).toLowerCase().includes(find)
  );
}

export function visibleRows(tab: TillTab, rows: readonly GridRow[], filter: ListFilter): GridRow[] {
  return rows.filter((row) => {
    const active = rowActive(tab, row);
    switch (tab) {
      case "counters":
        return (active || filter.showInactive) && matches(row, "tcn_code", "tcn_name", filter.search);
      case "safes":
        return active || filter.showInactive;
      case "reasons": {
        if (rowText(row, "trs_category") !== filter.category) return false;
        // A shipped row this company has replaced counts as inactive here.
        const replaced = rowBool(row, "overridden");
        if ((replaced || !active) && !filter.showInactive) return false;
        return matches(row, "trs_code", "trs_name", filter.search);
      }
      default:
        return active || filter.showInactive;
    }
  });
}

/** Active, not-replaced reasons per category — the side list's counts. */
export function reasonCategoryCounts(rows: readonly GridRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (rowActive("reasons", row) && !rowBool(row, "overridden")) {
      const category = rowText(row, "trs_category");
      counts[category] = (counts[category] ?? 0) + 1;
    }
  }
  return counts;
}

export function subtitleOf(tab: TillTab, rows: readonly GridRow[], companyName: string): string {
  const active = rows.filter((row) => rowActive(tab, row)).length;
  const lead = companyName ? `${companyName} · ` : "";
  switch (tab) {
    case "counters":
      return `${lead}${rows.length} counters in this branch, ${active} active · the lane a session is opened on`;
    case "safes":
      return `${lead}${rows.length} safes in this branch · where drawer cash goes`;
    case "reasons": {
      const shipped = rows.filter((row) => rowBool(row, "shipped")).length;
      return `${lead}${shipped} shipped reasons + ${rows.length - shipped} of this company · picked on the till, never typed`;
    }
    default:
      return `${lead}${rows.length} notes and coins, ${active} active · every count grid is built from them`;
  }
}

/** The form's heading: the new-row title, or "CODE · Name". */
export function headingOf(tab: TillTab, shown: GridRow | null): string {
  if (!shown) {
    return {
      counters: "New counter",
      safes: "New safe",
      reasons: "New reason",
      denominations: "New denomination",
    }[tab];
  }
  switch (tab) {
    case "counters":
      return `${rowText(shown, "tcn_code")} · ${rowText(shown, "tcn_name")}`;
    case "safes":
      return `${rowText(shown, "tsf_code")} · ${rowText(shown, "tsf_name")}`;
    case "reasons":
      return `${rowText(shown, "trs_code")} · ${rowText(shown, "trs_name")}`;
    default:
      return `${rowText(shown, "tdn_label")} · ${rowText(shown, "tdn_kind")}`;
  }
}
