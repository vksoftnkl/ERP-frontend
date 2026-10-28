/**
 * The four till master screens — the rules, without React.
 *
 * Ported from the Qt split of NexERP d5c3637 (2026-10-09): what was one tabbed
 * Till Masters screen (menu 275) is now four list screens, each a configured
 * grid with a popup entry, under the group 283 "Till Masters" in 271 Till:
 *
 *   275  Till Counters   grid MAIN LIST - TILL COUNTERS        per branch
 *   280  Till Safes      grid MAIN LIST - TILL SAFES           per branch
 *   281  Till Reasons    grid MAIN LIST - TILL REASONS         per company + shipped
 *   282  Denominations   grid MAIN LIST - TILL DENOMINATIONS   per company + shipped
 *
 * The popup is filled from the GRID ROW, as Qt's is ("no /get: the grid row is
 * the record") — the row carries the display names and the facts (balance,
 * live session, use counts) the server's `/get` leaves out. Save posts the
 * create-or-update route `/till/<master>/create` (an id in the body = update).
 *
 * A master with history is never deleted from these screens: Active on / off
 * (Ctrl+D) deactivates it, and a shipped (shared) reason or denomination is
 * switched off for this company only by saving an inactive company copy.
 *
 * Grid rows arrive the way the runner serialises Postgres: numerics as strings
 * ("500.00"), counts as strings ("0"), ints and booleans as themselves, and a
 * COALESCEd column as "" rather than null. Money stays in integer paise here.
 */
import type { ConfiguredGridKey } from "@/lib/configured-grids";
import { formatAmount } from "@/features/reports/shared/wire/money";

export type TillMasterKind = "counters" | "safes" | "reasons" | "denominations";

export const TILL_MASTER_KINDS: readonly TillMasterKind[] = ["counters", "safes", "reasons", "denominations"];

export type GridRow = Record<string, unknown>;

export type TillMasterSpec = {
  /** The menu's label and the screen's heading. */
  title: string;
  listSubtitle: string;
  /** "counter" — in confirmations and tooltips. */
  entity: string;
  entityPlural: string;
  /** The route; menu rights are resolved from it. */
  href: string;
  menuId: number;
  grid: ConfiguredGridKey;
  /** Counters and safes belong to a branch; the grid also takes `ibranch_id`. */
  branchScoped: boolean;
  rowId: string;
  rowCode: string;
  rowName: string;
  rowActive: string;
  /** `/till/<master>/create`. */
  master: TillMasterKind;
  bodyId: string;
};

export const TILL_MASTER_SPECS: Record<TillMasterKind, TillMasterSpec> = {
  counters: {
    title: "Till Counters",
    listSubtitle:
      "The lanes of this branch a till session is opened on — device, drawer, float and cash limits.",
    entity: "counter",
    entityPlural: "counters",
    href: "/sales/till/counters",
    menuId: 275,
    grid: "tillCounterList",
    branchScoped: true,
    rowId: "tcn_id",
    rowCode: "tcn_code",
    rowName: "tcn_name",
    rowActive: "tcn_is_active",
    master: "counters",
    bodyId: "tcnId",
  },
  safes: {
    title: "Till Safes",
    listSubtitle:
      "Where this branch's drawer cash goes. Balance, counters and the last count / remit come from the postings.",
    entity: "safe",
    entityPlural: "safes",
    href: "/sales/till/safes",
    menuId: 280,
    grid: "tillSafeList",
    branchScoped: true,
    rowId: "tsf_id",
    rowCode: "tsf_code",
    rowName: "tsf_name",
    rowActive: "tsf_is_active",
    master: "safes",
    bodyId: "tsfId",
  },
  reasons: {
    title: "Till Reasons",
    listSubtitle:
      "Shipped reasons, shared by every company, plus this company's own. Picked on the till, never typed.",
    entity: "reason",
    entityPlural: "reasons",
    href: "/sales/till/reasons",
    menuId: 281,
    grid: "tillReasonList",
    branchScoped: false,
    rowId: "trs_id",
    rowCode: "trs_code",
    rowName: "trs_name",
    rowActive: "trs_is_active",
    master: "reasons",
    bodyId: "trsId",
  },
  denominations: {
    title: "Denominations",
    listSubtitle:
      "Shipped notes and coins, shared by every company, plus this company's own. Every count grid is built from them.",
    entity: "denomination",
    entityPlural: "denominations",
    href: "/sales/till/denominations",
    menuId: 282,
    grid: "tillDenominationList",
    branchScoped: false,
    rowId: "tdn_id",
    rowCode: "tdn_label",
    rowName: "tdn_label",
    rowActive: "tdn_is_active",
    master: "denominations",
    bodyId: "tdnId",
  },
};

/** The server caches a grid run for about a second; a list re-read sooner shows the old row. */
export const RELOAD_AFTER_SAVE_MS = 1200;

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

