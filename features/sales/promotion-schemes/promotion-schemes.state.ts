/**
 * Promotion Schemes (menu 247) — the entry form as pure state: what GET
 * `/promotion-scheme/get` loads into it, what POST `/promotion-scheme/create`
 * gets back out of it, the interlocks between header and grids, and the
 * validation (one check per DB constraint, in Qt `validateAll()` order and
 * wording).
 *
 * Port of Qt `PromotionSchemeEntry` (NexERP promotion_scheme_entry.cpp).
 *
 * Grid cells hold TEXT, as NexTable cells do: a numeric cell the screen fills
 * renders 0 as blank (NexTable `DisplayFormat::Number`), and a cell is read as
 * a number only when the payload is built. Two cells are text on purpose:
 * `upto` (blank = an open-ended band) and `fixedPrice` (blank and 0 are
 * different answers to ck_prs_benefit_columns).
 *
 * Saving is ONE POST carrying the header and all four grids. An array that is
 * present replaces that grid server-side (id = update, no id = insert, missing
 * = soft delete), so a scope of ALL sends `[]` and a removed row is simply
 * absent.
 */
import { clock12FromHhmm } from "@/lib/time-format";
import {
  ITEM_SCOPES,
  PARTY_SCOPES,
  RATE_COLUMNS,
  WEEKDAYS,
  applyOnIsItemLevel,
  benefitNeedsItemTrigger,
  benefitUsesBands,
  findScope,
  type PromotionApplyOn,
  type PromotionBenefit,
  type PromotionBillType,
  type PromotionCalcOn,
  type PromotionItemKind,
  type PromotionPartyKind,
  type PromotionScope,
  type PromotionStackMode,
  type PromotionStatus,
  type RateColumn,
  type Weekday,
} from "./promotion-schemes.vocab";

// ── Shapes ────────────────────────────────────────────────────────────────

export type BranchRow = {
  key: string;
  /** prb_id — present = update that row, absent = insert. */
  rowId: string;
  branchId: string;
  branchName: string;
  exclude: boolean;
  notes: string;
};

export type PartyRow = {
  key: string;
  rowId: string;
  kind: PromotionPartyKind | "";
  /** prp_scope_id — the only id sent; the generated FK columns are never written. */
  scopeId: string;
  /** The looked-up name; belongs to no column. */
  targetName: string;
  exclude: boolean;
  priority: string;
  notes: string;
};

export type ItemRow = {
  key: string;
  rowId: string;
  kind: PromotionItemKind | "";
  scopeId: string;
  targetName: string;
  /** pri_unit_id — an iuc_id, ITEM rows only (ck_pri_unit). */
  unitId: string;
  unitName: string;
  exclude: boolean;
  discPerc: string;
  discQty: string;
  discAmt: string;
  minQty: string;
  factor: string;
  maxBenefit: string;
  priority: string;
  notes: string;
};

export type SlabRow = {
  key: string;
  rowId: string;
  benefit: string;
  exceeds: string;
  /** Blank = open-ended. */
  upto: string;
  each: string;
  isRepeat: boolean;
  maxRepeats: string;
  freeItemId: string;
  freeItemName: string;
  freeUnitId: string;
  freeUnitName: string;
  freeQty: string;
  freeStockCheck: boolean;
  discPerc: string;
  discQty: string;
  discAmt: string;
  /** Blank = no fixed price; "0" = sell it for nothing. */
  fixedPrice: string;
  maxBenefitAmt: string;
  notes: string;
};

export type SchemeHeader = {
  code: string;
  name: string;
  status: PromotionStatus;
  priority: number;
  stackMode: PromotionStackMode;
  autoApply: boolean;
  allowManualDisc: boolean;
  applyOn: PromotionApplyOn;
  benefit: PromotionBenefit;
  calcOn: PromotionCalcOn;
  billType: PromotionBillType;
  minQty: string;
  minBillAmount: string;
  /** "" = every price level. */
  priceLevelId: string;
  includeTax: boolean;
  companyId: string;
  companyName: string;
  branchScope: PromotionScope;
  custScope: PromotionScope;
  itemScope: PromotionScope;
  /** ISO yyyy-MM-dd. */
  startDate: string;
  endDate: string;
  timeWindow: boolean;
  /** 24-hour `HH:mm` (the box shows it 12-hour). */
  fromTime: string;
  toTime: string;
  weekdays: Weekday[];
  remarks: string;
  maxBenefitPerBill: string;
  budget: string;
  maxUsesTotal: string;
  maxUsesPerCust: string;
  /** No endpoint feeds a picker yet: held and posted back unchanged. */
  couponBatchId: string;
  approvedBy: string;
  approvedOn: string;
  approvedByLabel: string;
};

export type SchemeForm = {
  /** prm_id on an edit; null for a new scheme. */
  schemeId: string | null;
  header: SchemeHeader;
  branches: BranchRow[];
  parties: PartyRow[];
  items: ItemRow[];
  slabs: SlabRow[];
  /** Any user edit since the load / the last save (Qt `m_dirty`). */
  dirty: boolean;
};

export type GridName = "branches" | "parties" | "items" | "slabs";
export type SchemeTab = "scheme" | GridName;

/** One unit of an item, as `/master-lookups/units/by-item` answers (`itemUnitId` = iuc_id). */
export type ItemUnit = { id: string; name: string };

// ── Small readers ─────────────────────────────────────────────────────────

let keySeq = 0;
function nextKey(prefix: string): string {
  keySeq += 1;
  return `${prefix}-${keySeq}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value.trim() : String(value);
}

function num(source: Record<string, unknown>, key: string, fallback = 0): number {
  const value = source[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function bool(source: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = source[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true" || lowered === "1" || lowered === "y") return true;
    if (lowered === "false" || lowered === "0" || lowered === "n") return false;
  }
  return fallback;
}

/** A number as a numeric grid cell shows it: 0 renders blank (NexTable `Number`). */
export function numCell(value: number): string {
  return value === 0 || !Number.isFinite(value) ? "" : String(value);
}

/** A cell read as a number — a blank cell and a 0 both read 0. */
export function cellNumber(value: string): number {
  const parsed = Number(value.trim());
  return value.trim() && Number.isFinite(parsed) ? parsed : 0;
}

function isSet(value: number): boolean {
  return value !== 0;
}

/**
 * Whether a numeric cell may hold this text as the operator types it — Qt's
 * `QDoubleValidator(0, top, decimals)`: digits and one point, no more
 * decimals than the column keeps, never above `max`, never negative.
 */
export function acceptNumberText(next: string, decimals: number, max?: number): boolean {
  if (next === "") return true;
  const pattern = decimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`) : /^\d*$/;
  if (!pattern.test(next)) return false;
  if (max !== undefined && next !== "." && Number(next) > max) return false;
  return true;
}

