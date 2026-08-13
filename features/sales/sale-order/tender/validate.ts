/**
 * Sale Tender — the gate list, in order. Pure: returns the FIRST failure and
 * where to send the cursor; the dialog does the focusing.
 *
 * Everything is judged on the **base** (what settles the document), never on
 * the gross — a card that carries a fee must be able to settle a full bill.
 *
 * **`tndDailyLimit` is deliberately absent.** It bounds a day's takings on that
 * tender across every counter, which this screen cannot see; the backend
 * enforces it on save. A wrong warning about a limit is worse than none.
 */
import { computeTenders, givesChange, type TenderPurpose } from "./arithmetic";
import type { TenderDraftRow } from "../sale-order.types";
import { rowIsPanelOwned } from "./rows";

export type TenderViolation = {
  message: string;
  /** The row key to focus, when the failure belongs to one. */
  focusRow?: string;
  /** `amount` | `refNo` | `bank` — which control on that row. */
  focusField?: "amount" | "refNo" | "bank";
};

export type TenderValidationContext = {
  purpose: TenderPurpose;
  documentAmount: number;
  /** `yyyy-mm-dd` — a cheque may not be dated before the document. */
  documentDate: string;
  /**
   * `sales.allow_excess_tender`. **No such row exists in `app_setting_def` on
   * this deployment** (checked), so it is off until someone seeds it — passed
   * in rather than read here, so the day it lands this module needs no change.
   */
  allowExcessTender?: boolean;
};

const EPSILON = 0.005;

function moneyText(value: number): string {
  return value.toFixed(2);
}

/**
 * The rows worth judging (and saving): a picked tender carrying money. A row
 * the operator never touched is not a failure, it is an untouched row.
 */
export function settledRows(rows: TenderDraftRow[]): TenderDraftRow[] {
  return rows.filter((row) => row.keyed > 0);
}

export function validateTenderRows(
  rows: TenderDraftRow[],
  context: TenderValidationContext,
): TenderViolation | null {
  const { purpose, documentAmount, documentDate } = context;
  const used = settledRows(rows);
  const computation = computeTenders(
    used.map((row) => ({
      key: row.key,
      keyed: row.keyed,
      allowChange: givesChange(row.allowChange, row.typeCode),
      surcharge: { perc: row.surchargePerc, flat: row.surchargeFlat },
    })),
    documentAmount,
  );
  const pricedByKey = new Map(computation.rows.map((row) => [row.key, row]));

  // 1 — settlement only. An advance is partial by definition and skips it.
  if (purpose === "settlement" && computation.totals.balance < -EPSILON) {
    return {
      message: "The bill is not fully tendered.",
      focusRow: used[0]?.key ?? rows[0]?.key,
      focusField: "amount",
    };
  }

  for (const row of used) {
    const priced = pricedByKey.get(row.key);
    const base = priced?.base ?? row.keyed;

    // A seeded fallback row has no master behind it, so nothing can be posted
    // against it however well it adds up.
    if (!row.tenderId) {
      return {
        message: `${row.tenderName} is not backed by the tender master — it cannot be saved.`,
        focusRow: row.key,
        focusField: "amount",
      };
    }

    // 2 — the master's floor.
    if (row.minAmount > 0 && base > 0 && base < row.minAmount - EPSILON) {
      return {
        message: `${row.tenderName} needs at least ${moneyText(row.minAmount)}.`,
        focusRow: row.key,
        focusField: "amount",
      };
    }

    // 3 — a tender that cannot hand change back may not exceed the document.
    // Judged on the BASE: a fee taking the gross past the bill is fine.
    if (
      !givesChange(row.allowChange, row.typeCode) &&
      documentAmount > 0 &&
      base > documentAmount + EPSILON &&
      !context.allowExcessTender
    ) {
      return {
        message: `${row.tenderName} cannot exceed the bill amount — it can't give change back.`,
        focusRow: row.key,
        focusField: "amount",
      };
    }

    // 4 — the reference. A CHEQUE is never exempt: a master row with the flag
    // off would otherwise leave no way to key one at all.
    const needsReference = row.needsRef || row.typeCode === "CHEQUE";
    if (needsReference && !(row.refNo ?? "").trim()) {
      return {
        message: `${row.tenderName} needs its ${referenceLabel(row.typeCode)}.`,
        focusRow: row.key,
        focusField: "refNo",
      };
    }

    // 5 — a cheque nobody can present is not a settlement.
    if (row.typeCode === "CHEQUE") {
      if (!(row.bankName ?? "").trim()) {
        return {
          message: `${row.tenderName} needs the bank the cheque is drawn on.`,
          focusRow: row.key,
          focusField: "bank",
        };
      }
      if (!row.instrumentDate) {
        return {
          message: `${row.tenderName} needs its cheque date.`,
          focusRow: row.key,
          focusField: "refNo",
        };
      }
      // `ck_apd_dates` — an instrument cannot mature before the day it arrived.
      if (documentDate && row.instrumentDate < documentDate) {
        return {
          message: "A cheque cannot be dated before the document.",
          focusRow: row.key,
          focusField: "refNo",
        };
      }
    }

    // 6 / 7 — the redemption rows are owned by panels that are not built yet
    // (phases 5 and 6). Until they are, money cannot be keyed onto them at all,
    // which is a stricter gate than the sum checks those phases will bring.
    if (rowIsPanelOwned(row)) {
      return {
        message: `${row.tenderName} is redeemed from its own panel, which is not available yet.`,
        focusRow: row.key,
        focusField: "amount",
      };
    }
  }

  return null;
}

/** The reference label a type asks under, for the gate-4 message. */
function referenceLabel(typeCode: string): string {
  switch (typeCode) {
    case "CARD":
      return "slip number";
    case "CHEQUE":
      return "cheque number";
    case "UPI":
      return "UTR number";
    case "WALLET":
      return "transaction reference";
    case "BANK":
      return "UTR / reference number";
    case "VOUCHER":
      return "voucher number";
    case "TEMP_CR":
      return "approver";
    case "RRN":
      return "RRN";
    default:
      return "reference";
  }
}