export const DRAWER_MODES: readonly DrawerMode[] = ["DRAWER", "TRAY", "NONE"];

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

/** Reserved for the void module, which is not built yet. */
export const VOID_MODULE_CATEGORIES: readonly string[] = [
  "REPRINT",
  "VOID_BILL",
  "VOID_LINE",
  "PRICE_OVERRIDE",
  "REFUND",
];

/** Where a default ledger means something (the expense / paid-in line). */
export const LEDGER_CATEGORIES: readonly string[] = ["EXPENSE", "PAID_IN"];

/** A new reason with no category filter on the list starts here (the commonest). */
export const DEFAULT_REASON_CATEGORY = "EXPENSE";

/** A bundle of notes; coins come loose. */
export const NOTE_BUNDLE = 100;

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

/** A whole number (counts, sort orders); junk is 0. */
export function rowInt(row: GridRow | null | undefined, key: string): number {
  const value = Number.parseInt(rowText(row, key), 10);
  return Number.isFinite(value) ? value : 0;
}

export function rowId(kind: TillMasterKind, row: GridRow | null | undefined): string {
  return rowText(row, TILL_MASTER_SPECS[kind].rowId);
}

export function rowActive(kind: TillMasterKind, row: GridRow | null | undefined): boolean {
  return rowBool(row, TILL_MASTER_SPECS[kind].rowActive);
}

export function rowName(kind: TillMasterKind, row: GridRow | null | undefined): string {
  return rowText(row, TILL_MASTER_SPECS[kind].rowName);
}

/** A shared row the system shipped (company NULL) — reasons and denominations only. */
export function isShipped(kind: TillMasterKind, row: GridRow | null | undefined): boolean {
  return (kind === "reasons" || kind === "denominations") && rowBool(row, "shipped");
}

/** A shipped row this company has replaced with its own. */
export function isReplaced(kind: TillMasterKind, row: GridRow | null | undefined): boolean {
  return isShipped(kind, row) && rowBool(row, "overridden");
}

// ── Money, in integer paise ─────────────────────────────────────────────────

const DECIMAL = /^(-?)(\d*)(?:\.(\d*))?$/;

/** `"1,250.555"` → 125056. Blank or junk is 0; the third decimal rounds half up. */
export function paiseOf(value: unknown): number {
  const text =
    typeof value === "number"
      ? Number.isFinite(value)
        ? value.toFixed(3)
        : ""
      : String(value ?? "")
          .replace(/,/g, "")
          .trim();
  const match = DECIMAL.exec(text);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) return 0;
  const [, sign, whole, decimals = ""] = match;
  const digits = decimals.padEnd(3, "0");
  const paise = Number(whole || "0") * 100 + Number(digits.slice(0, 2)) + (Number(digits[2]) >= 5 ? 1 : 0);
  return sign && paise !== 0 ? -paise : paise;
}

/** Paise as a two-place decimal string: 125056 → "1250.56". */
export function paiseText(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(paise));
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** An amount as the screen shows it: Indian grouping, two places — `1,76,300.00`. */
export function moneyText(value: unknown): string {
  return formatAmount(paiseText(paiseOf(value)));
}

/** An amount as an input holds it: `2000.00` → "2000", `2000.50` → "2000.50". */
export function amountInputText(value: unknown): string {
  const paise = paiseOf(value);
  if (paise % 100 === 0) return String(Math.trunc(paise / 100));
  return paiseText(paise);
}

/** What an amount box posts: non-negative, two places; blank is 0 (Qt `blankAs(0)`). */
export function toAmount(text: string): number {
  const paise = paiseOf(text);
  return paise > 0 ? paise / 100 : 0;
}

