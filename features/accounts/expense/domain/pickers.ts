/**
 * What the three pick lists offer: the EXPENSE reasons, the expense ledgers and
 * the tenders. Pure; the screen fetches, these decide.
 */
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { isTenderUsable, typeDefaultsOf } from "@/features/sales/sale-order/tender/rows";
import type {
  ExpenseLedgerOption,
  ExpenseLineDraft,
  ExpenseQuickReason,
  ExpenseTenderDraft,
  ExpenseTenderOption,
} from "../expense.types";

type Json = Record<string, unknown>;

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function flag(value: unknown): boolean {
  return value === true || value === "true" || value === "t" || value === 1;
}

/**
 * Grid 134 "MAIN LIST - TILL REASONS" rows → the quick-reasons' shape.
 *
 * Qt reads the reasons from this grid, not from `/expenses/quick-reasons`: that
 * route lists a shipped reason BESIDE the company's own copy of it, while the
 * grid (asked with `iinactive = false`) leaves the replaced one out. A ledger
 * since deleted reads as none — the grid's `ledger_name` is blank for it — as
 * quick-reasons does. A cap of 0 is "no cap".
 */
export function reasonsFromGridRows(rows: readonly Json[]): ExpenseQuickReason[] {
  return rows
    .filter((row) => text(row.trs_id) !== "")
    .filter((row) => !row.trs_category || text(row.trs_category).toUpperCase() === "EXPENSE")
    .map((row) => {
      const ledgerName = text(row.ledger_name);
      const cap = Number(row.trs_max_amount);
      return {
        reasonId: text(row.trs_id),
        code: text(row.trs_code),
        name: text(row.trs_name),
        ledgerId: ledgerName ? text(row.trs_ledger_id) || null : null,
        ledgerName: ledgerName || null,
        needsNote: flag(row.trs_needs_note),
        needsRef: flag(row.trs_needs_ref),
        maxAmount: Number.isFinite(cap) && cap > 0 ? cap : null,
      };
    });
}

/** `/expenses/quick-reasons` rows, read defensively — the fallback when grid 134 cannot run. */
export function reasonsFromQuickReasons(rows: readonly Json[]): ExpenseQuickReason[] {
  return rows
    .filter((row) => text(row.reasonId) !== "")
    .map((row) => {
      const cap = Number(row.maxAmount);
      return {
        reasonId: text(row.reasonId),
        code: text(row.code),
        name: text(row.name),
        ledgerId: text(row.ledgerId) || null,
        ledgerName: text(row.ledgerName) || null,
        needsNote: flag(row.needsNote),
        needsRef: flag(row.needsRef),
        maxAmount: Number.isFinite(cap) && cap > 0 ? cap : null,
      };
    });
}

/** `/expenses/ledger-pick` rows, read defensively. */
export function ledgersFromPick(rows: readonly Json[]): ExpenseLedgerOption[] {
  return rows
    .filter((row) => text(row.ledgerId) !== "")
    .map((row) => ({
      ledgerId: text(row.ledgerId),
      name: text(row.name),
      groupName: text(row.groupName),
      taxId: text(row.taxId) || null,
      itcEligibility: text(row.itcEligibility) || null,
    }));
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
 * A line's Reason choices: "—" (none), the reasons, and — when the line
 * carries a reason the list does not (yet) hold — that one, so a loaded line
 * never silently loses it (Qt "(saved reason)").
 */
export function reasonChoices(reasons: readonly ExpenseQuickReason[], line: ExpenseLineDraft): Choice[] {
  const choices: Choice[] = [{ value: "", label: "—" }];
  for (const reason of reasons) {
    choices.push({ value: reason.reasonId, label: reason.name });
  }
  if (line.reasonId && !reasons.some((reason) => reason.reasonId === line.reasonId)) {
    choices.push({ value: line.reasonId, label: "(saved reason)" });
  }
  return choices;
}

/**
 * A line's ledger choices: the ledger-pick list, plus the line's own ledger
 * when the list does not hold it (a loaded line before the list arrives, or a
 * ledger since moved out of the Expenses groups — the server says which).
 */
export function ledgerChoices(ledgers: readonly ExpenseLedgerOption[], line: ExpenseLineDraft): Choice[] {
  const choices: Choice[] = ledgers.map((ledger) => ({ value: ledger.ledgerId, label: ledger.name }));
  if (line.ledgerId && !ledgers.some((ledger) => ledger.ledgerId === line.ledgerId)) {
    choices.push({ value: line.ledgerId, label: line.ledgerName || "(saved ledger)" });
  }
  return choices;
}

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
