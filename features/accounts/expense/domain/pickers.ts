/**
 * What the pick lists offer, read out of the server's rows: the reason and
 * ledger popups (grids 155 / 156), the GST rates, the states, and the
 * tenders. Pure; the screen fetches, these decide.
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { isTenderUsable, typeDefaultsOf } from "@/features/sales/sale-order/tender/rows";
import type {
  ExpenseHeaderDraft,
  ExpenseLedgerPick,
  ExpenseRateOption,
  ExpenseReasonPick,
  ExpenseTenderDraft,
  ExpenseTenderOption,
} from "../expense.types";

type Json = Record<string, unknown>;

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * A grid 155 "POPUP - EXPENSE REASONS" row, or null for a row with no id.
 * The SQL already blanks `trs_ledger_id` when the ledger is deleted, and
 * `led_tax_id` / `tax_name` / `led_hsn_sac` are the ledger's own.
 */
export function readReasonPick(row: Json): ExpenseReasonPick | null {
  const reasonId = text(row.trs_id);
  if (!reasonId) {
    return null;
  }
  const ledgerId = text(row.trs_ledger_id);
  return {
    reasonId,
    name: text(row.trs_name),
    ledgerId,
    ledgerName: ledgerId ? text(row.ledger_name) : "",
    taxId: ledgerId ? text(row.led_tax_id) : "",
    taxName: ledgerId ? text(row.tax_name) : "",
    hsn: ledgerId ? text(row.led_hsn_sac) : "",
  };
}

/** A grid 156 "POPUP - EXPENSE LEDGERS" row, or null for a row with no id. */
export function readLedgerPick(row: Json): ExpenseLedgerPick | null {
  const ledgerId = text(row.led_id);
  if (!ledgerId) {
    return null;
  }
  return {
    ledgerId,
    name: text(row.led_name),
    taxId: text(row.led_tax_id),
    taxName: text(row.tax_name),
    hsn: text(row.led_hsn_sac),
  };
}

/** Grid 155's rows → reason id → name: a loaded voucher's GET carries only the id. */
export function reasonNamesFromRows(rows: readonly Json[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const row of rows) {
    const id = text(row.trs_id);
    if (id) {
      names.set(id, text(row.trs_name));
    }
  }
  return names;
}

/** What the Reason cell shows: the picked name, the list's name for a saved id, or Qt's "(saved reason)". */
export function reasonLabel(line: { reasonId: string; reasonName: string }, names: ReadonlyMap<string, string>): string {
  if (!line.reasonId) {
    return "";
  }
  return line.reasonName || names.get(line.reasonId) || "(saved reason)";
}

/** `/vouchers/tax-rates` `rates[]` → the GST cell's choices. */
export function rateOptions(rates: readonly { taxId?: unknown; name?: unknown }[] | undefined): ExpenseRateOption[] {
  return (rates ?? [])
    .map((rate) => ({ taxId: text(rate.taxId), name: text(rate.name) }))
    .filter((rate) => rate.taxId !== "");
}

/** Dropdown 21 "GST - STATE CODES" rows → code → name. */
export function stateNamesFromRows(rows: readonly Json[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const row of rows) {
    const code = text(row.state_code);
    if (code) {
      names.set(code, text(row.state_name));
    }
  }
  return names;
}

/** "33" from a GSTIN that starts with a state code; "" otherwise. */
export function stateOfGstin(gstin: string): string {
  const trimmed = (gstin ?? "").trim();
  return /^\d{2}/.test(trimmed) ? trimmed.slice(0, 2) : "";
}

/**
 * The place of supply the voucher carries: the operator's pick, else the
 * GSTIN's state (Qt `autoPlaceOfSupply`). Blank when neither says.
 */
export function placeOfSupplyOf(header: Pick<ExpenseHeaderDraft, "placeOfSupply" | "placeOfSupplyPicked" | "supplierGstin">): string {
  return header.placeOfSupplyPicked ? header.placeOfSupply.trim() : stateOfGstin(header.supplierGstin);
}

/** How a state shows in the dropdown: "33 - Tamil Nadu", or the bare code before the names load. */
export function stateLabel(code: string, names: ReadonlyMap<string, string>): string {
  const name = names.get(code);
  return name ? `${code} - ${name}` : code;
}

/** The tender TYPES an expense may go out on. A cheque is a bill-wise Payment's. */
const EXPENSE_TENDER_CODES: ReadonlySet<string> = new Set(["CASH", "BANK", "UPI"]);

function typeCodeOf(master: TenderMasterRow): string {
  const named = text(master.tndTypeName).trim().toUpperCase();
  if (EXPENSE_TENDER_CODES.has(named)) {
    return named;
  }
  return typeDefaultsOf(Number.parseInt(master.tndTypeId, 10) || 0).code;
}

/**
 * The tenders offered on a voucher dated `onDate`: live on that date, of type
 * CASH, BANK or UPI, in display order (Qt `loadPickers`).
 *
 * Also kept to the voucher's company and branch — a deliberate addition: the
 * server 400s a tender of another company, or one pinned to another branch,
 * outright (`normalisePaymentTenders`), so offering one only buys an error.
 */
export function expenseTenderOptions(
  masters: readonly TenderMasterRow[],
  onDate: string,
  companyId: string,
  branchId: string,
): ExpenseTenderOption[] {
  return masters
    .filter((master) => isTenderUsable(master, onDate))
    .filter((master) => !companyId || !master.tndCompanyId || master.tndCompanyId === companyId)
    .filter((master) => !branchId || !master.tndBranchId || master.tndBranchId === branchId)
    .filter((master) => EXPENSE_TENDER_CODES.has(typeCodeOf(master)))
    .sort(
      (left, right) =>
        left.tndDisplayPosition - right.tndDisplayPosition || left.tndName.localeCompare(right.tndName),
    )
    .map((master) => ({
      tenderId: master.tndId,
      name: master.tndName,
      typeId: Number.parseInt(master.tndTypeId, 10) || 0,
      typeCode: typeCodeOf(master),
      ledgerName: text(master.tndLedgerName),
    }));
}

/** The tender a new voucher starts on: the first CASH one offered. */
export function cashTenderOf(options: readonly ExpenseTenderOption[]): ExpenseTenderOption | null {
  return options.find((option) => option.typeCode === "CASH") ?? null;
}

export function isCashTender(options: readonly ExpenseTenderOption[], tenderId: string): boolean {
  return options.find((option) => option.tenderId === tenderId)?.typeCode === "CASH";
}

export type Choice = { value: string; label: string };

/**
 * A tender row's choices: the offered tenders, plus the row's own tender when
 * it is no longer offered — "a saved row's tender stays itself … never
 * silently the first master" (Qt).
 */
export function tenderChoices(options: readonly ExpenseTenderOption[], row: ExpenseTenderDraft): Choice[] {
  const choices: Choice[] = options.map((option) => ({ value: option.tenderId, label: option.name }));
  if (row.tenderId && !options.some((option) => option.tenderId === row.tenderId)) {
    choices.push({ value: row.tenderId, label: row.tenderName || "(saved tender)" });
  }
  return choices;
}