/** A non-negative whole number; blank or junk is 0. */
export function toCount(text: string): number {
  const value = Number.parseInt(String(text).trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`; anything else as it came. */
export function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** Qt's `simplified()`: trimmed, inner runs of white space folded to one. */
export function simplified(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ── The list ────────────────────────────────────────────────────────────────

export type ListFilter = {
  companyId: string;
  branchId: string;
  showInactive: boolean;
  /** Reasons: "" = all categories. */
  category: string;
};

/**
 * The grid's tokens, every one always sent: they are QUOTED in the SQL, so a
 * token left out stays a literal word and the list comes back silently empty
 * (`'icategory' = ''` is false). Null while the list cannot be asked for — no
 * company yet, or a branch-scoped master with no branch in the header.
 */
export function gridParamsOf(kind: TillMasterKind, filter: ListFilter): Record<string, string> | null {
  const spec = TILL_MASTER_SPECS[kind];
  if (!filter.companyId) return null;
  if (spec.branchScoped && !filter.branchId) return null;
  const params: Record<string, string> = {
    icompany_id: filter.companyId,
    iinactive: filter.showInactive ? "true" : "false",
  };
  if (spec.branchScoped) params.ibranch_id = filter.branchId;
  if (kind === "reasons") params.icategory = filter.category;
  return params;
}

/** Why the list is empty because the header is not ready. */
export function scopeMissingText(kind: TillMasterKind): string {
  return TILL_MASTER_SPECS[kind].branchScoped
    ? `${TILL_MASTER_SPECS[kind].title.replace(/^Till /, "")} belong to a branch — choose one in the header first.`
    : "Choose a company in the header first.";
}

/** A new counter's sort order: after the rows the list holds (Qt `(rows + 1) * 10`). */
export function nextSortOf(listed: number | null): number {
  return ((listed ?? 0) + 1) * 10;
}

export type CellFormat = "money" | "active" | "tick" | "star" | "date" | "count";

/** How a grid column is drawn, by its SQL name. Anything unlisted is plain text. */
export const CELL_FORMATS: Readonly<Record<string, CellFormat>> = {
  tcn_default_float: "money",
  tcn_is_active: "active",
  tsf_insured_limit: "money",
  tsf_is_default: "star",
  tsf_is_drop_safe: "tick",
  balance: "money",
  tsf_is_active: "active",
  trs_needs_note: "tick",
  trs_needs_ref: "tick",
  trs_max_amount: "money",
  shipped: "tick",
  overridden: "tick",
  used: "tick",
  used_30d: "count",
  trs_is_active: "active",
  tdn_value: "money",
  tdn_valid_to: "date",
  tdn_bundle_qty: "count",
  tdn_sort_order: "count",
  tdn_is_active: "active",
  counter_count: "count",
};

export function cellText(key: string, row: GridRow | null | undefined): string {
  switch (CELL_FORMATS[key]) {
    case "money":
      return moneyText(row?.[key]);
    case "active":
      return rowBool(row, key) ? "Active" : "Inactive";
    case "tick":
      return rowBool(row, key) ? "✓" : "";
    case "star":
      return rowBool(row, key) ? "★" : "";
    case "date":
      return displayDate(rowText(row, key));
    case "count":
      return String(rowInt(row, key));
    default:
      return rowText(row, key);
  }
}

/** A safe holding more than it is insured for — its balance shows red. */
export function overInsured(row: GridRow | null | undefined): boolean {
  const insured = paiseOf(row?.tsf_insured_limit);
  return insured > 0 && paiseOf(row?.balance) > insured;
}

/** Greyed in the list: switched off, or a shipped row this company replaced. */
export function rowMuted(kind: TillMasterKind, row: GridRow | null | undefined): boolean {
  return !rowActive(kind, row) || isReplaced(kind, row);
}

/** The hint bar's sentence about the highlighted row. */
export function rowHint(kind: TillMasterKind, row: GridRow | null | undefined): string {
  if (!row) return "";
  const entity = TILL_MASTER_SPECS[kind].entity;
  if (isReplaced(kind, row)) {
    return kind === "reasons"
      ? "Replaced — this company has its own copy of this shipped reason; edit or switch that row instead."
      : "Replaced — this company has its own row of this value; edit or switch that one instead.";
  }
  if (isShipped(kind, row)) {
    return `Shipped and shared by every company — Edit makes this company's own copy; Active off hides it for this company only.`;
  }
  const live = rowText(row, "live_session_no");
  if (kind === "counters" && live) {
    return `${live} is live on this counter (${rowText(row, "live_operator") || "—"}) — its device and drawer are locked.`;
  }
  if (!rowActive(kind, row)) return `Inactive — Active on / off (Ctrl+D) brings the ${entity} back.`;
  if (kind === "safes" && rowBool(row, "tsf_is_default")) {
    return "The branch default safe: counters with no safe of their own drop into it.";
  }
  return "";
}

// ── Forms ───────────────────────────────────────────────────────────────────
//
// Numbers are held as the text the operator typed, so a half-typed "20." is not
// rewritten under the caret; the body parses them.

export type CounterForm = {
  code: string;
  name: string;
  kind: string;
  sortOrder: string;
  deviceId: string;
  deviceName: string;
  drawerMode: DrawerMode;
  requiresSession: boolean;
  defaultFloat: string;
  safeId: string;
  safeName: string;
  alertLimit: string;
  blockLimit: string;
  active: boolean;
  remarks: string;
};

export type SafeForm = {
  code: string;
  name: string;
  ledgerId: string;
  ledgerName: string;
  insuredLimit: string;
  isDefault: boolean;
  /** Notes 110 §3: a sealed-bag box at the counter — a Drop goes only into the counter's own drop safe. */
  isDropSafe: boolean;
  active: boolean;
  remarks: string;
};

export type ReasonForm = {
  category: string;
  code: string;
  name: string;
  sortOrder: string;
  ledgerId: string;
  ledgerName: string;
  maxAmount: string;
  needsNote: boolean;
  needsRef: boolean;
  active: boolean;
};

