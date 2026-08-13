/**
 * Sale Order — tender rows: the tender-type default table and the translation
 * from `acc_tender_master` rows to the dialog's draft rows. Pure.
 *
 * The type-default table mirrors the seeded `accounts.acc_tender_types` exactly
 * (11 rows). It has to live client-side for now: the tender-type REST module
 * exposes no `/list`, and its GET omits the behaviour columns — so the master's
 * nullable `tndNeedsRef` / `tndAllowChange` / `tndAllowInReturn` overrides can
 * only be resolved against this copy. Drop it the day the endpoint returns the
 * type's own columns (the plan's §5.2).
 */
import type { TenderMasterRow, TenderDraftRow } from "../sale-order.types";
import { givesChange, type TenderPurpose } from "./arithmetic";
import type { TenderTypeCode } from "./instruments";

export type TenderTypeDefaults = {
  code: TenderTypeCode;
  displayName: string;
  isCash: boolean;
  needsRef: boolean;
  refLabel: string | null;
  saleOnly: boolean;
  allowChange: boolean;
  allowInReturn: boolean;
  displayOrder: number;
};

/** Keyed by `ttm_type_id`. Mirrors migration 20260731080000 verbatim. */
export const TENDER_TYPE_DEFAULTS: Record<number, TenderTypeDefaults> = {
  1: { code: "CASH", displayName: "Cash", isCash: true, needsRef: false, refLabel: null, saleOnly: false, allowChange: true, allowInReturn: true, displayOrder: 10 },
  2: { code: "CARD", displayName: "Card", isCash: false, needsRef: true, refLabel: "Card Last 4", saleOnly: false, allowChange: false, allowInReturn: true, displayOrder: 20 },
  3: { code: "UPI", displayName: "UPI", isCash: false, needsRef: true, refLabel: "UTR No", saleOnly: false, allowChange: false, allowInReturn: true, displayOrder: 30 },
  4: { code: "WALLET", displayName: "Wallet", isCash: false, needsRef: true, refLabel: "Txn Ref", saleOnly: false, allowChange: false, allowInReturn: true, displayOrder: 40 },
  5: { code: "CHEQUE", displayName: "Cheque", isCash: false, needsRef: true, refLabel: "Cheque No", saleOnly: false, allowChange: false, allowInReturn: true, displayOrder: 50 },
  6: { code: "BANK", displayName: "Bank Transfer", isCash: false, needsRef: true, refLabel: "UTR / Ref No", saleOnly: false, allowChange: false, allowInReturn: true, displayOrder: 60 },
  7: { code: "RRN", displayName: "RRN", isCash: false, needsRef: true, refLabel: "RRN", saleOnly: true, allowChange: false, allowInReturn: false, displayOrder: 70 },
  8: { code: "TEMP_CR", displayName: "Temporary Credit", isCash: false, needsRef: true, refLabel: "Approved By", saleOnly: true, allowChange: false, allowInReturn: false, displayOrder: 80 },
  9: { code: "CREDIT", displayName: "Credit", isCash: false, needsRef: false, refLabel: null, saleOnly: true, allowChange: false, allowInReturn: false, displayOrder: 90 },
  10: { code: "LOYALTY", displayName: "Loyalty Points", isCash: false, needsRef: false, refLabel: null, saleOnly: true, allowChange: false, allowInReturn: false, displayOrder: 100 },
  11: { code: "VOUCHER", displayName: "Gift Voucher", isCash: false, needsRef: true, refLabel: "Voucher No", saleOnly: true, allowChange: false, allowInReturn: false, displayOrder: 110 },
};

/** CHEQUE's fixed id — the PDC register keys on `tdTenderTypeId === 5`. */
export const CHEQUE_TENDER_TYPE_ID = 5;

/**
 * Why these four never appear on an advance (the plan's §5): a credit note
 * closes out against an invoice and loyalty is earned on the bill that moves
 * the goods — neither exists yet; CREDIT and TEMP_CR collect nothing, and an
 * uncollected order simply carries a balance.
 */
