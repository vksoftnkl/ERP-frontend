/**
 * Quotation Entry — save validation. Pure, first violation wins, and it always
 * names something the operator can be sent to.
 */
import type { DocumentPricing } from "@/domain/pricing";
import { SESSION_CAPABILITIES } from "./quotation.constants";
import type { QuotationDraft, Violation } from "./quotation.types";
import { accountingYearOf, isRealDate } from "./quotation.utils";

export type ValidationContext = {
  /** Operator may quote above MRP. No source for this on the wire yet. */
  skipMrp?: boolean;
};

/**
 * The role gate. For each of FREIGHT / LOADING / UNLOADING: if the header
 * checkbox is on, the policy is not MANUAL, and the lines actually compute a
 * positive amount, then a charge row carrying that role must exist — because a
 * role override whose row is missing is dropped on the floor, and without this
 * gate the operator saves a quotation whose freight the customer is never
 * billed for.
 */
function roleGate(draft: QuotationDraft, pricing: DocumentPricing): Violation | null {
  const isManual = (calcType: string) => calcType.trim().toUpperCase() === "MANUAL";
  const hasRole = (role: string) => draft.charges.some((row) => row.role === role && row.chgId);

  const computedFreight = pricing.lines.reduce((total, line) => total + line.freightAmt, 0);
  if (draft.header.hasFreight && !isManual(draft.policy.freightCalcType) && computedFreight > 0) {
    if (!hasRole("FREIGHT")) {
      return {
        message:
          "Freight is switched on and the lines compute a freight amount, but no charge row carries the FREIGHT role — the customer would never be billed for it.",
        field: "charges",
      };
    }
  }

  const computedLoading = pricing.lines.reduce((total, line) => total + line.loadingAmt, 0);
  if (draft.header.hasLoad && !isManual(draft.policy.loadingCalcType) && computedLoading > 0) {
    if (!hasRole("LOADING")) {
      return {
        message:
          "Loading is switched on and the lines compute a loading amount, but no charge row carries the LOADING role.",
        field: "charges",
      };
    }
  }

  // UNLOADING has no per-line column on this screen, so it can never compute a
  // positive amount and the gate can never fire for it. The check is written out
  // rather than omitted so that adding the column later cannot silently skip it.
  const computedUnloading = 0;
  if (draft.header.hasUnload && !isManual(draft.policy.loadingCalcType) && computedUnloading > 0) {
    if (!hasRole("UNLOADING")) {
      return {
        message:
          "Unloading is switched on and the lines compute an unloading amount, but no charge row carries the UNLOADING role.",
        field: "charges",
      };
    }
  }

  return null;
}

export function validateSaveInputs(
  draft: QuotationDraft,
  pricing: DocumentPricing,
  context: ValidationContext = {},
): Violation | null {
  // Checked before the mode gate, because "press Edit" is not advice a deleted
  // document can act on — Edit refuses it too. An update would either resurrect
  // a deleted quotation or be rejected server-side; Copy as new is the way out.
  if (draft.isDeleted) {
    return {
      message:
        "This quotation is deleted and cannot be changed. Use Copy as new (F9) to raise a fresh one from it.",
      field: "mode",
    };
  }

  if (draft.mode !== "entry") {
    return {
      message: "This quotation is read-only — press Edit to change it.",
      field: "mode",
    };
  }

  // The NAME is what the document needs, not a master record: `sqCustName` is
  // required by the save DTO while `sqCustId` is optional, so a walk-in keyed
  // straight into the customer fields is a legitimate quotation.
  if (!draft.customer.name.trim()) {
    return { message: "Enter a customer name, or pick one from the list.", field: "customer" };
  }

  if (!isRealDate(draft.header.quoteDate)) {
    return { message: "The quotation date is not a real calendar date.", field: "quoteDate" };
  }

  // `sqAccYear` is immutable after create and is part of the voucher sequence's
  // period key, so a quote date that falls outside the document's accounting
  // year would number the voucher into the wrong year for good.
  const derivedAccYear = accountingYearOf(draft.header.quoteDate);
  if (draft.accYear && derivedAccYear && derivedAccYear !== draft.accYear) {
    return {
      message: `The quotation date falls in ${derivedAccYear}, but this document belongs to ${draft.accYear}. Change the date, or switch the accounting year first.`,
      field: "quoteDate",
    };
  }

  if (draft.header.validUntil) {
    if (!isRealDate(draft.header.validUntil)) {
      return { message: "The validity date is not a real calendar date.", field: "validUntil" };
    }
    if (draft.header.validUntil < draft.header.quoteDate) {
      return {
        message: "The quotation cannot expire before the day it was raised.",
        field: "validUntil",
      };
    }
  }

  const skipMrp = context.skipMrp ?? SESSION_CAPABILITIES.skipMrp;
  let populated = 0;

  for (let index = 0; index < draft.lines.length; index += 1) {
    const line = draft.lines[index];
    if (!line.itemId) {
      continue;
    }
    populated += 1;

    if (line.billQty === 0) {
      return {
        message: `${line.itemName || "This line"} has no quantity.`,
        field: "billQty",
        lineKey: line.key,
      };
    }
    if (line.rate === 0 && !line.isFree) {
      return {
        message: `${line.itemName || "This line"} has no rate. Mark it free if that is intended.`,
        field: "rate",
        lineKey: line.key,
      };
    }
    if (line.minPrice > 0 && line.rate < line.minPrice) {
      return {
        message: `${line.itemName || "This line"} is below its minimum price of ${line.minPrice}.`,
        field: "rate",
        lineKey: line.key,
      };
    }
    if (!skipMrp && line.mrp > 0 && line.rate > line.mrp) {
      return {
        message: `${line.itemName || "This line"} is above its MRP of ${line.mrp}.`,
        field: "rate",
        lineKey: line.key,
      };
    }
  }

  if (populated === 0) {
    return { message: "Add at least one item.", field: "items" };
  }

  for (const row of draft.charges) {
    if (!row.chgId) {
      continue;
    }
    // `cd_ledger_code` is NOT NULL with no server-side default: a charge row
    // without a posting ledger fails the save with a 404, not a field error.
    if (!row.ledgerCode) {
      return {
        message: `The charge "${row.chgName || "(unnamed)"}" has no posting ledger and cannot be saved.`,
        field: "charges",
      };
    }
  }

  return roleGate(draft, pricing);
}

/**
 * The live, non-blocking warning the rate cell raises as it is keyed. Separate
 * from `validateSaveInputs` because it fires on every keystroke and must not
 * mention anything the operator has not touched yet.
 */
export function rateWarning(
  rate: number,
  minPrice: number,
  mrp: number,
  skipMrp: boolean = SESSION_CAPABILITIES.skipMrp,
): string | null {
  if (minPrice > 0 && rate > 0 && rate < minPrice) {
    return `Below the minimum price of ${minPrice}.`;
  }
  if (!skipMrp && mrp > 0 && rate > mrp) {
    return `Above the MRP of ${mrp}.`;
  }
  return null;
}