export type DenominationForm = {
  currency: string;
  kind: "NOTE" | "COIN";
  value: string;
  label: string;
  bundleQty: string;
  sortOrder: string;
  /** `YYYY-MM-DD`; "" = no end. */
  validTo: string;
  active: boolean;
};

export type TillForms = {
  counters: CounterForm;
  safes: SafeForm;
  reasons: ReasonForm;
  denominations: DenominationForm;
};

export type TillForm = TillForms[TillMasterKind];

/**
 * What the popup is doing with its row:
 *  - `new`    — a blank record.
 *  - `edit`   — this company's own row, updated in place.
 *  - `copy`   — a shipped reason / denomination: saving makes this company's
 *               own row with the same key, which replaces the shipped one here.
 *  - `locked` — a shipped row this company has already replaced: shown, not edited.
 */
export type EntryMode = "new" | "edit" | "copy" | "locked";

export function entryModeOf(kind: TillMasterKind, row: GridRow | null): EntryMode {
  if (!row) return "new";
  if (isShipped(kind, row)) return isReplaced(kind, row) ? "locked" : "copy";
  return "edit";
}

/** What a new form needs to know about the list it was opened from. */
export type NewFormContext = {
  /** Counters: the sort order after the rows listed. */
  nextSort: number;
  /** Safes: the branch has none listed, so this one starts as its default. */
  firstSafe: boolean;
  /** Reasons: the list's category filter ("" = none). */
  category: string;
};

function counterFormFromRow(row: GridRow): CounterForm {
  const kind = rowText(row, "tcn_kind");
  const drawer = rowText(row, "tcn_drawer_mode");
  return {
    code: rowText(row, "tcn_code"),
    name: rowText(row, "tcn_name"),
    kind: (COUNTER_KINDS as readonly string[]).includes(kind) ? kind : "POS",
    sortOrder: String(rowInt(row, "tcn_sort_order")),
    deviceId: rowText(row, "tcn_device_id"),
    deviceName: rowText(row, "device_name"),
    drawerMode: (DRAWER_MODES as readonly string[]).includes(drawer) ? (drawer as DrawerMode) : "DRAWER",
    requiresSession: rowBool(row, "tcn_requires_session"),
    defaultFloat: amountInputText(row.tcn_default_float),
    safeId: rowText(row, "tcn_safe_id"),
    safeName: rowText(row, "safe_name"),
    alertLimit: amountInputText(row.tcn_cash_alert_limit),
    blockLimit: amountInputText(row.tcn_cash_block_limit),
    active: rowBool(row, "tcn_is_active"),
    remarks: rowText(row, "tcn_remarks"),
  };
}

function safeFormFromRow(row: GridRow): SafeForm {
  return {
    code: rowText(row, "tsf_code"),
    name: rowText(row, "tsf_name"),
    ledgerId: rowText(row, "tsf_ledger_id"),
    ledgerName: rowText(row, "ledger_name"),
    insuredLimit: amountInputText(row.tsf_insured_limit),
    isDefault: rowBool(row, "tsf_is_default"),
    isDropSafe: rowBool(row, "tsf_is_drop_safe"),
    active: rowBool(row, "tsf_is_active"),
    remarks: rowText(row, "tsf_remarks"),
  };
}

function reasonFormFromRow(row: GridRow): ReasonForm {
  const category = rowText(row, "trs_category");
  return {
    category: (REASON_CATEGORIES as readonly string[]).includes(category) ? category : DEFAULT_REASON_CATEGORY,
    code: rowText(row, "trs_code"),
    name: rowText(row, "trs_name"),
    sortOrder: String(rowInt(row, "trs_sort_order")),
    ledgerId: rowText(row, "trs_ledger_id"),
    ledgerName: rowText(row, "ledger_name"),
    maxAmount: amountInputText(row.trs_max_amount),
    needsNote: rowBool(row, "trs_needs_note"),
    needsRef: rowBool(row, "trs_needs_ref"),
    active: rowBool(row, "trs_is_active"),
  };
}

function denominationFormFromRow(row: GridRow): DenominationForm {
  const validTo = rowText(row, "tdn_valid_to");
  return {
    currency: rowText(row, "tdn_currency") || "INR",
    kind: rowText(row, "tdn_kind") === "COIN" ? "COIN" : "NOTE",
    value: amountInputText(row.tdn_value),
    label: rowText(row, "tdn_label"),
    bundleQty: String(rowInt(row, "tdn_bundle_qty")),
    sortOrder: String(rowInt(row, "tdn_sort_order")),
    validTo: /^\d{4}-\d{2}-\d{2}$/.test(validTo) ? validTo : "",
    active: rowBool(row, "tdn_is_active"),
  };
}