const ADVANCE_EXCLUDED_TYPES: ReadonlySet<TenderTypeCode> = new Set([
  "RRN",
  "LOYALTY",
  "CREDIT",
  "TEMP_CR",
]);

export function typeDefaultsOf(typeId: number): TenderTypeDefaults {
  return (
    TENDER_TYPE_DEFAULTS[typeId] ?? {
      code: "CASH",
      displayName: `Type ${typeId}`,
      isCash: false,
      needsRef: false,
      refLabel: null,
      saleOnly: false,
      allowChange: false,
      allowInReturn: false,
      displayOrder: 999,
    }
  );
}

/**
 * Whether a master row is usable on this document: active, not deleted, and
 * effective ON THE DOCUMENT DATE — a back-dated order settles under the tenders
 * that were live that day, not today's.
 */
export function isTenderUsable(row: TenderMasterRow, documentDate: string): boolean {
  if (row.tndIsActive !== true || row.tndIsDeleted === true) {
    return false;
  }
  if (row.tndEffectiveFrom && documentDate && row.tndEffectiveFrom > documentDate) {
    return false;
  }
  if (row.tndEffectiveTo && documentDate && row.tndEffectiveTo < documentDate) {
    return false;
  }
  return true;
}

/** The rows the dialog offers for a purpose, in display order. */
export function usableTenders(
  rows: TenderMasterRow[],
  documentDate: string,
  purpose: TenderPurpose,
): TenderMasterRow[] {
  return rows
    .filter((row) => isTenderUsable(row, documentDate))
    .filter((row) => {
      if (purpose === "settlement") {
        return true;
      }
      const code = typeDefaultsOf(Number.parseInt(row.tndTypeId, 10) || 0).code;
      return !ADVANCE_EXCLUDED_TYPES.has(code);
    })
    .sort(
      (left, right) =>
        left.tndDisplayPosition - right.tndDisplayPosition ||
        left.tndName.localeCompare(right.tndName),
    );
}

let tenderRowSequence = 0;
function nextTenderKey(): string {
  tenderRowSequence += 1;
  return `tender-${tenderRowSequence}`;
}

/**
 * Build a dialog row from a master row. The three nullable behaviour flags are
 * OVERRIDES of the type's defaults — null / undefined means inherit, never
 * false. (`row.tndAllowChange === null` on a CASH master must still hand out
 * change.)
 */
export function tenderRowFromMaster(master: TenderMasterRow, position = 0): TenderDraftRow {
  const typeId = Number.parseInt(master.tndTypeId, 10) || 0;
  const defaults = typeDefaultsOf(typeId);
  // `{}` / null on the three behaviour flags means INHERIT the type's default,
  // never false — `Boolean(master.tndAllowChange)` is the classic way to stop
  // cash giving change (the plan's §3.1).
  const allowChange = master.tndAllowChange ?? defaults.allowChange;
  return {
    key: nextTenderKey(),
    tdId: null,
    tenderId: master.tndId,
    tenderTypeId: typeId,
    typeCode: defaults.code,
    tenderName: master.tndName,
    tenderLedgerId: master.tndLedgerId || null,
    settleLedgerId: master.tndSettlementLedgerId,
    surchargeLedgerId: master.tndSurchargeLedgerId,
    surchargePerc: master.tndSurchargePerc || 0,
    surchargeFlat: master.tndSurchargeAmount || 0,
    settlementDays: master.tndSettlementDays || 0,
    minAmount: master.tndMinAmount || 0,
    maxAmount: master.tndMaxAmount ?? null,
    conversionRate: master.tndConversionRate || 1,
    editSurcharge: master.tndEditSurcharge === true,
    // CASH gives change whatever the master says (the plan's §11).
    allowChange: givesChange(allowChange, defaults.code),
    needsRef: master.tndNeedsRef ?? defaults.needsRef,
    hotkey: hotkeyFor(master.tndHotkey, position),
    keyed: 0,
    settleStatus: "NA",
    refNo: null,
    authCode: null,
    bankName: null,
    cardDigits: null,
    instrumentDate: null,
    notes: null,
  };
}