function choose<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** A local Date as ISO `yyyy-MM-dd`. */
export function isoDateOf(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

// ── Times: the box is 12-hour, the wire is 24-hour ────────────────────────

/** The list's `prm_time_window` (`HH:mm - HH:mm` from the grid SQL) on the house 12-hour clock. */
export function timeWindowText(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value).trim();
  if (!raw) return "";
  const [from, to] = raw.split(" - ");
  return to === undefined ? clock12FromHhmm(raw) : `${clock12FromHhmm(from)} - ${clock12FromHhmm(to)}`;
}

/**
 * Typed text → 24-hour `HH:mm`, or null when it is not a time. Accepts
 * `10:30 PM`, `10.30pm`, `1030p`, `22:30`, `9 am`, `0930`.
 */
export function parseTime12(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return null;
  const match = /^(\d{1,2})(?:[:.]?(\d{2}))?\s*(a|p|am|pm)?$/.exec(raw.replace(/\s/g, ""));
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] === undefined ? 0 : Number(match[2]);
  const meridiem = match[3];
  if (minutes > 59) return null;
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    const pm = meridiem.startsWith("p");
    hours = (hours % 12) + (pm ? 12 : 0);
  } else if (hours > 23) {
    return null;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// ── Blank rows ────────────────────────────────────────────────────────────

export function blankBranchRow(): BranchRow {
  return { key: nextKey("prb"), rowId: "", branchId: "", branchName: "", exclude: false, notes: "" };
}

export function blankPartyRow(): PartyRow {
  return { key: nextKey("prp"), rowId: "", kind: "", scopeId: "", targetName: "", exclude: false, priority: "", notes: "" };
}

export function blankItemRow(): ItemRow {
  return {
    key: nextKey("pri"),
    rowId: "",
    kind: "",
    scopeId: "",
    targetName: "",
    unitId: "",
    unitName: "",
    exclude: false,
    discPerc: "",
    discQty: "",
    discAmt: "",
    minQty: "",
    factor: "",
    maxBenefit: "",
    priority: "",
    notes: "",
  };
}

/**
 * A new band, seeded so that what saves is what shows (Qt `seedNewSlabRow`):
 * the header's benefit, Each 1, Repeat N, Stock check Y.
 */
export function blankSlabRow(benefit: string): SlabRow {
  return {
    key: nextKey("prs"),
    rowId: "",
    benefit,
    exceeds: "",
    upto: "",
    each: "1",
    isRepeat: false,
    maxRepeats: "",
    freeItemId: "",
    freeItemName: "",
    freeUnitId: "",
    freeUnitName: "",
    freeQty: "",
    freeStockCheck: true,
    discPerc: "",
    discQty: "",
    discAmt: "",
    fixedPrice: "",
    maxBenefitAmt: "",
    notes: "",
  };
}

// ── New and loaded forms ──────────────────────────────────────────────────

export type NewSchemeContext = {
  today: Date;
  companyId: string;
  companyName: string;
};

/** Qt `seedDefaults()`. */
export function newSchemeForm(context: NewSchemeContext): SchemeForm {
  const today = isoDateOf(context.today);
  return {
    schemeId: null,
    header: {
      code: "",
      name: "",
      status: "DRAFT",
      priority: 1,
      stackMode: "EXCLUSIVE",
      autoApply: true,
      allowManualDisc: false,
      applyOn: "ITEM_QTY",
      benefit: "DISC_PERC",
      calcOn: "NET_AMOUNT",
      billType: "ALL",
      minQty: "",
      minBillAmount: "",
      priceLevelId: "",
      includeTax: false,
      companyId: context.companyId,
      companyName: context.companyName,
      branchScope: "ALL",
      custScope: "ALL",
      itemScope: "ALL",
      startDate: today,
      endDate: today,
      timeWindow: false,
      fromTime: "00:00",
      toTime: "00:00",
      weekdays: [],
      remarks: "",
      maxBenefitPerBill: "",
      budget: "",
      maxUsesTotal: "0",
      maxUsesPerCust: "0",
      couponBatchId: "",
      approvedBy: "",
      approvedOn: "",
      approvedByLabel: "—",
    },
    branches: [blankBranchRow()],
    parties: [blankPartyRow()],
    items: [blankItemRow()],
    slabs: [blankSlabRow("DISC_PERC")],
    dirty: false,
  };
}

function rows(source: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = source[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** A header number as the Qt line edit shows it (`QString::number`). */
function plain(value: number): string {
  return String(value);
}

/** GET `/promotion-scheme/get` → the form (Qt `applyHeader` + `fill*Row`). */
export function schemeFormFromPayload(data: unknown): SchemeForm {
  const d = isRecord(data) ? data : {};
  const benefit = choose(text(d, "prm_benefit"), ["FREE_ITEM", "DISC_PERC", "DISC_AMT", "FIXED_PRICE", "DISC_PER_ITEM"] as const, "DISC_PERC");
  const from = text(d, "prm_valid_from_time");
  const to = text(d, "prm_valid_to_time");
  const weekdays = text(d, "prm_valid_weekdays")
    .split(",")
    .map((day) => day.trim().toUpperCase())
    .filter((day): day is Weekday => (WEEKDAYS as readonly string[]).includes(day));
  const priceLevel = d.prm_price_level_id;

  const branches: BranchRow[] = rows(d, "branches").map((r) => ({
    key: nextKey("prb"),
    rowId: text(r, "prb_id"),
    branchId: text(r, "prb_branch_id"),
    branchName: text(r, "prb_branch_name"),
    exclude: bool(r, "prb_is_exclude"),
    notes: text(r, "prb_notes"),
  }));
  const parties: PartyRow[] = rows(d, "parties").map((r) => ({
    key: nextKey("prp"),
    rowId: text(r, "prp_id"),
    kind: choose(text(r, "prp_kind"), PARTY_SCOPES.map((s) => s.code), "CUSTOMER"),
    scopeId: text(r, "prp_scope_id"),
    targetName: text(r, "prp_scope_name"),
    exclude: bool(r, "prp_is_exclude"),
    priority: numCell(num(r, "prp_match_priority")),
    notes: text(r, "prp_notes"),
  }));
  const items: ItemRow[] = rows(d, "items").map((r) => ({
    key: nextKey("pri"),
    rowId: text(r, "pri_id"),
    kind: choose(text(r, "pri_kind"), ITEM_SCOPES.map((s) => s.code), "ITEM"),
    scopeId: text(r, "pri_scope_id"),
    targetName: text(r, "pri_scope_name"),
    unitId: text(r, "pri_unit_id"),
    unitName: text(r, "pri_unit_name"),
    exclude: bool(r, "pri_is_exclude"),
    discPerc: numCell(num(r, "pri_disc_perc")),
    discQty: numCell(num(r, "pri_disc_qty")),
    discAmt: numCell(num(r, "pri_disc_amt")),
    minQty: numCell(num(r, "pri_min_qty")),
    factor: numCell(num(r, "pri_factor")),
    maxBenefit: numCell(num(r, "pri_max_benefit")),
    priority: numCell(num(r, "pri_match_priority")),
    notes: text(r, "pri_notes"),
  }));
  const slabs: SlabRow[] = rows(d, "slabs").map((r) => {
    const fixed = r.prs_fixed_price;
    const upto = r.prs_upto;
    return {
      key: nextKey("prs"),
      rowId: text(r, "prs_id"),
      benefit: text(r, "prs_benefit") || benefit,
      exceeds: numCell(num(r, "prs_exceeds")),
      upto: upto === null || upto === undefined || upto === "" ? "" : numCell(num(r, "prs_upto")),
      each: numCell(num(r, "prs_each")),
      isRepeat: bool(r, "prs_is_repeat"),
      maxRepeats: numCell(num(r, "prs_max_repeats")),
      freeItemId: text(r, "prs_free_item_id"),
      freeItemName: text(r, "prs_free_item_name"),
      freeUnitId: text(r, "prs_free_unit_id"),
      freeUnitName: text(r, "prs_free_unit_name"),
      freeQty: numCell(num(r, "prs_free_qty")),
      freeStockCheck: bool(r, "prs_free_stock_check", true),
      discPerc: numCell(num(r, "prs_disc_perc")),
      discQty: numCell(num(r, "prs_disc_qty")),
      discAmt: numCell(num(r, "prs_disc_amt")),
      // Null and 0 are different answers: that is why this cell is text.
      fixedPrice: fixed === null || fixed === undefined || fixed === "" ? "" : String(num(r, "prs_fixed_price")),
      maxBenefitAmt: numCell(num(r, "prs_max_benefit_amt")),
      notes: text(r, "prs_notes"),
    };
  });

  return {
    schemeId: text(d, "prm_id") || null,
    header: {
      code: text(d, "prm_code"),
      name: text(d, "prm_name"),
      status: choose(text(d, "prm_status"), ["DRAFT", "APPROVED", "SUSPENDED", "CLOSED"] as const, "DRAFT"),
      priority: Math.min(9, Math.max(1, Math.trunc(num(d, "prm_priority", 1)) || 1)),
      stackMode: choose(text(d, "prm_stack_mode"), ["EXCLUSIVE", "STACKABLE"] as const, "EXCLUSIVE"),
      autoApply: bool(d, "prm_auto_apply", true),
      allowManualDisc: bool(d, "prm_allow_with_manual_disc"),
      applyOn: choose(text(d, "prm_apply_on"), ["BILL_AMOUNT", "BILL_QTY", "ITEM_AMOUNT", "ITEM_QTY"] as const, "ITEM_QTY"),
      benefit,
      calcOn: choose(text(d, "prm_calc_on_amount_type"), ["GROSS_AMOUNT", "NET_AMOUNT", "TAXABLE_AMOUNT"] as const, "NET_AMOUNT"),
      billType: choose(text(d, "prm_bill_type"), ["ALL", "CASH", "CREDIT"] as const, "ALL"),
      minQty: plain(num(d, "prm_min_qty")),
      minBillAmount: plain(num(d, "prm_min_bill_amount")),
      priceLevelId: priceLevel === null || priceLevel === undefined || priceLevel === "" ? "" : text(d, "prm_price_level_id"),
      includeTax: bool(d, "prm_include_tax"),
      companyId: text(d, "prm_comp_id"),
      companyName: text(d, "prm_comp_name"),
      branchScope: choose(text(d, "prm_branch_scope"), ["ALL", "LIST"] as const, "ALL"),
      custScope: choose(text(d, "prm_cust_scope"), ["ALL", "LIST"] as const, "ALL"),
      itemScope: choose(text(d, "prm_item_scope"), ["ALL", "LIST"] as const, "ALL"),
      startDate: text(d, "prm_start_date").slice(0, 10),
      endDate: text(d, "prm_end_date").slice(0, 10),
      timeWindow: Boolean(from && to),
      fromTime: from ? from.slice(0, 5) : "00:00",
      toTime: to ? to.slice(0, 5) : "00:00",
      weekdays: WEEKDAYS.filter((day) => weekdays.includes(day)),
      remarks: text(d, "prm_remarks"),
      maxBenefitPerBill: plain(num(d, "prm_max_benefit_per_bill")),
      budget: plain(num(d, "prm_budget_amount")),
      maxUsesTotal: String(Math.trunc(num(d, "prm_max_uses_total"))),
      maxUsesPerCust: String(Math.trunc(num(d, "prm_max_uses_per_cust"))),
      couponBatchId: text(d, "prm_coupon_batch_id"),
      approvedBy: text(d, "prm_approved_by"),
      approvedOn: text(d, "prm_approved_on"),
      approvedByLabel: text(d, "prm_approved_by_name") || "—",
    },
    // Every grid keeps its trailing "type here to add" row.
    branches: [...branches, blankBranchRow()],
    parties: [...parties, blankPartyRow()],
    items: [...items, blankItemRow()],
    slabs: [...slabs, blankSlabRow(benefit)],
    dirty: false,
  };
}

/** Rows above the trailing blank one (Qt `realRowCount`). */
export function realRowCount(list: readonly unknown[]): number {
  return Math.max(0, list.length - 1);
}

// ── The payload (Qt collectHeader / collect*) ─────────────────────────────

export type SaveContext = { userName: string };

function orNull(value: string): string | null {
  return value ? value : null;
}

export function buildSavePayload(form: SchemeForm, context: SaveContext): Record<string, unknown> {
  const h = form.header;
  const editing = Boolean(form.schemeId);
  const user = context.userName;
  const body: Record<string, unknown> = {};

  if (editing) body.prm_id = form.schemeId;
  body.prm_comp_id = h.companyId;
  body.prm_code = h.code.trim();
  body.prm_name = h.name.trim();
  body.prm_status = h.status;
  body.prm_apply_on = h.applyOn;
  body.prm_benefit = h.benefit;
  body.prm_priority = h.priority;
  body.prm_stack_mode = h.stackMode;
  body.prm_auto_apply = h.autoApply;
  body.prm_allow_with_manual_disc = h.allowManualDisc;
  body.prm_calc_on_amount_type = h.calcOn;
  body.prm_include_tax = h.includeTax;
  body.prm_bill_type = h.billType;
  body.prm_min_bill_amount = cellNumber(h.minBillAmount);
  body.prm_min_qty = cellNumber(h.minQty);
  body.prm_branch_scope = h.branchScope;
  body.prm_cust_scope = h.custScope;
  body.prm_item_scope = h.itemScope;
  // Sent only when chosen, as Qt does — "(every price level)" sends no key.
  if (h.priceLevelId) body.prm_price_level_id = Math.trunc(Number(h.priceLevelId));
  body.prm_max_benefit_per_bill = cellNumber(h.maxBenefitPerBill);
  body.prm_max_uses_total = Math.trunc(cellNumber(h.maxUsesTotal));
  body.prm_max_uses_per_cust = Math.trunc(cellNumber(h.maxUsesPerCust));
  body.prm_budget_amount = cellNumber(h.budget);
  // Held and echoed back untouched — dropping it would un-gate a coupon-only campaign.
  body.prm_coupon_batch_id = orNull(h.couponBatchId);
  body.prm_start_date = h.startDate;
  body.prm_end_date = h.endDate;
  // ck_prm_time_pair — both or neither.
  if (h.timeWindow) {
    body.prm_valid_from_time = `${h.fromTime}:00`;
    body.prm_valid_to_time = `${h.toTime}:00`;
  } else {
    body.prm_valid_from_time = null;
    body.prm_valid_to_time = null;
  }
  const days = WEEKDAYS.filter((day) => h.weekdays.includes(day));
  body.prm_valid_weekdays = days.length > 0 ? days.join(",") : null;
  body.prm_remarks = h.remarks.trim();
  body.prm_is_active = true;
  if (editing) body.prm_modified_by = user;
  else body.prm_created_by = user;
  if (h.approvedBy) {
    body.prm_approved_by = h.approvedBy;
    body.prm_approved_on = orNull(h.approvedOn);
  }

  body.branches = collectBranches(form, user);
  body.parties = collectParties(form, user);
  body.items = collectItems(form, user);
  body.slabs = collectSlabs(form, user);
  return body;
}

function stamp(row: Record<string, unknown>, prefix: string, rowId: string, user: string): Record<string, unknown> {
  row[rowId ? `${prefix}_modified_by` : `${prefix}_created_by`] = user;
  return row;
}

function collectBranches(form: SchemeForm, user: string): Record<string, unknown>[] {
  // ALL sends [] — present, so the server clears the grid.
  if (form.header.branchScope !== "LIST") return [];
  const out: Record<string, unknown>[] = [];
  for (const r of form.branches) {
    if (!r.branchId.trim()) continue;
    const row: Record<string, unknown> = {};
    if (r.rowId) row.prb_id = r.rowId;
    row.prb_slno = out.length + 1;
    row.prb_branch_id = r.branchId;
    row.prb_is_exclude = r.exclude;
    row.prb_notes = r.notes.trim();
    row.prb_is_active = true;
    out.push(stamp(row, "prb", r.rowId, user));
  }
  return out;
}

function collectParties(form: SchemeForm, user: string): Record<string, unknown>[] {
  if (form.header.custScope !== "LIST") return [];
  const out: Record<string, unknown>[] = [];
  for (const r of form.parties) {
    if (!r.scopeId.trim()) continue;
    const row: Record<string, unknown> = {};
    if (r.rowId) row.prp_id = r.rowId;
    row.prp_slno = out.length + 1;
    // Two columns and nothing else — prp_cust_id & co. are GENERATED.
    row.prp_kind = r.kind;
    row.prp_scope_id = r.scopeId;
    row.prp_is_exclude = r.exclude;
    row.prp_match_priority = Math.trunc(cellNumber(r.priority));
    row.prp_notes = r.notes.trim();
    row.prp_is_active = true;
    out.push(stamp(row, "prp", r.rowId, user));
  }
  return out;
}

function collectItems(form: SchemeForm, user: string): Record<string, unknown>[] {
  if (form.header.itemScope !== "LIST") return [];
  const out: Record<string, unknown>[] = [];
  for (const r of form.items) {
    if (!r.scopeId.trim()) continue;
    const row: Record<string, unknown> = {};
    if (r.rowId) row.pri_id = r.rowId;
    row.pri_slno = out.length + 1;
    row.pri_kind = r.kind;
    row.pri_scope_id = r.scopeId;
    // ck_pri_unit — null on every kind but ITEM.
    row.pri_unit_id = orNull(r.unitId);
    row.pri_is_exclude = r.exclude;
    row.pri_disc_perc = cellNumber(r.discPerc);
    row.pri_disc_qty = cellNumber(r.discQty);
    row.pri_disc_amt = cellNumber(r.discAmt);
    row.pri_min_qty = cellNumber(r.minQty);
    // ck_pri_values wants factor > 0 strictly; the column's default is 1.
    const factor = cellNumber(r.factor);
    row.pri_factor = isSet(factor) ? factor : 1;
    row.pri_max_benefit = cellNumber(r.maxBenefit);
    row.pri_match_priority = Math.trunc(cellNumber(r.priority));
    row.pri_notes = r.notes.trim();
    row.pri_is_active = true;
    out.push(stamp(row, "pri", r.rowId, user));
  }
  return out;
}

/**
 * A band with nothing in it is skipped. Qt's test leaves out Rs/Qty, which
 * drops a DISC_AMT band of "from 0, Rs/Qty 3" at save; it is in here.
 */
export function slabIsBlank(r: SlabRow): boolean {
  return !r.exceeds.trim() && !r.freeItemId && !r.discPerc.trim() && !r.discQty.trim() && !r.discAmt.trim() && !r.fixedPrice.trim();
}

function collectSlabs(form: SchemeForm, user: string): Record<string, unknown>[] {
  // Present-but-empty for DISC_PER_ITEM: it clears any band the scheme carried.
  const benefit = form.header.benefit;
  if (!benefitUsesBands(benefit)) return [];
  const out: Record<string, unknown>[] = [];
  for (const r of form.slabs) {
    if (slabIsBlank(r)) continue;
    const row: Record<string, unknown> = {};
    if (r.rowId) row.prs_id = r.rowId;
    row.prs_slno = out.length + 1;
    row.prs_benefit = benefit;
    row.prs_exceeds = cellNumber(r.exceeds);
    // A blank ceiling is an OPEN-ENDED band, not a zero one.
    row.prs_upto = r.upto.trim() ? cellNumber(r.upto) : null;
    const each = cellNumber(r.each);
    row.prs_each = isSet(each) ? each : 1;
    row.prs_is_repeat = r.isRepeat;
    row.prs_max_repeats = r.isRepeat ? Math.trunc(cellNumber(r.maxRepeats)) : 0;
    row.prs_free_item_id = orNull(r.freeItemId);
    row.prs_free_unit_id = orNull(r.freeUnitId);
    row.prs_free_qty = cellNumber(r.freeQty);
    row.prs_free_stock_check = r.freeStockCheck;
    row.prs_disc_perc = cellNumber(r.discPerc);
    row.prs_disc_qty = cellNumber(r.discQty);
    row.prs_disc_amt = cellNumber(r.discAmt);
    row.prs_fixed_price = r.fixedPrice.trim() ? cellNumber(r.fixedPrice) : null;
    row.prs_max_benefit_amt = cellNumber(r.maxBenefitAmt);
    row.prs_notes = r.notes.trim();
    row.prs_is_active = true;
    out.push(stamp(row, "prs", r.rowId, user));
  }
  return out;
}

// ── Validation (Qt validateAll, same order, same words) ───────────────────

export type SchemeProblem = {
  tab: SchemeTab;
  /** A header field to focus, or a grid cell. */
  field?: keyof SchemeHeader;
  row?: number;
  column?: string;
  title: string;
  message: string;
};

const CODE_SHAPE = /^[A-Za-z0-9_-]+$/;

export function validateScheme(
  form: SchemeForm,
  unitsFor: (itemId: string) => readonly ItemUnit[] | undefined,
): SchemeProblem | null {
  const h = form.header;
  const code = h.code.trim();
  if (!code || !CODE_SHAPE.test(code)) {
    return { tab: "scheme", field: "code", title: "Code", message: "The code must be letters, digits, hyphen or underscore — no spaces." };
  }
  if (!h.name.trim()) {
    return { tab: "scheme", field: "name", title: "Name", message: "Enter a scheme name." };
  }
  if (!h.companyId) {
    return { tab: "scheme", field: "companyId", title: "Company", message: "Choose the company." };
  }
  if (!h.startDate || !h.endDate) {
    return { tab: "scheme", field: h.startDate ? "endDate" : "startDate", title: "Dates", message: "Enter both dates." };
  }
  // ck_prm_dates. There is deliberately no "to after from" time rule: a window
  // that ends before it starts spans midnight.
  if (h.endDate < h.startDate) {
    return { tab: "scheme", field: "endDate", title: "Dates", message: "The end date cannot be before the start date." };
  }
  if (benefitNeedsItemTrigger(h.benefit) && !applyOnIsItemLevel(h.applyOn)) {
    return {
      tab: "scheme",
      field: "applyOn",
      title: "Trigger",
      message: `A ${h.benefit} benefit needs an ITEM_QTY or ITEM_AMOUNT trigger.`,
    };
  }
  if (h.status === "APPROVED" && !h.approvedBy) {
    return { tab: "scheme", field: "status", title: "Approval", message: "An approved scheme needs an approver on record." };
  }

  // ── Branches ──
  if (h.branchScope === "LIST") {
    if (realRowCount(form.branches) === 0) {
      return { tab: "branches", row: 0, column: "branch", title: "Branches", message: "Branch scope is LIST, so name at least one branch." };
    }
    const seen = new Set<string>(); // ux_prb_row
    for (const [index, r] of form.branches.entries()) {
      if (!r.branchId) continue;
      if (seen.has(r.branchId)) {
        return { tab: "branches", row: index, column: "branch", title: "Branches", message: `Row ${index + 1} repeats a branch already on the list.` };
      }
      seen.add(r.branchId);
    }
  }

  // ── Customers ──
  if (h.custScope === "LIST") {
    if (realRowCount(form.parties) === 0) {
      return { tab: "parties", row: 0, column: "kind", title: "Customers", message: "Customer scope is LIST, so name at least one target." };
    }
    const seen = new Set<string>(); // ux_prp_row
    for (const [index, r] of form.parties.entries()) {
      if (!r.scopeId) continue;
      if (!r.kind) {
        return { tab: "parties", row: index, column: "kind", title: "Customers", message: `Row ${index + 1} has a target but no kind.` };
      }
      const key = `${r.kind}|${r.scopeId}`;
      if (seen.has(key)) {
        return { tab: "parties", row: index, column: "target", title: "Customers", message: `Row ${index + 1} repeats a target already on the list.` };
      }
      seen.add(key);
    }
  }

  // ── Items ──
  if (h.itemScope === "LIST") {
    if (realRowCount(form.items) === 0) {
      return { tab: "items", row: 0, column: "kind", title: "Items", message: "Item scope is LIST, so name at least one item rule." };
    }
    const seen = new Set<string>(); // ux_pri_row
    for (const [index, r] of form.items.entries()) {
      if (!r.scopeId) continue;
      const n = index + 1;
      if (!r.kind) {
        return { tab: "items", row: index, column: "kind", title: "Items", message: `Row ${n} has a target but no kind.` };
      }
      // ck_pri_unit, both directions.
      const hasUnit = Boolean(r.unitId);
      if (r.kind === "ITEM" && !hasUnit) {
        return {
          tab: "items",
          row: index,
          column: "unit",
          title: "Items",
          message: `Row ${n} is an ITEM rule, so it needs a unit — ten of an item is not a quantity until you say ten of what.`,
        };
      }
      if (r.kind !== "ITEM" && hasUnit) {
        return {
          tab: "items",
          row: index,
          column: "unit",
          title: "Items",
          message: `Row ${n} is a ${r.kind} rule, which cannot carry a unit — a unit belongs to one item, not to a group.`,
        };
      }
      // ck_pri_one_rate
      const rates = RATE_COLUMNS.filter((column) => isSet(cellNumber(r[column]))).length;
      if (rates > 1) {
        return {
          tab: "items",
          row: index,
          column: "discPerc",
          title: "Items",
          message: `Row ${n} carries more than one rate. Use Disc %, Rs/Qty or Disc Amt — never two at once.`,
        };
      }
      const factor = cellNumber(r.factor);
      // ck_pri_exclude
      if (r.exclude && (rates > 0 || (isSet(factor) && factor !== 1))) {
        return {
          tab: "items",
          row: index,
          column: "exclude",
          title: "Items",
          message: `Row ${n} is an EXCLUDE rule, so it must give nothing — clear its rates and leave the factor at 1.`,
        };
      }
      // ck_pri_values — factor > 0 strictly.
      if (isSet(factor) && factor <= 0) {
        return { tab: "items", row: index, column: "factor", title: "Items", message: `Row ${n} needs a factor greater than zero.` };
      }
      // A unit must belong to its own item (nothing enforces it server-side).
      // Skipped while that item's units are not known yet.
      if (r.kind === "ITEM") {
        const units = unitsFor(r.scopeId);
        if (units && units.length > 0 && !units.some((unit) => unit.id === r.unitId)) {
          return { tab: "items", row: index, column: "unit", title: "Items", message: `Row ${n}'s unit does not belong to that item.` };
        }
      }
      const key = `${r.kind}|${r.scopeId}`;
      if (seen.has(key)) {
        return { tab: "items", row: index, column: "target", title: "Items", message: `Row ${n} repeats a target already on the list.` };
      }
      seen.add(key);
    }
  }

  // ── Offer bands ──
  if (!benefitUsesBands(h.benefit)) {
    // No bands — so the offer has to be on an item row, or it gives nothing.
    const paying = (r: ItemRow) => Boolean(r.scopeId) && !r.exclude && RATE_COLUMNS.some((c) => isSet(cellNumber(r[c])));
    if (!form.items.some(paying)) {
      return {
        tab: "items",
        row: 0,
        column: "discPerc",
        title: "Items",
        message: "A per-item discount scheme states its rate on the item rows, and none of them carries one — the scheme would give nothing.",
      };
    }
    // With no band to gate it, Min Qty is the floor (both of them).
    if (cellNumber(h.minQty) <= 0) {
      return {
        tab: "scheme",
        field: "minQty",
        title: "Min Qty",
        message:
          "A per-item discount has no offer band to gate it, so Min Qty is the only thing that does — set it above zero, or the scheme discounts the very first unit sold.",
      };
    }
    for (const [index, r] of form.items.entries()) {
      if (!paying(r)) continue;
      if (cellNumber(r.minQty) <= 0) {
        return {
          tab: "items",
          row: index,
          column: "minQty",
          title: "Items",
          message: `Row ${index + 1} carries a rate but no Min Qty. On a per-item discount that floor is what the offer is bought with — set it above zero.`,
        };
      }
    }
    return null;
  }

  const seen = new Set<string>(); // ux_prs_band
  const last = form.slabs.length - 1;
  for (const [index, r] of form.slabs.entries()) {
    if (index === last && !r.exceeds.trim() && !r.freeItemId) continue;
    const n = index + 1;
    const exceeds = cellNumber(r.exceeds);
    const hasFree = Boolean(r.freeItemId);
    const discPerc = cellNumber(r.discPerc);
    const discQty = cellNumber(r.discQty);
    const discAmt = cellNumber(r.discAmt);
    const fixed = r.fixedPrice.trim();
    const upto = r.upto.trim();
    const empty =
      !isSet(exceeds) && !upto && !hasFree && !isSet(discPerc) && !isSet(discQty) && !isSet(discAmt) && !fixed;
    if (empty) continue;

    // ck_prs_band
    if (upto && cellNumber(upto) <= exceeds) {
      return { tab: "slabs", row: index, column: "upto", title: "Offer bands", message: `Band ${n}'s ceiling must be above its floor.` };
    }
    // ck_prs_each
    const each = cellNumber(r.each);
    if (isSet(each) && each <= 0) {
      return { tab: "slabs", row: index, column: "each", title: "Offer bands", message: `Band ${n}'s "each" must be greater than zero.` };
    }
    if (!r.isRepeat && isSet(cellNumber(r.maxRepeats))) {
      return { tab: "slabs", row: index, column: "maxRepeats", title: "Offer bands", message: `Band ${n} sets a repeat limit but does not repeat.` };
    }
    // ck_prs_benefit_columns, per benefit.
    if (h.benefit === "FREE_ITEM") {
      if (!hasFree || !isSet(cellNumber(r.freeQty))) {
        return { tab: "slabs", row: index, column: "freeItem", title: "Offer bands", message: `Band ${n} must name a free item and a quantity.` };
      }
    } else if (h.benefit === "DISC_PERC") {
      if (!isSet(discPerc)) {
        return { tab: "slabs", row: index, column: "discPerc", title: "Offer bands", message: `Band ${n} needs a percentage.` };
      }
    } else if (h.benefit === "DISC_AMT") {
      // An XOR: both set and neither set both fail.
      if (isSet(discAmt) === isSet(discQty)) {
        return {
          tab: "slabs",
          row: index,
          column: "discAmt",
          title: "Offer bands",
          message: `Band ${n} needs exactly one of Disc Amt or Rs/Qty — one or the other, never both and never neither.`,
        };
      }
    } else if (h.benefit === "FIXED_PRICE") {
      if (!fixed) {
        return { tab: "slabs", row: index, column: "fixedPrice", title: "Offer bands", message: `Band ${n} needs a fixed price.` };
      }
    }
    // ck_prs_free_unit_pair
    if (hasFree !== Boolean(r.freeUnitId)) {
      return {
        tab: "slabs",
        row: index,
        column: "freeUnit",
        title: "Offer bands",
        message: `Band ${n} must set the free item and its unit together.`,
      };
    }
    const key = `${exceeds.toFixed(3)}|${r.freeItemId}`;
    if (seen.has(key)) {
      return {
        tab: "slabs",
        row: index,
        column: "exceeds",
        title: "Offer bands",
        message: `Band ${n} starts where another band for the same free item already starts.`,
      };
    }
    seen.add(key);
  }
  return null;
}

// ── The reducer: every user edit and its interlocks ───────────────────────

export type ApproverContext = { userId: string; userName: string; nowIso: string; todayLabel: string };

export type SchemeAction =
  | { type: "load"; form: SchemeForm }
  | { type: "saved" }
  | { type: "header"; patch: Partial<SchemeHeader> }
  | { type: "applyOn"; applyOn: PromotionApplyOn }
  | { type: "benefit"; benefit: PromotionBenefit }
  | { type: "status"; status: PromotionStatus; approver: ApproverContext | null }
  | { type: "branchPicked"; index: number; branchId: string; branchName: string }
  | { type: "branchEdit"; index: number; patch: Partial<Pick<BranchRow, "exclude" | "notes">> }
  | { type: "partyKind"; index: number; kind: PromotionPartyKind }
  | { type: "partyPicked"; index: number; scopeId: string; name: string }
  | { type: "partyEdit"; index: number; patch: Partial<Pick<PartyRow, "exclude" | "priority" | "notes">> }
  | { type: "itemKind"; index: number; kind: PromotionItemKind }
  | { type: "itemPicked"; index: number; scopeId: string; name: string; unitId: string; unitName: string }
  | { type: "itemEdit"; index: number; field: ItemEditField; value: string | boolean }
  | { type: "itemUnit"; index: number; unitId: string; unitName: string }
  | { type: "slabEdit"; index: number; field: SlabEditField; value: string | boolean }
  | { type: "slabFreeItem"; index: number; itemId: string; itemName: string; unitId: string; unitName: string }
  | { type: "slabFreeUnit"; index: number; unitId: string; unitName: string }
  | { type: "removeRow"; grid: GridName; index: number };

export type ItemEditField = "exclude" | RateColumn | "minQty" | "factor" | "maxBenefit" | "priority" | "notes";
export type SlabEditField =
  | "exceeds"
  | "upto"
  | "each"
  | "isRepeat"
  | "maxRepeats"
  | "freeQty"
  | "freeStockCheck"
  | RateColumn
  | "fixedPrice"
  | "maxBenefitAmt"
  | "notes";

/** Qt `appendBlankRowIfNeeded`: an edit on the trailing row grows the grid by one. */
function grow<T>(list: T[], index: number, blank: () => T): T[] {
  return index === list.length - 1 ? [...list, blank()] : list;
}

function replaceAt<T>(list: readonly T[], index: number, next: T): T[] {
  const copy = list.slice();
  copy[index] = next;
  return copy;
}

/** Whether a benefit forces the trigger back to ITEM_QTY (ck_prm_fixed_price_scope). */
export function triggerRefused(benefit: string, applyOn: string): boolean {
  return benefitNeedsItemTrigger(benefit) && !applyOnIsItemLevel(applyOn);
}

/**
 * A kind change on a scope row (Qt `onScopeKindEdited`): the id belongs to the
 * old kind's master, so it goes (the screen has already asked); leaving ITEM
 * drops the unit; the priority is reseeded unless the operator typed their own.
 */
function rekind<R extends PartyRow | ItemRow>(
  row: R,
  kind: string,
  table: readonly { code: string; defaultPriority: number }[],
): R {
  if (row.kind === kind) return row;
  const previous = findScope(table as never, row.kind) as { defaultPriority: number } | null;
  const scope = findScope(table as never, kind) as { defaultPriority: number } | null;
  const next = { ...row, kind, scopeId: "", targetName: "" } as R;
  if ("unitId" in next && kind !== "ITEM") {
    (next as ItemRow).unitId = "";
    (next as ItemRow).unitName = "";
  }
  if (scope) {
    const current = Math.trunc(cellNumber(row.priority));
    const untouched = !previous || current === previous.defaultPriority;
    if (untouched) next.priority = numCell(scope.defaultPriority);
  }
  return next;
}

function editItem(row: ItemRow, field: ItemEditField, value: string | boolean): ItemRow {
  if (field === "exclude") {
    const exclude = value === true;
    // ck_pri_exclude — an exclusion gives nothing.
    return exclude ? { ...row, exclude, discPerc: "", discQty: "", discAmt: "", factor: "1" } : { ...row, exclude };
  }
  const next = { ...row, [field]: String(value) } as ItemRow;
  // ck_pri_one_rate — typing one rate clears the other two.
  if ((RATE_COLUMNS as readonly string[]).includes(field)) {
    for (const other of RATE_COLUMNS) {
      if (other !== field) next[other] = "";
    }
  }
  return next;
}

function editSlab(row: SlabRow, field: SlabEditField, value: string | boolean, benefit: string): SlabRow {
  const next = { ...row, [field]: typeof value === "boolean" ? value : String(value) } as SlabRow;
  // ck_prs_each — max repeats means nothing unless the band repeats.
  if (field === "isRepeat" && value !== true) next.maxRepeats = "";
  // DISC_AMT is an XOR of the flat amount and the per-unit one.
  if (field === "discAmt") next.discQty = "";
  else if (field === "discQty") next.discAmt = "";
  // Every band mirrors the header's benefit (fk_prs_scheme_benefit).
  next.benefit = benefit;
  return next;
}

export function schemeReducer(form: SchemeForm, action: SchemeAction): SchemeForm {
  const h = form.header;
  switch (action.type) {
    case "load":
      return action.form;
    case "saved":
      return { ...form, dirty: false };
    case "header":
      return { ...form, header: { ...h, ...action.patch }, dirty: true };
    case "applyOn": {
      const applyOn = triggerRefused(h.benefit, action.applyOn) ? "ITEM_QTY" : action.applyOn;
      return { ...form, header: { ...h, applyOn }, dirty: true };
    }
    case "benefit": {
      if (action.benefit === h.benefit) return form;
      // The screen has asked before clearing bands; a band's benefit is locked to the header's.
      const slabs = realRowCount(form.slabs) > 0 ? [blankSlabRow(action.benefit)] : form.slabs.map((r) => ({ ...r, benefit: action.benefit }));
      const applyOn = triggerRefused(action.benefit, h.applyOn) ? "ITEM_QTY" : h.applyOn;
      return { ...form, header: { ...h, benefit: action.benefit, applyOn }, slabs, dirty: true };
    }
    case "status": {
      // ck_prm_approved — APPROVED stamps the signed-in user as approver.
      if (action.status === "APPROVED") {
        if (!action.approver) return { ...form, header: { ...h, status: "DRAFT" }, dirty: true };
        const { userId, userName, nowIso, todayLabel } = action.approver;
        return {
          ...form,
          header: { ...h, status: "APPROVED", approvedBy: userId, approvedOn: nowIso, approvedByLabel: `${userName} · ${todayLabel}` },
          dirty: true,
        };
      }
      return { ...form, header: { ...h, status: action.status, approvedBy: "", approvedOn: "", approvedByLabel: "—" }, dirty: true };
    }
    case "branchPicked": {
      const row = form.branches[action.index];
      if (!row) return form;
      const branches = replaceAt(form.branches, action.index, { ...row, branchId: action.branchId, branchName: action.branchName });
      return { ...form, branches: grow(branches, action.index, blankBranchRow), dirty: true };
    }
    case "branchEdit": {
      const row = form.branches[action.index];
      if (!row) return form;
      const branches = replaceAt(form.branches, action.index, { ...row, ...action.patch });
      return { ...form, branches: grow(branches, action.index, blankBranchRow), dirty: true };
    }
    case "partyKind": {
      const row = form.parties[action.index];
      if (!row || row.kind === action.kind) return form;
      return { ...form, parties: replaceAt(form.parties, action.index, rekind(row, action.kind, PARTY_SCOPES)), dirty: true };
    }
    case "partyPicked": {
      const row = form.parties[action.index];
      if (!row || !action.scopeId) return form;
      const parties = replaceAt(form.parties, action.index, { ...row, scopeId: action.scopeId, targetName: action.name });
      return { ...form, parties: grow(parties, action.index, blankPartyRow), dirty: true };
    }
    case "partyEdit": {
      const row = form.parties[action.index];
      if (!row) return form;
      const parties = replaceAt(form.parties, action.index, { ...row, ...action.patch });
      return { ...form, parties: grow(parties, action.index, blankPartyRow), dirty: true };
    }
    case "itemKind": {
      const row = form.items[action.index];
      if (!row || row.kind === action.kind) return form;
      return { ...form, items: replaceAt(form.items, action.index, rekind(row, action.kind, ITEM_SCOPES)), dirty: true };
    }
    case "itemPicked": {
      const row = form.items[action.index];
      if (!row || !action.scopeId) return form;
      const isItem = row.kind === "ITEM";
      const next: ItemRow = {
        ...row,
        scopeId: action.scopeId,
        targetName: action.name,
        unitId: isItem ? action.unitId : row.unitId,
        unitName: isItem ? action.unitName : row.unitName,
      };
      return { ...form, items: grow(replaceAt(form.items, action.index, next), action.index, blankItemRow), dirty: true };
    }
    case "itemEdit": {
      const row = form.items[action.index];
      if (!row) return form;
      const items = replaceAt(form.items, action.index, editItem(row, action.field, action.value));
      return { ...form, items: grow(items, action.index, blankItemRow), dirty: true };
    }
    case "itemUnit": {
      const row = form.items[action.index];
      if (!row) return form;
      const items = replaceAt(form.items, action.index, { ...row, unitId: action.unitId, unitName: action.unitName });
      return { ...form, items: grow(items, action.index, blankItemRow), dirty: true };
    }
    case "slabEdit": {
      const row = form.slabs[action.index];
      if (!row) return form;
      const slabs = replaceAt(form.slabs, action.index, editSlab(row, action.field, action.value, h.benefit));
      return { ...form, slabs: grow(slabs, action.index, () => blankSlabRow(h.benefit)), dirty: true };
    }
    case "slabFreeItem": {
      const row = form.slabs[action.index];
      if (!row) return form;
      // ck_prs_free_unit_pair — the picker's own default unit fills both at once.
      const next: SlabRow = {
        ...row,
        benefit: h.benefit,
        freeItemId: action.itemId,
        freeItemName: action.itemName,
        freeUnitId: action.unitId,
        freeUnitName: action.unitName,
      };
      return { ...form, slabs: grow(replaceAt(form.slabs, action.index, next), action.index, () => blankSlabRow(h.benefit)), dirty: true };
    }
    case "slabFreeUnit": {
      const row = form.slabs[action.index];
      if (!row) return form;
      const slabs = replaceAt(form.slabs, action.index, { ...row, benefit: h.benefit, freeUnitId: action.unitId, freeUnitName: action.unitName });
      return { ...form, slabs: grow(slabs, action.index, () => blankSlabRow(h.benefit)), dirty: true };
    }
    case "removeRow": {
      const list = form[action.grid] as unknown[];
      // The trailing blank row is the "type here to add" affordance, not data.
      if (action.index < 0 || action.index >= list.length - 1) return form;
      const kept = list.filter((_, index) => index !== action.index);
      return { ...form, [action.grid]: kept, dirty: true };
    }
    default:
      return form;
  }
}