function newForm<K extends TillMasterKind>(kind: K, context: NewFormContext): TillForms[K] {
  const forms: { [M in TillMasterKind]: TillForms[M] } = {
    counters: {
      code: "",
      name: "",
      kind: "POS",
      sortOrder: String(context.nextSort),
      deviceId: "",
      deviceName: "",
      drawerMode: "DRAWER",
      requiresSession: true,
      defaultFloat: "",
      safeId: "",
      safeName: "",
      alertLimit: "",
      blockLimit: "",
      active: true,
      remarks: "",
    },
    safes: {
      code: "",
      name: "",
      ledgerId: "",
      ledgerName: "",
      insuredLimit: "",
      isDefault: context.firstSafe,
      isDropSafe: false,
      active: true,
      remarks: "",
    },
    reasons: {
      category: (REASON_CATEGORIES as readonly string[]).includes(context.category)
        ? context.category
        : DEFAULT_REASON_CATEGORY,
      code: "",
      name: "",
      sortOrder: "0",
      ledgerId: "",
      ledgerName: "",
      maxAmount: "",
      needsNote: false,
      needsRef: false,
      active: true,
    },
    denominations: {
      currency: "INR",
      kind: "NOTE",
      value: "",
      label: "",
      bundleQty: String(NOTE_BUNDLE),
      sortOrder: "0",
      validTo: "",
      active: true,
    },
  };
  return forms[kind];
}

/** The form a grid row opens as (fromRow), as a copy (Active on), or blank. */
export function initialForm<K extends TillMasterKind>(
  kind: K,
  row: GridRow | null,
  mode: EntryMode,
  context: NewFormContext,
): TillForms[K] {
  if (!row || mode === "new") return newForm(kind, context);
  const readers: { [M in TillMasterKind]: (r: GridRow) => TillForms[M] } = {
    counters: counterFormFromRow,
    safes: safeFormFromRow,
    reasons: reasonFormFromRow,
    denominations: denominationFormFromRow,
  };
  const form = readers[kind](row) as TillForms[K];
  // A copy is a new company row, and a new row starts switched on.
  return mode === "copy" ? { ...form, active: true } : form;
}

/** A new coin starts loose (bundle 0), a new note in a bundle of 100; an edit keeps its own. */
export function bundleAfterKindChange(kind: "NOTE" | "COIN", bundleText: string, mode: EntryMode): string {
  if (mode !== "new") return bundleText;
  const bundle = toCount(bundleText);
  if (kind === "COIN" && bundle === NOTE_BUNDLE) return "0";
  if (kind === "NOTE" && bundle === 0) return String(NOTE_BUNDLE);
  return bundleText;
}

/** A default ledger only means something on the expense / paid-in line. */
export function ledgerMeans(category: string): boolean {
  return LEDGER_CATEGORIES.includes(category);
}

/** Fields the popup holds still for this row, beyond a read-only popup's "all". */
export function lockedFields(kind: TillMasterKind, mode: EntryMode, row: GridRow | null): readonly string[] {
  switch (kind) {
    case "counters":
      // Re-binding hardware mid-shift would orphan the drawer (the server refuses it too).
      return rowText(row, "live_session_no") ? ["deviceId", "drawerMode"] : [];
    case "reasons":
      // The category is chosen once, and the code is the key a company copy
      // overrides the shipped row by.
      return mode === "new" ? [] : ["category", "code"];
    case "denominations":
      // Currency, kind and value are what makes a copy replace the shipped row,
      // and what a count that used the row refers to.
      if (mode === "copy" || (mode === "edit" && rowBool(row, "used") && !rowBool(row, "shipped"))) {
        return ["currency", "kind", "value"];
      }
      return [];
    default:
      return [];
  }
}

/** The field the popup puts the caret in when it opens; null when nothing is editable. */
export function firstField(kind: TillMasterKind, mode: EntryMode, row: GridRow | null, readOnly: boolean): string | null {
  if (readOnly || mode === "locked") return null;
  const order: Record<TillMasterKind, readonly string[]> = {
    counters: ["code", "name"],
    safes: ["code", "name"],
    reasons: ["category", "code", "name"],
    denominations: ["currency", "kind", "value", "label"],
  };
  const locked = lockedFields(kind, mode, row);
  return order[kind].find((field) => !locked.includes(field)) ?? null;
}

// ── The popup's words ───────────────────────────────────────────────────────

export type EntryHeading = {
  title: string;
  subtitle: string;
  /** Qt's NexCrudForm: Save on a create (a copy is one), Update on an edit. */
  submitLabel: "Save" | "Update";
};