/** `A`…`L` by position when the master names no hotkey of its own. */
const POSITIONAL_HOTKEYS = "ABCDEFGHIJKL";

export function hotkeyFor(masterHotkey: string | null | undefined, position: number): string | null {
  const keyed = (masterHotkey ?? "").trim();
  if (keyed) {
    return keyed.slice(0, 1).toUpperCase();
  }
  return POSITIONAL_HOTKEYS[position] ?? null;
}

/**
 * Whether the cursor may LAND on this row when the dialog opens. A cash-only
 * customer's CREDIT row stays keyable — using it just asks first (the plan's
 * §8) — but suggesting it would be strange. Keyable and suggested are
 * different things.
 */
export function rowIsUsable(row: TenderDraftRow, creditAllowed: boolean): boolean {
  if (row.typeCode === "CREDIT") {
    return creditAllowed;
  }
  // The two redemption rows are owned by their panels, which are not built yet
  // (phases 5 and 6); until then they are shown read-only rather than hidden.
  return row.typeCode !== "RRN" && row.typeCode !== "LOYALTY";
}

/** A row whose amount belongs to a panel, not to the amount cell (§4.2). */
export function rowIsPanelOwned(row: TenderDraftRow): boolean {
  return row.typeCode === "RRN" || row.typeCode === "LOYALTY";
}

/**
 * Why the dialog is running on seeded rows rather than the master's own.
 * Three failure shapes, three different sentences — a screen offering one
 * tender when the shop has six is a fault to be FIXED in the master, not a
 * layout the operator should quietly get used to (the plan's §3.2).
 */
export type TenderFallbackReason = "unavailable" | "empty" | "none-offerable";

export function fallbackReasonMessage(
  reason: TenderFallbackReason,
  detail?: string,
): string {
  switch (reason) {
    case "unavailable":
      return `Tender master unavailable${detail ? ` (${detail})` : ""} — only cash can be taken.`;
    case "empty":
      return "No tender is configured — add one in the Tender Master.";
    default:
      return "No configured tender can be used here — check the Tender Master's active dates.";
  }
}

/**
 * The degraded dialog: CASH always, CREDIT too in settlement mode, seeded by
 * hand with no ledger — the backend resolves that. These rows carry no master
 * id, so `validate` refuses to save money keyed on them; they exist so the
 * counter can still see and split a payment while the master is down.
 */
export function fallbackTenderRows(purpose: TenderPurpose): TenderDraftRow[] {
  const cash: TenderDraftRow = {
    key: nextTenderKey(),
    tdId: null,
    tenderId: "",
    tenderTypeId: 1,
    typeCode: "CASH",
    tenderName: "Cash",
    tenderLedgerId: null,
    settleLedgerId: null,
    surchargeLedgerId: null,
    surchargePerc: 0,
    surchargeFlat: 0,
    settlementDays: 0,
    minAmount: 0,
    maxAmount: null,
    conversionRate: 1,
    editSurcharge: false,
    allowChange: true,
    needsRef: false,
    hotkey: "A",
    keyed: 0,
    settleStatus: "NA",
    refNo: null,
    authCode: null,
    bankName: null,
    cardDigits: null,
    instrumentDate: null,
    notes: null,
  };
  if (purpose !== "settlement") {
    return [cash];
  }
  return [
    cash,
    {
      ...cash,
      key: nextTenderKey(),
      tenderTypeId: 9,
      typeCode: "CREDIT",
      tenderName: "Credit",
      allowChange: false,
      hotkey: "B",
    },
  ];
}