export function entryHeading(kind: TillMasterKind, row: GridRow | null, mode: EntryMode): EntryHeading {
  const submitLabel = mode === "edit" || mode === "locked" ? "Update" : "Save";
  switch (kind) {
    case "counters":
      return {
        title: row ? `Till Counter · ${rowText(row, "tcn_code")}` : "New Till Counter",
        subtitle: "The lane a till session is opened on: its device, drawer and cash limits.",
        submitLabel,
      };
    case "safes":
      return {
        title: row ? `Safe · ${rowText(row, "tsf_code")}` : "New Safe",
        subtitle: "Where drawer cash goes: drops, pickups and the close hand-over post to its ledger.",
        submitLabel,
      };
    case "reasons":
      return {
        title: mode === "new" ? "New Till Reason" : `Till Reason · ${rowText(row, "trs_code")}`,
        subtitle:
          mode === "locked"
            ? "This company has its own copy of this shipped reason — edit that row instead."
            : mode === "copy"
              ? "A shipped reason, shared by every company. Saving makes this company's own copy, which replaces it here; other companies keep the shipped one."
              : "A reason the till offers for a variance, a movement or a void.",
        submitLabel,
      };
    default:
      return {
        title: row ? `Denomination · ${rowText(row, "tdn_label")}` : "New Denomination",
        subtitle:
          mode === "locked"
            ? "This company has its own row of this value — edit that one instead."
            : mode === "copy"
              ? "A shipped denomination, shared by every company. Saving makes this company's own row, which replaces it in this company's counts."
              : "A note or coin the count grids offer.",
        submitLabel,
      };
  }
}

/** The facts line: what the grid derives, shown, never posted. */
export function entryFacts(kind: TillMasterKind, row: GridRow | null, mode: EntryMode): string {
  if (!row) return "";
  const or = (text: string) => text || "—";
  const facts: string[] = [];
  switch (kind) {
    case "counters": {
      const live = rowText(row, "live_session_no");
      if (live) facts.push(`LIVE · ${live} · ${rowText(row, "live_operator")}`);
      facts.push(`last Z ${or(rowText(row, "tcn_z_last_no"))}`);
      facts.push(`${rowInt(row, "sessions_30d")} sessions in 30 days`);
      const closed = rowText(row, "last_closed");
      if (closed) facts.push(`last closed ${closed}`);
      break;
    }
    case "safes":
      facts.push(`balance ${moneyText(row.balance)}${overInsured(row) ? " — over the insured limit" : ""}`);
      facts.push(`counters ${or(rowText(row, "counter_codes"))}`);
      facts.push(`last count ${or(rowText(row, "last_count"))}`);
      facts.push(`last remit ${or(rowText(row, "last_remit"))}`);
      break;
    case "reasons":
      if (mode === "edit" || mode === "locked") {
        const whose = rowBool(row, "shipped") ? "SHARED — shipped for every company" : "this company's own";
        facts.push(
          `${whose} · used ${rowInt(row, "used_30d")} times in 30 days (${moneyText(row.used_amount_30d)})`,
        );
      }
      break;
    default:
      break;
  }
  return facts.join("  ·  ");
}

/** The warning lines under the form, as the operator edits. */
export function entryWarnings<K extends TillMasterKind>(
  kind: K,
  form: TillForms[K],
  row: GridRow | null,
  mode: EntryMode,
): string[] {
  const warn: string[] = [];
  switch (kind) {
    case "counters": {
      const f = form as CounterForm;
      const live = rowText(row, "live_session_no");
      if (live) warn.push(`Device and drawer are locked while ${live} is live.`);
      const alert = paiseOf(f.alertLimit);
      const block = paiseOf(f.blockLimit);
      if (alert > 0 && block > 0 && block < alert) warn.push("The block limit must be at least the alert limit.");
      if (f.drawerMode === "NONE" && paiseOf(f.defaultFloat) > 0) warn.push("A cashless lane takes no float.");
      if (!f.deviceId) warn.push("No device: any device may claim it from the free list, one session at a time.");
      if (live && !f.active) warn.push("Close the live session before deactivating.");
      break;
    }
    case "safes": {
      const f = form as SafeForm;
      if (row && !f.active) {
        if (paiseOf(row.balance) !== 0) warn.push(`This safe still holds ${moneyText(row.balance)}.`);
        if (rowInt(row, "counter_count") > 0) warn.push(`Counters ${rowText(row, "counter_codes")} drop into it.`);
      }
      break;
    }
    case "reasons": {
      const f = form as ReasonForm;
      if (VOID_MODULE_CATEGORIES.includes(f.category)) {
        warn.push(`${f.category} is reserved for the void module, which is not built yet.`);
      }
      if (!ledgerMeans(f.category) && f.ledgerId) {
        warn.push("A default ledger only means something for EXPENSE and PAID_IN; it is not saved.");
      }
      break;
    }
    default:
      if (mode === "edit" && rowBool(row, "used") && !rowBool(row, "shipped")) {
        warn.push(
          "A count has used this row: its currency, kind and value are locked. Deactivate it and add a new one to change them.",
        );
      }
      break;
  }
  return warn;
}

// ── problem() — why Save refuses ───────────────────────────────────────────

export type Problem = {
  /** The form field to put the caret back in. */
  field: string;
  message: string;
};

/** Qt's order: the required fields as they stand on the form, then the cross-field rules. */
export function problemOf<K extends TillMasterKind>(kind: K, form: TillForms[K]): Problem | null {
  switch (kind) {
    case "counters": {
      const f = form as CounterForm;
      if (!f.code.trim()) return { field: "code", message: "Give the counter a code (C01, EXP1 …)." };
      if (!simplified(f.name)) return { field: "name", message: "Give the counter a name." };
      const alert = paiseOf(f.alertLimit);
      const block = paiseOf(f.blockLimit);
      if (alert < 0 || block < 0 || paiseOf(f.defaultFloat) < 0) {
        return { field: "defaultFloat", message: "Amounts cannot be negative." };
      }
      if (alert > 0 && block > 0 && block < alert) {
        return {
          field: "blockLimit",
          message: "The block limit must be at least the alert limit (or 0 to switch it off).",
        };
      }
      return null;
    }
    case "safes": {
      const f = form as SafeForm;
      if (!f.code.trim()) return { field: "code", message: "Give the safe a code (S1 …)." };
      if (!simplified(f.name)) return { field: "name", message: "Give the safe a name." };
      if (!f.ledgerId.trim()) return { field: "ledgerId", message: "Pick the cash ledger this safe posts to." };
      if (f.isDefault && !f.active) {
        return { field: "isDefault", message: "An inactive safe cannot be the branch default." };
      }
      return null;
    }
    case "reasons": {
      const f = form as ReasonForm;
      if (!f.code.trim()) return { field: "code", message: "Give the reason a code." };
      if (!simplified(f.name)) return { field: "name", message: "Give the reason a name." };
      return null;
    }
    default: {
      const f = form as DenominationForm;
      if (!f.currency.trim()) return { field: "currency", message: "The currency is a 3-letter code (INR)." };
      if (!f.value.trim()) return { field: "value", message: "Enter the face value." };
      if (!f.label.trim()) return { field: "label", message: "Give the denomination a label (₹500)." };
      if (f.currency.trim().length !== 3) {
        return { field: "currency", message: "The currency is a 3-letter code (INR)." };
      }
      if (paiseOf(f.value) <= 0) return { field: "value", message: "The value must be above zero." };
      return null;
    }
  }
}

// ── body() — what Save posts ────────────────────────────────────────────────

export type BodyContext = {
  companyId: string;
  branchId: string;
  /** The row updated; null creates (a new row, or a copy of a shipped one). */
  id: string | null;
};

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
    tcnName: simplified(form.name),
    tcnKind: form.kind,
    tcnSortOrder: toCount(form.sortOrder),
    tcnDeviceId: idOrNull(form.deviceId),
    tcnDrawerMode: form.drawerMode,
    tcnRequiresSession: form.requiresSession,
    tcnDefaultFloat: toAmount(form.defaultFloat),
    tcnSafeId: idOrNull(form.safeId),
    tcnCashAlertLimit: toAmount(form.alertLimit),
    tcnCashBlockLimit: toAmount(form.blockLimit),
    tcnIsActive: form.active,
    tcnRemarks: textOrNull(form.remarks),
  };
}

export function safeBody(form: SafeForm, { companyId, branchId, id }: BodyContext) {
  return {
    ...(id ? { tsfId: id } : {}),
    tsfCompanyId: companyId,
    tsfBranchId: branchId,
    tsfCode: form.code.trim().toUpperCase(),
    tsfName: simplified(form.name),
    // Not nullable on the DTO; the popup insists on one anyway.
    ...(form.ledgerId.trim() ? { tsfLedgerId: form.ledgerId.trim() } : {}),
    tsfInsuredLimit: toAmount(form.insuredLimit),
    tsfIsDefault: form.isDefault,
    tsfIsDropSafe: form.isDropSafe,
    tsfIsActive: form.active,
    tsfRemarks: textOrNull(form.remarks),
  };
}

export function reasonBody(form: ReasonForm, { companyId, id }: BodyContext) {
  return {
    ...(id ? { trsId: id } : {}),
    trsCompanyId: companyId,
    trsCategory: form.category,
    trsCode: form.code.trim().toUpperCase(),
    trsName: simplified(form.name),
    trsSortOrder: toCount(form.sortOrder),
    // Outside EXPENSE / PAID_IN a default ledger means nothing, and is not saved.
    trsLedgerId: ledgerMeans(form.category) ? idOrNull(form.ledgerId) : null,
    trsMaxAmount: toAmount(form.maxAmount),
    trsNeedsNote: form.needsNote,
    trsNeedsRef: form.needsRef,
    trsIsActive: form.active,
  };
}

export function denominationBody(form: DenominationForm, { companyId, id }: BodyContext) {
  return {
    ...(id ? { tdnId: id } : {}),
    tdnCompanyId: companyId,
    tdnCurrency: form.currency.trim().toUpperCase(),
    tdnKind: form.kind,
    tdnValue: toAmount(form.value),
    tdnLabel: form.label.trim(),
    tdnBundleQty: toCount(form.bundleQty),
    tdnSortOrder: toCount(form.sortOrder),
    tdnValidTo: /^\d{4}-\d{2}-\d{2}$/.test(form.validTo) ? form.validTo : null,
    tdnIsActive: form.active,
  };
}

export function bodyOf<K extends TillMasterKind>(
  kind: K,
  form: TillForms[K],
  context: BodyContext,
): Record<string, unknown> {
  switch (kind) {
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

/** What the popup's Save posts: an edit carries the row's id, a new row or a copy none. */
export function entryBody<K extends TillMasterKind>(
  kind: K,
  form: TillForms[K],
  row: GridRow | null,
  mode: EntryMode,
  scope: { companyId: string; branchId: string },
): Record<string, unknown> {
  return bodyOf(kind, form, { ...scope, id: mode === "edit" ? rowId(kind, row) || null : null });
}

// ── The list's own verbs: Active on / off, Set default ─────────────────────

export type Rights = { canCreate: boolean; canEdit: boolean };

/** Edit on a shipped row makes a new company row, so it needs CREATE (Qt isActionAllowed). */
export function canEditRow(kind: TillMasterKind, row: GridRow | null, rights: Rights): boolean {
  if (!row) return false;
  if (isShipped(kind, row) && !isReplaced(kind, row)) return rights.canCreate;
  return rights.canEdit;
}

/**
 * Active on / off: EDIT on a company row; CREATE on a shipped one (an inactive
 * company copy hides it for this company only); never on a shipped row this
 * company already replaced — its copy is the row to switch.
 */
export function canToggleRow(kind: TillMasterKind, row: GridRow | null, rights: Rights): boolean {
  if (!row) return false;
  if (isShipped(kind, row)) return !isReplaced(kind, row) && rights.canCreate;
  return rights.canEdit;
}

/** Why this row's Active flag cannot be flipped to `active` ("" = it can). */
export function toggleRefusal(kind: TillMasterKind, row: GridRow, active: boolean): string {
  if (kind === "counters" && !active) {
    // Deactivating a lane mid-shift would strand its drawer.
    const live = rowText(row, "live_session_no");
    if (live) return `${live} is live on this counter — close that session first.`;
  }
  if (isReplaced(kind, row)) {
    return kind === "reasons"
      ? "This company has its own copy of this reason — switch that row on or off instead."
      : "This company has its own row of this value — switch that one on or off instead.";
  }
  return "";
}

export function toggleWords(kind: TillMasterKind, row: GridRow, active: boolean) {
  const entity = TILL_MASTER_SPECS[kind].entity;
  const name = rowName(kind, row);
  return active
    ? { title: "Reactivate", message: `Reactivate ${entity} "${name}"?`, done: `${name} reactivated.` }
    : {
        title: "Deactivate",
        message: `Deactivate ${entity} "${name}"? It stays in history and can be reactivated.`,
        done: `${name} deactivated.`,
      };
}

/**
 * What Active on / off posts: the row as stored, Active changed. On a shipped
 * row the id is left out, so the save makes this company's (inactive) copy.
 */
export function toggleBody(
  kind: TillMasterKind,
  row: GridRow,
  active: boolean,
  scope: { companyId: string; branchId: string },
): Record<string, unknown> {
  const id = isShipped(kind, row) ? null : rowId(kind, row) || null;
  const stored = initialForm(kind, row, "edit", { nextSort: 0, firstSafe: false, category: "" });
  const next = { ...stored, active } as TillForm;
  // An inactive safe is never the default.
  if (kind === "safes" && !active) (next as SafeForm).isDefault = false;
  return bodyOf(kind, next as TillForms[typeof kind], { ...scope, id });
}

/** Set default: an active safe that is not already the branch default (EDIT right). */
export function canSetDefault(row: GridRow | null, rights: Rights): boolean {
  return Boolean(row) && rights.canEdit && rowBool(row, "tsf_is_active") && !rowBool(row, "tsf_is_default");
}

/** The safe's own save with the flag on: the server takes it off the old default. */
export function setDefaultBody(row: GridRow, scope: { companyId: string; branchId: string }): Record<string, unknown> {
  const stored = initialForm("safes", row, "edit", { nextSort: 0, firstSafe: false, category: "" });
  return safeBody({ ...stored, isDefault: true }, { ...scope, id: rowId("safes", row) || null });
}
